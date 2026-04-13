/**
 * Google Sheets — column layout, row builder, formula strings.
 *
 * Single source of truth for the wizard → Sheets push column mapping.
 * Mirrors MC's commission sheet format defined in Phase 2 plan Section 6.2.
 *
 * Row granularity is **one row per line item**, NOT one row per sale. A
 * 3-item invoice produces 3 rows that share the same invoice number and date.
 * Per-item buy/sell/margin lives on each row; invoice-level costs (introducer
 * fee, Entrupy, card fee, shipping) attach to the FIRST row only so SUM
 * formulas don't double-count when Sophie reads sums-per-invoice.
 */

import type { Sale, LineItem, Buyer, Supplier } from "@/db/schema";
import { getBrandingThemeName } from "@/lib/branding-theme-mappings";

// ============================================================================
// HEADERS
// ============================================================================

export const SHEET_HEADERS: readonly string[] = [
  "Date",                // A
  "Shopper",             // B
  "Invoice #",           // C
  "Client",              // D
  "Supplier",            // E
  "Item",                // F
  "VAT method",          // G
  "Buy price",           // H
  "Sell price",          // I
  "Margin",              // J — formula
  "VAT due",             // K — formula
  "Gross profit",        // L — formula
  "Introducer name",     // M
  "Introducer fee",      // N
  "CC fee",              // O
  "Entrupy fee",         // P
  "DHL / shipping",      // Q
  "Addison Lee / taxi",  // R
  "Hand delivery",       // S
  "Other costs",         // T
  "Total costs",         // U — formula
  "Net product profit",  // V — formula
  "Net sale profit",     // W — formula
  "Delivery confirmed",  // X
  "Commission due",      // Y — placeholder until Workstream 4
  "New client bonus",    // Z — placeholder until Workstream 4
] as const;

export const COLUMN_COUNT = SHEET_HEADERS.length; // 26 (A–Z)

// ============================================================================
// TYPES
// ============================================================================

/** A sale row joined with its buyer and supplier (top-level relations). */
export type SaleWithRelations = Sale & {
  buyer: Buyer | null;
  supplier: Supplier | null;
};

/** A line item joined with its (per-item) supplier. */
export type LineItemWithSupplier = LineItem & {
  supplier: Supplier | null;
};

/**
 * A single row's worth of cell values. Mixed types because Sheets accepts
 * strings (including formulas), numbers, and booleans for checkbox cells.
 */
export type SheetCell = string | number | boolean;
export type SheetRow = SheetCell[];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a sale date for column A. Uses dd/mm/yyyy because Sophie's existing
 * sheets use that format and so does the wider UK business context.
 */
export function formatSaleDate(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Returns the month tab label for a given sale date, e.g. "April 2026".
 */
export function getMonthTabLabel(date: Date | string | null): string {
  const d = date ? (typeof date === "string" ? new Date(date) : date) : new Date();
  const monthName = d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${monthName} ${year}`;
}

/**
 * Normalises a Xero branding theme (GUID or friendly name) into a sheet-friendly
 * VAT method label. The label is used as both display text in column F and as
 * the match value for the column J VAT formula.
 *
 * Friendly DB values are "CN 20% VAT", "CN Margin Scheme", "CN Export Sales".
 * We strip the "CN " prefix for cleaner display.
 */
export function deriveVatMethod(brandingTheme: string | null): string {
  const friendlyName = getBrandingThemeName(brandingTheme) ?? brandingTheme ?? "";
  // Strip the "CN " prefix used internally so Sophie sees "Margin Scheme"
  // not "CN Margin Scheme".
  return friendlyName.replace(/^CN\s+/, "");
}

/**
 * Build the per-line-item description for column E.
 * Format: "Brand Category — Description" (em dash separator).
 */
function buildItemDescription(
  brand: string | null,
  category: string | null,
  description: string | null
): string {
  const head = [brand, category].filter(Boolean).join(" ").trim();
  const tail = (description || "").trim();
  if (!head && !tail) return "";
  if (!tail) return head;
  if (!head) return tail;
  return `${head} — ${tail}`;
}

/**
 * Returns true if the line item is the auto-generated handling/shipping line
 * that StepReview adds to the Xero invoice payload (and saveLineItems then
 * persists to the line_items table). These rows have empty brand and category
 * and a description like "Handling", "Shipping", or "Handling + Shipping".
 *
 * They must NOT push to the sheet — invoice-level shipping/card fees are
 * already represented as columns N (CC fee) and P (DHL/shipping) on the
 * first product row of the same invoice. Pushing the handling line as its own
 * sheet row would double-count.
 */
function isHandlingLineItem(item: LineItemWithSupplier): boolean {
  const desc = (item.description || "").toLowerCase();
  if (desc.includes("handling") || desc.includes("shipping")) return true;
  // Defensive secondary check: real product rows always have a brand or
  // category set by the wizard. The handling line has both empty.
  const hasBrand = !!(item.brand && item.brand.trim());
  const hasCategory = !!(item.category && item.category.trim());
  if (!hasBrand && !hasCategory) return true;
  return false;
}

/**
 * Synthesises a single line item from a sale row when the sale has no rows in
 * the line_items table (legacy single-line invoices). Uses the sale's
 * top-level brand/category/itemTitle/buyPrice/saleAmountExVat fields.
 */
function syntheticLineItemFromSale(sale: SaleWithRelations): LineItemWithSupplier {
  return {
    id: `synthetic-${sale.id}`,
    saleId: sale.id,
    supplierId: sale.supplierId ?? null,
    lineNumber: 1,
    brand: sale.brand ?? null,
    category: sale.category ?? null,
    description: sale.itemTitle ?? null,
    quantity: sale.quantity ?? 1,
    buyPrice: sale.buyPrice ?? null,
    sellPrice: sale.saleAmountExVat ?? null,
    lineTotal: null,
    lineMargin: null,
    supplierInvoiceRef: null,
    datePurchased: null,
    source: sale.source ?? "atelier",
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    xataVersion: null,
    supplier: sale.supplier,
  };
}

// ============================================================================
// ROW BUILDER
// ============================================================================

/**
 * Builds N rows from a sale (one per line item).
 *
 * Invoice-level costs (introducer fee, CC fee, Entrupy, shipping) attach to
 * the FIRST row only. Subsequent rows of the same invoice show 0 in those
 * columns so the column-U SUM formula doesn't double-count when reading
 * row-by-row, AND so summing U across all rows of an invoice equals the true
 * sale-level cost.
 *
 * Formula columns (J, K, L, U, V, W) reference their own row via the
 * absolute row number — that's why the caller has to pass `firstRowNumber`.
 * Formulas use USER_ENTERED input mode in the Sheets API call so they get
 * parsed, not stored as literal strings.
 *
 * @param sale - sale row joined with buyer + supplier
 * @param lineItems - rows from the line_items table for this sale
 * @param shopperName - display name of the shopper, populated into column B
 * @param firstRowNumber - the absolute sheet row number where row 0 will land
 * @returns N row arrays ready to feed values.append (one per line item)
 */
export function buildRowsFromSale(
  sale: SaleWithRelations,
  lineItems: LineItemWithSupplier[],
  shopperName: string,
  firstRowNumber: number
): SheetRow[] {
  // Filter out the auto-generated handling/shipping line item that gets saved
  // to line_items alongside the real products. Costs from the handling line are
  // already attached as invoice-level columns (O: CC fee, Q: shipping) on the
  // first product row, so including the handling row would double-count.
  const productLineItems = lineItems.filter((item) => !isHandlingLineItem(item));

  const items =
    productLineItems.length > 0
      ? productLineItems
      : [syntheticLineItemFromSale(sale)];

  return items.map((item, idx) => {
    const rowNumber = firstRowNumber + idx;
    const isFirstRow = idx === 0;

    return [
      /* A */ formatSaleDate(sale.saleDate),
      /* B */ shopperName || "",
      /* C */ sale.xeroInvoiceNumber || "",
      /* D */ sale.buyer?.name || "",
      /* E */ item.supplier?.name || sale.supplier?.name || "",
      /* F */ buildItemDescription(item.brand, item.category, item.description),
      /* G */ deriveVatMethod(sale.brandingTheme),
      /* H */ item.buyPrice ?? 0,
      /* I */ item.sellPrice ?? 0,
      /* J */ `=I${rowNumber}-H${rowNumber}`,
      /* K */ `=IF(G${rowNumber}="Margin Scheme", J${rowNumber}/6, 0)`,
      /* L */ `=J${rowNumber}-K${rowNumber}`,
      /* M */ isFirstRow ? sale.introducerName || "" : "",
      /* N */ isFirstRow ? sale.introducerCommission ?? 0 : 0,
      /* O */ isFirstRow ? sale.cardFees ?? 0 : 0,
      /* P */ isFirstRow ? sale.entrupyFee ?? 0 : 0,
      /* Q */ isFirstRow ? (sale.dhlCost ?? sale.shippingCost ?? 0) : 0,
      /* R */ isFirstRow ? ((sale.addisonLeeCost ?? 0) + (sale.taxiCost ?? 0)) : 0,
      /* S */ isFirstRow ? (sale.handDeliveryCost ?? 0) : 0,
      /* T */ isFirstRow ? (sale.otherLogisticsCost ?? 0) : 0,
      /* U */ `=SUM(N${rowNumber}:T${rowNumber})`,
      /* V */ `=L${rowNumber}-U${rowNumber}`,
      /* W */ `=L${rowNumber}-U${rowNumber}`,
      /* X */ sale.deliveryConfirmed ?? false,
      /* Y */ "",
      /* Z */ "",
    ];
  });
}
