/**
 * Google Sheets push integration — Phase 2 Workstream 2.
 *
 * Pushes wizard-created sales to one or more Google Sheets. Sheets is a
 * working/reporting layer, NOT the source of truth — the DB is. This module
 * is fire-and-forget: failures are logged but never thrown back to the caller,
 * so a Sheets outage cannot block invoice creation.
 *
 * Architecture:
 *   - Service account auth via base64-encoded JSON key in GOOGLE_SERVICE_ACCOUNT_KEY_B64
 *   - Per-shopper sheet IDs in env vars (SHEET_ID_HOPE, SHEET_ID_MC,
 *     SHEET_ID_MASTER, SHEET_ID_TEST)
 *   - Each month gets its own tab ("April 2026"). Tabs are created lazily on
 *     first push of the month, with headers + frozen header row.
 *   - One row per LINE ITEM (not per sale). Multi-item invoices push N rows.
 *   - Formulas in I, J, K, T, U, V columns reference their own row, so we
 *     append the data with placeholder zeros first, then UPDATE the formula
 *     cells with the real row numbers (two API calls per push, regardless of
 *     line count).
 *
 * Fan-out:
 *   In production, every sale lands on SHEET_ID_MASTER, AND on the matched
 *   per-shopper sheet (SHEET_ID_HOPE for Hope, SHEET_ID_MC for MC). Sales
 *   from Sophie/Alys/unmapped land on master only. Each leg is independent —
 *   a failure on the per-shopper leg never aborts the master write, and vice
 *   versa. In non-production, everything goes to SHEET_ID_TEST as a single
 *   leg.
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
 * Resolves a shopper name to ALL the Google Sheets a sale should fan out to.
 *
 * Returns a list (in push order) of spreadsheet IDs:
 *
 *   - non-production → [SHEET_ID_TEST]   (dev work doesn't touch real sheets)
 *   - production:
 *       - Hope         → [SHEET_ID_MASTER, SHEET_ID_HOPE]
 *       - MC           → [SHEET_ID_MASTER, SHEET_ID_MC]
 *       - Sophie/Alys/ → [SHEET_ID_MASTER]
 *         unmapped
 *
 * Any env var that's missing is silently dropped from the list — so a
 * misconfigured deploy returns the legs that ARE configured, rather than
 * failing closed. Returns an empty array only when nothing is configured.
 *
 * Name matching is lowercased substring match so minor variations ("Mary
 * Clair" vs "Mary Clair Bromfield" vs the literal "MC") all route correctly.
 */
export function getSheetIdsForShopper(shopperName: string): string[] {
  // Dev / preview / local: everything goes to the test sheet
  if (process.env.NODE_ENV !== "production") {
    const id = process.env.SHEET_ID_TEST;
    return id ? [id] : [];
  }

  const ids: string[] = [];

  // Master leg — every production sale lands here. Drives DB row tracking.
  if (process.env.SHEET_ID_MASTER) ids.push(process.env.SHEET_ID_MASTER);

  // Per-shopper leg(s)
  const normalized = shopperName.trim().toLowerCase();
  if (normalized.includes("hope") && process.env.SHEET_ID_HOPE) {
    ids.push(process.env.SHEET_ID_HOPE);
  }
  if (
    (normalized.includes("mary clair") ||
      normalized === "mc" ||
      normalized.startsWith("mc ") ||
      normalized.includes("oyesilbelde")) &&
    process.env.SHEET_ID_MC
  ) {
    ids.push(process.env.SHEET_ID_MC);
  }

  return ids;
}

/**
 * @deprecated Prefer {@link getSheetIdsForShopper} — sales now fan out to
 * master + per-shopper sheets in production. This singular form preserves the
 * "per-shopper if applicable, else master" behaviour for any niche caller
 * that genuinely wants one sheet ID. Internal pipeline code should not use it.
 */
export function getSheetIdForShopper(shopperName: string): string | null {
  const ids = getSheetIdsForShopper(shopperName);
  const masterId = process.env.SHEET_ID_MASTER;
  return ids.find((id) => id !== masterId) ?? masterId ?? null;
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
 * Parses a Sheets API updatedRange string (e.g. "'April 2026'!A47:Z49") and
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
 *   1. append() with placeholder row 1 — gets us the actual start row from
 *      the response
 *   2. update() the same range with the real formulas using the resolved
 *      row numbers
 */
async function appendSaleRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  sale: SaleWithRelations,
  lineItems: LineItemWithSupplier[],
  shopperName: string
): Promise<{ startRow: number; rowCount: number }> {
  // Step 1: append with placeholder row numbers (we don't know the real ones yet).
  // We pass row number 1 as a stand-in — the formulas will be overwritten in step 2.
  const placeholderRows = buildRowsFromSale(sale, lineItems, shopperName, 1);

  const appendRes = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabName}'!A:Z`,
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
  // We patch all 26 columns (not just the formula cells) to keep the code
  // simple — overwriting non-formula cells with the same values is harmless
  // and avoids per-cell range arithmetic.
  const realRows = buildRowsFromSale(sale, lineItems, shopperName, startRow);
  const endRow = startRow + realRows.length - 1;
  const updateRange = `'${tabName}'!A${startRow}:Z${endRow}`;

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
// PUBLIC ENTRY POINT — FAN-OUT PUSH
// ============================================================================

export interface PushSaleParams {
  sale: SaleWithRelations;
  lineItems: LineItemWithSupplier[];
  shopperName: string;
}

/** One sheet's worth of outcome inside a fan-out push or update. */
export interface SheetLegResult {
  spreadsheetId: string;
  success: boolean;
  startRow?: number;
  tabName?: string;
  rowCount?: number;
  reason?: string;
}

export interface PushSaleResult {
  /**
   * True iff the master leg succeeded — or, in non-prod where there is no
   * master, the single configured leg. Per-shopper-leg failures DO NOT flip
   * this to false; they show up in `legs` and the caller logs them.
   * `success: true, skipped: true` means no sheet IDs were configured.
   */
  success: boolean;
  skipped?: boolean;
  reason?: string;
  /** Master leg's start row. Persist to `sales.sheetsRowNumber`. */
  masterStartRow?: number;
  /** Master leg's tab name. Persist to `sales.sheetsTabName`. */
  masterTabName?: string;
  /** Per-leg breakdown. Caller iterates this to log failures. */
  legs: SheetLegResult[];
}

/**
 * Push the sale's rows to one specific sheet. Returns a per-leg result;
 * never throws (errors are caught, logged, and reported as a failed leg).
 */
async function pushSaleToOneSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sale: SaleWithRelations,
  lineItems: LineItemWithSupplier[],
  shopperName: string
): Promise<SheetLegResult> {
  try {
    const tabName = getMonthTabLabel(sale.saleDate);

    if (!knownTabExists(spreadsheetId, tabName)) {
      await ensureMonthTab(sheets, spreadsheetId, tabName);
    }

    const { startRow, rowCount } = await appendSaleRows(
      sheets,
      spreadsheetId,
      tabName,
      sale,
      lineItems,
      shopperName
    );

    logger.info("SHEETS", "Sale pushed to sheet leg", {
      saleId: sale.id,
      invoiceNumber: sale.xeroInvoiceNumber,
      shopperName,
      spreadsheetId,
      tabName,
      startRow,
      rowCount,
    });

    return { spreadsheetId, success: true, startRow, tabName, rowCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("SHEETS", "Sheet leg push failed", {
      saleId: sale.id,
      invoiceNumber: sale.xeroInvoiceNumber,
      shopperName,
      spreadsheetId,
      error: message,
    });
    return { spreadsheetId, success: false, reason: message };
  }
}

/**
 * Top-level orchestrator. Resolves shopper → sheet IDs and pushes to each in
 * turn. Per-leg failures are isolated — a failure on the per-shopper sheet
 * never aborts the master write. NEVER throws: errors are caught, logged,
 * and returned via the per-leg breakdown so callers can decide what to do
 * (typically: log to the errors table and continue).
 */
export async function pushSaleToShopperSheet(
  params: PushSaleParams
): Promise<PushSaleResult> {
  const { sale, lineItems, shopperName } = params;

  const spreadsheetIds = getSheetIdsForShopper(shopperName);
  if (spreadsheetIds.length === 0) {
    logger.warn("SHEETS", "No sheet mappings for shopper, skipping push", {
      shopperName,
      env: process.env.NODE_ENV,
    });
    return {
      success: true,
      skipped: true,
      reason: "no-sheet-mappings",
      legs: [],
    };
  }

  const sheets = getSheetsClient();
  const legs: SheetLegResult[] = [];
  for (const spreadsheetId of spreadsheetIds) {
    legs.push(
      await pushSaleToOneSheet(sheets, spreadsheetId, sale, lineItems, shopperName)
    );
  }

  // Master gates `success` and supplies the row tracking the DB persists.
  // In non-prod there is no SHEET_ID_MASTER leg in the resolved list, so we
  // fall back to the first (and only) leg — the test sheet plays master's
  // role for dev tracking.
  const masterIdEnv = process.env.SHEET_ID_MASTER;
  const masterLeg =
    legs.find((l) => l.spreadsheetId === masterIdEnv) ?? legs[0];

  return {
    success: masterLeg?.success ?? false,
    masterStartRow: masterLeg?.startRow,
    masterTabName: masterLeg?.tabName,
    legs,
  };
}

// ============================================================================
// UPDATE EXISTING ROWS (for atelier cost updates) — FAN-OUT
// ============================================================================

export interface UpdateSaleRowParams {
  sale: SaleWithRelations;
  lineItems: LineItemWithSupplier[];
  shopperName: string;
  /** Stored DB value — the master sheet's row number for this sale. */
  startRow: number;
  /** Stored DB value — e.g. "April 2026". */
  tabName: string;
}

export interface UpdateSaleRowResult {
  /**
   * True iff the master leg's update succeeded — or, in non-prod where there
   * is no master, the single configured leg. Per-shopper-leg failures DO
   * NOT flip this to false; they appear in `legs` and the caller logs them.
   */
  success: boolean;
  skipped?: boolean;
  reason?: string;
  /**
   * The master leg's resolved row. If this differs from the stored
   * `sheetsRowNumber`, the caller should overwrite the stored value (handles
   * the post-fan-out self-healing case described below).
   */
  masterResolvedStartRow?: number;
  legs: SheetLegResult[];
}

/**
 * Search column C of the tab for the invoice number. Returns the 1-indexed
 * row number of the FIRST match, or null if not found.
 */
async function findRowByInvoiceNumber(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  invoiceNumber: string
): Promise<number | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!C:C`,
  });
  const rows = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i]?.[0];
    if (cell === invoiceNumber) {
      return i + 1; // values.get is 0-indexed into the array; sheet rows are 1-indexed
    }
  }
  return null;
}

/**
 * Update one sheet's rows for a sale. Strategy depends on whether the caller
 * supplied a stored row+tab:
 *
 *   - Stored row supplied (master leg path): verify column C at the stored
 *     row matches the invoice; if not, fall back to a column-C search.
 *
 *     Self-healing for legacy MC/Hope sales: pre-fan-out, `sheetsRowNumber`
 *     pointed at the per-shopper-sheet row, NOT the master row. After this
 *     refactor it canonically refers to master. The first time one of those
 *     legacy sales is updated, the verify on master will mismatch (the row
 *     at that index won't carry the invoice number), the search falls
 *     through, finds the correct master row, and the caller overwrites
 *     `sheetsRowNumber` with `masterResolvedStartRow`.
 *
 *   - No stored row (per-shopper leg path): always search column C. We
 *     don't track per-shopper row positions in the DB, so we pay one extra
 *     read per update on each per-shopper leg. If the row is not found,
 *     the leg fails — fallback-to-append is out of scope for this PR.
 *
 * Returns a per-leg result; never throws.
 */
async function updateSaleOnOneSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sale: SaleWithRelations,
  lineItems: LineItemWithSupplier[],
  shopperName: string,
  storedStartRow: number | null,
  storedTabName: string | null
): Promise<SheetLegResult> {
  const invoiceNumber = sale.xeroInvoiceNumber || "";
  const tabName = storedTabName ?? getMonthTabLabel(sale.saleDate);

  try {
    let resolvedStartRow: number | null = null;

    if (storedStartRow != null && storedTabName != null) {
      // Master path: verify by row, fallback to invoice-number search.
      try {
        const verify = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${tabName}'!C${storedStartRow}`,
        });
        const cellValue = verify.data.values?.[0]?.[0];

        if (cellValue === invoiceNumber) {
          resolvedStartRow = storedStartRow;
        } else {
          logger.warn("SHEETS", "Stored row does not match invoice — searching", {
            saleId: sale.id,
            invoiceNumber,
            storedRow: storedStartRow,
            foundAtStoredRow: cellValue,
            spreadsheetId,
          });
          resolvedStartRow = await findRowByInvoiceNumber(
            sheets,
            spreadsheetId,
            tabName,
            invoiceNumber
          );
        }
      } catch (verifyErr) {
        // Verify read failed (tab missing, permission issue) — try a search.
        resolvedStartRow = await findRowByInvoiceNumber(
          sheets,
          spreadsheetId,
          tabName,
          invoiceNumber
        ).catch(() => null);
        if (resolvedStartRow == null) throw verifyErr;
      }
    } else {
      // Per-shopper leg: no stored row, always search.
      resolvedStartRow = await findRowByInvoiceNumber(
        sheets,
        spreadsheetId,
        tabName,
        invoiceNumber
      );
    }

    if (resolvedStartRow == null) {
      logger.warn("SHEETS", "Invoice not found in sheet leg", {
        saleId: sale.id,
        invoiceNumber,
        spreadsheetId,
        tabName,
      });
      return {
        spreadsheetId,
        success: false,
        tabName,
        reason: `Invoice ${invoiceNumber} not found in tab "${tabName}"`,
      };
    }

    const rows = buildRowsFromSale(sale, lineItems, shopperName, resolvedStartRow);
    const endRow = resolvedStartRow + rows.length - 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A${resolvedStartRow}:Z${endRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    logger.info("SHEETS", "Sale row updated on sheet leg", {
      saleId: sale.id,
      invoiceNumber,
      spreadsheetId,
      tabName,
      resolvedStartRow,
      rowCount: rows.length,
    });

    return {
      spreadsheetId,
      success: true,
      startRow: resolvedStartRow,
      tabName,
      rowCount: rows.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("SHEETS", "Sheet leg update failed", {
      saleId: sale.id,
      invoiceNumber,
      shopperName,
      spreadsheetId,
      tabName,
      error: message,
    });
    return { spreadsheetId, success: false, tabName, reason: message };
  }
}

/**
 * Overwrite an existing sale's rows across all configured sheet legs.
 *
 * Master leg uses the stored `startRow` + `tabName` (verify-or-search).
 * Per-shopper leg(s) always do a fresh column-C search since we don't
 * track per-shopper row positions. Each leg runs in its own try/catch —
 * a failure on one leg never aborts the others.
 */
export async function updateSaleRowInSheet(
  params: UpdateSaleRowParams
): Promise<UpdateSaleRowResult> {
  const { sale, lineItems, shopperName, startRow, tabName } = params;

  const spreadsheetIds = getSheetIdsForShopper(shopperName);
  if (spreadsheetIds.length === 0) {
    logger.warn("SHEETS", "No sheet mappings for shopper, skipping update", {
      shopperName,
      env: process.env.NODE_ENV,
    });
    return {
      success: true,
      skipped: true,
      reason: "no-sheet-mappings",
      legs: [],
    };
  }

  const sheets = getSheetsClient();
  const masterIdEnv = process.env.SHEET_ID_MASTER;
  const legs: SheetLegResult[] = [];

  for (const spreadsheetId of spreadsheetIds) {
    // Master leg gets the stored row+tab. In non-prod there's no master in
    // the env-resolved list, so the single test leg plays master's role and
    // also gets the stored row+tab.
    const isMasterLeg =
      spreadsheetId === masterIdEnv || spreadsheetIds.length === 1;
    legs.push(
      await updateSaleOnOneSheet(
        sheets,
        spreadsheetId,
        sale,
        lineItems,
        shopperName,
        isMasterLeg ? startRow : null,
        isMasterLeg ? tabName : null
      )
    );
  }

  const masterLeg =
    legs.find((l) => l.spreadsheetId === masterIdEnv) ?? legs[0];

  return {
    success: masterLeg?.success ?? false,
    masterResolvedStartRow: masterLeg?.startRow,
    legs,
  };
}
