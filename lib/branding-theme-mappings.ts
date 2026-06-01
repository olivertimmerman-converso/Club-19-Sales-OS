/**
 * Xero Branding Theme ID to Name Mappings
 *
 * Maps Xero's internal branding theme GUIDs to friendly names and tax treatments.
 * These IDs are fetched from Xero and stored in the Sales.branding_theme field.
 *
 * Each VAT treatment has a "with link" theme (Square payment link embedded — used when
 * the buyer is paying by card, since the 2.4% Square fee is already priced into Handling)
 * and a paired "no link" theme (used for bank transfer, where no card fee was priced in
 * and exposing a pay-by-card link would silently eat 2.4% of margin).
 */

import { PaymentMethod } from "@/lib/types/invoice";

export interface BrandingThemeMapping {
  id: string;
  name: string;
  accountCode: string;
  treatment: string;
  explanation: string;
  expectedVAT: number;
  /**
   * For active "with link" themes, the GUID of the paired no-link variant.
   * Drives paymentMethod → theme selection in resolveBrandingThemeForPayment().
   * Null on no-link themes themselves and on the legacy CN Export Sales theme.
   */
  noLinkVariantId: string | null;
}

export const XERO_BRANDING_THEMES: Record<string, BrandingThemeMapping> = {
  // CN 20% VAT - UK Domestic Sales (Account 425) - with payment link
  "d68f1fb5-ab36-48f5-809d-2752a2a1d940": {
    id: "d68f1fb5-ab36-48f5-809d-2752a2a1d940",
    name: "CN 20% VAT",
    accountCode: "425",
    treatment: "UK Domestic Sale",
    explanation: "Standard 20% VAT applies to this UK domestic retail sale. The item and client are both in the UK.",
    expectedVAT: 20.0,
    noLinkVariantId: "c51ec796-089c-413b-8aed-ecdb0fc0013b",
  },

  // CN 20% VAT No link - UK Domestic Sales (Account 425) - bank transfer variant
  "c51ec796-089c-413b-8aed-ecdb0fc0013b": {
    id: "c51ec796-089c-413b-8aed-ecdb0fc0013b",
    name: "CN 20% VAT No link",
    accountCode: "425",
    treatment: "UK Domestic Sale",
    explanation: "Standard 20% VAT applies to this UK domestic retail sale. Bank transfer — no payment link.",
    expectedVAT: 20.0,
    noLinkVariantId: null,
  },

  // CN Margin Scheme - VAT Margin Scheme (Account 424) - with payment link
  "8173b901-4ea8-498b-a4ba-52a8446ec43f": {
    id: "8173b901-4ea8-498b-a4ba-52a8446ec43f",
    name: "CN Margin Scheme",
    accountCode: "424",
    treatment: "VAT Margin Scheme",
    explanation: "VAT Margin Scheme applies. VAT is only charged on the profit margin, not the full sale price. Used for second-hand goods purchased without VAT.",
    expectedVAT: 0.0,
    noLinkVariantId: "7c2f3735-e4c0-473a-9913-44cd2e68a9a2",
  },

  // CN Margin Scheme No Link - VAT Margin Scheme (Account 424) - bank transfer variant
  "7c2f3735-e4c0-473a-9913-44cd2e68a9a2": {
    id: "7c2f3735-e4c0-473a-9913-44cd2e68a9a2",
    name: "CN Margin Scheme No Link",
    accountCode: "424",
    treatment: "VAT Margin Scheme",
    explanation: "VAT Margin Scheme applies. Bank transfer — no payment link.",
    expectedVAT: 0.0,
    noLinkVariantId: null,
  },

  // CN Export VAT - Export Sale (Account 423) - with payment link
  // Canonical export theme as of Phase B (replaces the legacy CN Export Sales below).
  "db66e081-2426-44df-8133-77fe3fedab5a": {
    id: "db66e081-2426-44df-8133-77fe3fedab5a",
    name: "CN Export VAT",
    accountCode: "423",
    treatment: "Export Sale (Zero-Rated)",
    explanation: "Zero-rated export sale. The client is outside the UK, so no UK VAT applies to this transaction.",
    expectedVAT: 0.0,
    noLinkVariantId: "74bd0e8d-f2e4-472a-a043-330c9cc1113e",
  },

  // CN Export No Link - Export Sale (Account 423) - bank transfer variant
  "74bd0e8d-f2e4-472a-a043-330c9cc1113e": {
    id: "74bd0e8d-f2e4-472a-a043-330c9cc1113e",
    name: "CN Export No Link",
    accountCode: "423",
    treatment: "Export Sale (Zero-Rated)",
    explanation: "Zero-rated export sale. Bank transfer — no payment link.",
    expectedVAT: 0.0,
    noLinkVariantId: null,
  },

  // CN Export Sales - LEGACY. Retained only so historical sales rows with this GUID
  // still resolve via getBrandingThemeMapping() (VAT recalculation depends on it).
  // Do not pick for new invoices — getInvoiceResult() now returns "CN Export VAT".
  "82e46ce4-09cf-4764-8342-4f774cf4040e": {
    id: "82e46ce4-09cf-4764-8342-4f774cf4040e",
    name: "CN Export Sales",
    accountCode: "423",
    treatment: "Export Sale (Zero-Rated)",
    explanation: "Zero-rated export sale. The client is outside the UK, so no UK VAT applies to this transaction.",
    expectedVAT: 0.0,
    noLinkVariantId: null,
  },
};

/**
 * Get branding theme mapping by ID or friendly name
 */
export function getBrandingThemeMapping(
  themeIdOrName: string | null
): BrandingThemeMapping | null {
  if (!themeIdOrName) return null;

  if (XERO_BRANDING_THEMES[themeIdOrName]) {
    return XERO_BRANDING_THEMES[themeIdOrName];
  }

  const byName = Object.values(XERO_BRANDING_THEMES).find(
    (theme) => theme.name === themeIdOrName
  );

  return byName || null;
}

/**
 * Get friendly name from branding theme ID
 */
export function getBrandingThemeName(themeId: string | null): string | null {
  if (!themeId) return null;
  const mapping = getBrandingThemeMapping(themeId);
  return mapping?.name || null;
}

/**
 * Resolve the branding theme that should land on the Xero invoice, given the buyer's
 * payment method. Card → with-link theme (matches the 2.4% Handling fee priced in).
 * Bank transfer → the paired no-link theme (no card fee priced in, so any Square
 * payment link on the invoice would let the buyer trigger an unpriced fee).
 *
 * Defaults to with-link when paymentMethod is missing — preserves pre-Phase-B behaviour
 * and keeps the safer fallback (a card-payable invoice for an unknown method is just an
 * invoice; a bank-transfer-only one accidentally given a card link is the bug we're fixing).
 */
export function resolveBrandingThemeForPayment(
  themeIdOrName: string | null,
  paymentMethod: string | PaymentMethod | null | undefined
): BrandingThemeMapping | null {
  const base = getBrandingThemeMapping(themeIdOrName);
  if (!base) return null;

  if (paymentMethod === PaymentMethod.BANK_TRANSFER && base.noLinkVariantId) {
    return XERO_BRANDING_THEMES[base.noLinkVariantId] ?? base;
  }
  return base;
}
