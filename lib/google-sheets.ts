/**
 * Google Sheets push integration — Phase 2 Workstream 2.
 *
 * Pushes wizard-created sales to per-shopper Google Sheets. Sheets is a
 * working/reporting layer, NOT the source of truth — the DB is. This module
 * is fire-and-forget: failures are logged but never thrown back to the caller,
 * so a Sheets outage cannot block invoice creation.
 *
 * Architecture:
 *   - Service account auth via base64-encoded JSON key in GOOGLE_SERVICE_ACCOUNT_KEY_B64
 *   - Per-shopper sheet IDs in env vars (SHEET_ID_HOPE, SHEET_ID_MC, SHEET_ID_TEST)
 *   - Each month gets its own tab ("April 2026"). Tabs are created lazily on
 *     first push of the month, with headers + frozen header row.
 *   - One row per LINE ITEM (not per sale). Multi-item invoices push N rows.
 *   - Formulas in I, J, K, T, U, V columns reference their own row, so we
 *     append the data with placeholder zeros first, then UPDATE the formula
 *     cells with the real row numbers (two API calls per push, regardless of
 *     line count).
 */

import { google, sheets_v4 } from "googleapis";
import * as logger from "@/lib/logger";
import {
  buildRowsFromSale,
  getMonthTabLabel,
  SHEET_HEADERS,
  COLUMN_COUNT,
  type LineItemWithSupplier,
  type SaleWithRelations,
} from "@/lib/google-sheets-mapping";

// ============================================================================
// AUTH CLIENT (lazy + cached)
// ============================================================================

let cachedSheetsClient: sheets_v4.Sheets | null = null;

function getSheetsClient(): sheets_v4.Sheets {
  if (cachedSheetsClient) return cachedSheetsClient;

  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!keyB64) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_B64 not set — Sheets integration unavailable"
    );
  }

  let credentials: { client_email: string; private_key: string };
  try {
    const keyJson = Buffer.from(keyB64, "base64").toString("utf-8");
    credentials = JSON.parse(keyJson);
  } catch (err) {
    throw new Error(
      `Failed to decode GOOGLE_SERVICE_ACCOUNT_KEY_B64: ${
        err instanceof Error ? err.message : "unknown"
      }`
    );
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedSheetsClient = google.sheets({ version: "v4", auth });
  return cachedSheetsClient;
}

// ============================================================================
// SHOPPER → SHEET ID RESOLUTION
// ============================================================================

/**
 * Resolves a shopper name to a Google Sheet ID via env vars.
 *
 * In non-production environments, ALL shoppers map to SHEET_ID_TEST so dev
 * work doesn't pollute Hope's or MC's real sheets.
 *
 * Returns null if no mapping exists — the push is then skipped (logged).
 */
export function getSheetIdForShopper(shopperName: string): string | null {
  // Dev / preview / local: everything goes to the test sheet
  if (process.env.NODE_ENV !== "production") {
    return process.env.SHEET_ID_TEST || null;
  }

  // Production: per-shopper map. Match on lowercased prefix so minor
  // capitalisation differences ("Hope Kavanagh" vs "hope kavanagh") still hit.
  const normalized = shopperName.trim().toLowerCase();
  if (normalized.startsWith("hope")) return process.env.SHEET_ID_HOPE || null;
  if (normalized.startsWith("mc") || normalized.includes("oyesilbelde")) {
    return process.env.SHEET_ID_MC || null;
  }
  return null;
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

/**
 * Per-invocation cache of (sheetId, tabName) → known-to-exist. Avoids
 * round-trips when multiple sales push to the same tab in the same warm
 * serverless instance.
 */
const tabExistenceCache = new Map<string, Set<string>>();

function rememberTabExists(sheetId: string, tabName: string): void {
  let set = tabExistenceCache.get(sheetId);
  if (!set) {
    set = new Set();
    tabExistenceCache.set(sheetId, set);
  }
  set.add(tabName);
}

function knownTabExists(sheetId: string, tabName: string): boolean {
  return tabExistenceCache.get(sheetId)?.has(tabName) ?? false;
}

/**
 * Ensures the named tab exists in the sheet. If missing, creates it with
 * a header row and freezes that row.
 *
 * @returns the numeric sheetId (gid) of the tab, used downstream for
 *          range-based operations like checkbox formatting
 */
async function ensureMonthTab(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string
): Promise<number> {
  // Check spreadsheet metadata for existing tab
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  const existing = meta.data.sheets?.find(
    (s) => s.properties?.title === tabName
  );

  if (existing?.properties?.sheetId != null) {
    rememberTabExists(spreadsheetId, tabName);
    return existing.properties.sheetId;
  }

  // Create the tab
  logger.info("SHEETS", "Creating new month tab", { spreadsheetId, tabName });
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: {
                frozenRowCount: 1,
                columnCount: COLUMN_COUNT,
              },
            },
          },
        },
      ],
    },
  });

  const newSheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (newSheetId == null) {
    throw new Error(`Failed to create tab "${tabName}" — no sheetId returned`);
  }

  // Write the header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(SHEET_HEADERS)],
    },
  });

  // Bold the header row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: newSheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    },
  });

  rememberTabExists(spreadsheetId, tabName);
  return newSheetId;
}

// ============================================================================
// APPEND + FORMULA PATCH
// ============================================================================

/**
 * Parses a Sheets API updatedRange string (e.g. "'April 2026'!A47:Y49") and
 * returns the start row number (47 in the example).
 */
function parseStartRowFromUpdatedRange(updatedRange: string): number | null {
  // Match the row digit immediately after the column letters in the start cell
  const match = updatedRange.match(/!([A-Z]+)(\d+):/);
  if (!match) return null;
  return parseInt(match[2], 10);
}

/**
 * Appends N rows for a sale to the named tab, then patches formula cells with
 * the actual row numbers.
 *
 * Two-step process:
 *   1. append() with placeholder zeros for I, J, K, T, U, V — gets us the
 *      actual start row from the response
 *   2. update() the formula cells using the resolved row numbers
 */
async function appendSaleRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  sale: SaleWithRelations,
  lineItems: LineItemWithSupplier[]
): Promise<{ startRow: number; rowCount: number }> {
  // Step 1: append with placeholder row numbers (we don't know the real ones yet).
  // We pass row number 1 as a stand-in — the formulas will be overwritten in step 2.
  const placeholderRows = buildRowsFromSale(sale, lineItems, 1);

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A:Y`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: placeholderRows,
    },
  });

  const updatedRange = appendRes.data.updates?.updatedRange;
  if (!updatedRange) {
    throw new Error("append response did not include updatedRange");
  }

  const startRow = parseStartRowFromUpdatedRange(updatedRange);
  if (startRow == null) {
    throw new Error(`Could not parse start row from "${updatedRange}"`);
  }

  // Step 2: rebuild rows with the real row numbers and patch the formula cells.
  // We patch all 25 columns (not just the formula cells) to keep the code
  // simple — overwriting non-formula cells with the same values is harmless
  // and avoids per-cell range arithmetic.
  const realRows = buildRowsFromSale(sale, lineItems, startRow);
  const endRow = startRow + realRows.length - 1;
  const updateRange = `'${tabName}'!A${startRow}:Y${endRow}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: updateRange,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: realRows,
    },
  });

  return { startRow, rowCount: realRows.length };
}

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export interface PushSaleParams {
  sale: SaleWithRelations;
  lineItems: LineItemWithSupplier[];
  shopperName: string;
}

export interface PushSaleResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  spreadsheetId?: string;
  tabName?: string;
  startRow?: number;
  rowCount?: number;
}

/**
 * Top-level orchestrator. Resolves shopper → sheet, ensures month tab exists,
 * appends rows. NEVER throws — all errors are caught, logged, and returned in
 * the result so callers can decide what to do (typically: log to errors table
 * and continue).
 */
export async function pushSaleToShopperSheet(
  params: PushSaleParams
): Promise<PushSaleResult> {
  const { sale, lineItems, shopperName } = params;

  try {
    const spreadsheetId = getSheetIdForShopper(shopperName);
    if (!spreadsheetId) {
      logger.warn("SHEETS", "No sheet mapping for shopper, skipping push", {
        shopperName,
        env: process.env.NODE_ENV,
      });
      return { success: true, skipped: true, reason: "no-sheet-mapping" };
    }

    const tabName = getMonthTabLabel(sale.saleDate);
    const sheets = getSheetsClient();

    // Ensure tab exists (cached per invocation)
    if (!knownTabExists(spreadsheetId, tabName)) {
      await ensureMonthTab(sheets, spreadsheetId, tabName);
    }

    const { startRow, rowCount } = await appendSaleRows(
      sheets,
      spreadsheetId,
      tabName,
      sale,
      lineItems
    );

    logger.info("SHEETS", "Sale pushed to sheet", {
      saleId: sale.id,
      invoiceNumber: sale.xeroInvoiceNumber,
      shopperName,
      spreadsheetId,
      tabName,
      startRow,
      rowCount,
    });

    return {
      success: true,
      spreadsheetId,
      tabName,
      startRow,
      rowCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("SHEETS", "Push failed (non-fatal)", {
      saleId: sale.id,
      invoiceNumber: sale.xeroInvoiceNumber,
      shopperName,
      error: message,
    });
    return { success: false, reason: message };
  }
}
