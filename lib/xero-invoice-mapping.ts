/**
 * Single source of truth for mapping a Xero invoice payload to the columns
 * we persist on the sales table.
 *
 * Used by every sync path (manual bulk, cron, webhook, adopt, sync-status,
 * payment-status) so the credit-note logic can't drift across routes —
 * which is how we ended up with five near-identical-but-subtly-different
 * mappers in the first place.
 *
 * IMPORTANT: 'CREDITED' is an APP-DERIVED status, NOT a Xero-returned one.
 * Xero keeps a credited invoice's Status as 'PAID' (or 'AUTHORISED' if the
 * credit was applied before payment) — we override based on AmountCredited
 * reaching Total with no payment/due residue. Don't try to reconcile our
 * 'CREDITED' to a Xero-side status; they will never match.
 *
 * The effective invoice value (what counts toward revenue) is:
 *
 *     effective = AmountPaid + AmountDue
 *               = Total − AmountCredited
 *
 * See lib/economics.ts → effectiveInvoiceValue() for the read-side helper.
 */

import { roundCurrency } from "@/lib/utils/currency";

/** Raw status values Xero may return on an invoice. */
export type XeroRawStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTHORISED"
  | "PAID"
  | "VOIDED"
  | "DELETED";

/**
 * App-derived invoice status. Note CREDITED is computed; the others map 1:1
 * to Xero's status (with SUBMITTED falling through to AUTHORISED in practice
 * since we don't differentiate the approval-workflow stage).
 */
export type AppInvoiceStatus =
  | "DRAFT"
  | "AUTHORISED"
  | "PAID"
  | "VOIDED"
  | "CREDITED";

/** Subset of Xero's Invoice resource we need for the mapping. */
export interface XeroInvoiceForMapping {
  Total?: number | null;
  AmountPaid?: number | null;
  AmountDue?: number | null;
  AmountCredited?: number | null;
  Status?: string | null;
}

/**
 * What we persist back to the sales row from each invoice payload.
 *
 * `saleAmountIncVat` is a number because that column is `double precision`
 * (legacy). The three xeroAmount fields are `string` because their columns
 * are `numeric(10,2)` and Drizzle's typed insert/update API expects strings
 * for numeric columns. Caller does no conversion — pass the mapped fields
 * straight into `.values({...})` or `.set({...})`. Read sites use
 * `effectiveInvoiceValue()` which handles the string→number coercion.
 */
export interface MappedSaleFields {
  saleAmountIncVat: number;
  xeroAmountPaid: string;
  xeroAmountDue: string;
  xeroAmountCredited: string;
  invoiceStatus: AppInvoiceStatus;
}

/**
 * Resolve a Xero invoice payload into the columns we persist on sales.
 *
 * Status priority (first match wins):
 *   1. Status === 'VOIDED' → VOIDED            (Xero's terminal cancel)
 *   2. AmountCredited >= Total
 *      AND AmountPaid + AmountDue === 0 → CREDITED   (app-derived)
 *   3. Status === 'DRAFT'    → DRAFT
 *   4. Status === 'AUTHORISED' → AUTHORISED
 *   5. Status === 'PAID'     → PAID
 *   6. Anything else (SUBMITTED, unknown)
 *      → fall back to the raw Xero value (mostly AUTHORISED in practice)
 *
 * Values are rounded to pence so the columns store clean decimals.
 */
export function mapXeroInvoiceToSaleFields(
  invoice: XeroInvoiceForMapping
): MappedSaleFields {
  const total = roundCurrency(invoice.Total ?? 0);
  const paid = roundCurrency(invoice.AmountPaid ?? 0);
  const due = roundCurrency(invoice.AmountDue ?? 0);
  const credited = roundCurrency(invoice.AmountCredited ?? 0);
  const rawStatus = (invoice.Status ?? "").toUpperCase() as XeroRawStatus;

  let invoiceStatus: AppInvoiceStatus;
  if (rawStatus === "VOIDED") {
    invoiceStatus = "VOIDED";
  } else if (credited >= total && total > 0 && paid + due === 0) {
    invoiceStatus = "CREDITED";
  } else if (rawStatus === "DRAFT") {
    invoiceStatus = "DRAFT";
  } else if (rawStatus === "AUTHORISED") {
    invoiceStatus = "AUTHORISED";
  } else if (rawStatus === "PAID") {
    invoiceStatus = "PAID";
  } else {
    // SUBMITTED, DELETED-from-Xero, unknown — fall through. We keep the raw
    // value so weird states don't silently become AUTHORISED. Cast is safe
    // because invoice_status is a free-form `text` column.
    invoiceStatus = (rawStatus || "AUTHORISED") as AppInvoiceStatus;
  }

  return {
    saleAmountIncVat: total,
    xeroAmountPaid: paid.toFixed(2),
    xeroAmountDue: due.toFixed(2),
    xeroAmountCredited: credited.toFixed(2),
    invoiceStatus,
  };
}

/**
 * Did any of the four amount fields change between our stored row and an
 * inbound Xero payload? Used as the re-sync guard, replacing the previous
 * "Total only" comparison.
 *
 * The credit-note case is exactly why we need this: when a credit note is
 * applied, Total stays the same — only AmountCredited and AmountDue change.
 * The old guard would never fire and the row would never auto-correct.
 *
 * Drizzle returns NUMERIC as JS string, so existing.xero_amount_* may be
 * string|null; coerce with Number(). saleAmountIncVat is double precision
 * and returns number directly.
 */
export function xeroAmountsChanged(
  existing: {
    saleAmountIncVat: number | null | undefined;
    xeroAmountPaid: string | number | null | undefined;
    xeroAmountDue: string | number | null | undefined;
    xeroAmountCredited: string | number | null | undefined;
  },
  invoice: XeroInvoiceForMapping
): boolean {
  const total = roundCurrency(invoice.Total ?? 0);
  const paid = roundCurrency(invoice.AmountPaid ?? 0);
  const due = roundCurrency(invoice.AmountDue ?? 0);
  const credited = roundCurrency(invoice.AmountCredited ?? 0);

  if (roundCurrency(existing.saleAmountIncVat ?? 0) !== total) return true;
  // null on existing side counts as "different" so the first sync after this
  // change populates the new columns even when amounts haven't actually moved.
  if (existing.xeroAmountPaid == null) return true;
  if (existing.xeroAmountDue == null) return true;
  if (existing.xeroAmountCredited == null) return true;
  if (roundCurrency(Number(existing.xeroAmountPaid)) !== paid) return true;
  if (roundCurrency(Number(existing.xeroAmountDue)) !== due) return true;
  if (roundCurrency(Number(existing.xeroAmountCredited)) !== credited) return true;

  return false;
}
