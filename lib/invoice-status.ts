/**
 * Single source of truth for displaying Xero invoice statuses across the OS.
 *
 * Xero's raw status values are: DRAFT | SUBMITTED | AUTHORISED | PAID | VOIDED.
 *
 * - DRAFT      Invoice not yet approved. Editable. Not sent to client.
 * - SUBMITTED  Approved by a user without authoriser permissions and waiting
 *              for an approver to authorise. Rarely used in this setup since
 *              the wizard creates invoices via an approver-permissioned
 *              integration user, so invoices go DRAFT → AUTHORISED directly.
 * - AUTHORISED Approved + live: sent to client and awaiting payment. We
 *              surface this to staff as "Awaiting Payment" because "Authorised"
 *              reads as if the work is done, not as a payment-pending state.
 * - PAID       Fully paid.
 * - VOIDED     Cancelled. Soft-deleted on our side.
 *
 * To change a colour or label app-wide, edit the maps below — every status
 * pill in the OS imports from here.
 */

export type XeroInvoiceStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTHORISED"
  | "PAID"
  | "VOIDED";

export const INVOICE_STATUS_LABELS: Record<XeroInvoiceStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AUTHORISED: "Awaiting Payment",
  PAID: "Paid",
  VOIDED: "Voided",
};

export const INVOICE_STATUS_COLORS: Record<XeroInvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  AUTHORISED: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-700",
  VOIDED: "bg-red-100 text-red-700",
};

/**
 * Resolve a raw Xero status string to its display label + Tailwind colour
 * classes. Unknown / unexpected values fall through to a neutral gray pill
 * with the raw value as the label so the UI never blanks out on data drift.
 */
export function getInvoiceStatusDisplay(
  status: string | null | undefined
): { label: string; colorClass: string } {
  if (!status) {
    return { label: "—", colorClass: "bg-gray-100 text-gray-400" };
  }
  const upper = status.toUpperCase() as XeroInvoiceStatus;
  return {
    label: INVOICE_STATUS_LABELS[upper] ?? status,
    colorClass: INVOICE_STATUS_COLORS[upper] ?? "bg-gray-100 text-gray-700",
  };
}
