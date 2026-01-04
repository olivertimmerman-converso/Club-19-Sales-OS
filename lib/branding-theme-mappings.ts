/**
 * Xero Branding Theme ID to Name Mappings
 *
 * Maps Xero's internal branding theme GUIDs to friendly names and tax treatments.
 * These IDs are fetched from Xero and stored in the Sales.branding_theme field.
 */

export interface BrandingThemeMapping {
  id: string;
  name: string;
  accountCode: string;
  treatment: string;
  explanation: string;
  expectedVAT: number;
}

/**
 * Known Xero branding theme mappings for Club 19
 *
 * Update these IDs if branding themes change in Xero.
 * You can find the current IDs by running: npm run script scripts/get-branding-themes.ts
 */
export const XERO_BRANDING_THEMES: Record<string, BrandingThemeMapping> = {
  // CN 20% VAT - UK Domestic Sales (Account 425)
  "d68f1fb5-ab36-48f5-809d-2752a2a1d940": {
    id: "d68f1fb5-ab36-48f5-809d-2752a2a1d940",
    name: "CN 20% VAT",
    accountCode: "425",
    treatment: "UK Domestic Sale",
    explanation: "Standard 20% VAT applies to this UK domestic retail sale. The item and client are both in the UK.",
    expectedVAT: 20.0,
  },

  // CN Margin Scheme - VAT Margin Scheme (Account 424)
  "8173b901-4ea8-498b-a4ba-52a8446ec43f": {
    id: "8173b901-4ea8-498b-a4ba-52a8446ec43f",
    name: "CN Margin Scheme",
    accountCode: "424",
    treatment: "VAT Margin Scheme",
    explanation: "VAT Margin Scheme applies. VAT is only charged on the profit margin, not the full sale price. Used for second-hand goods purchased without VAT.",
    expectedVAT: 0.0,
  },

  // CN Export Sales - Export Sale (Account 423)
  "82e46ce4-09cf-4764-8342-4f774cf4040e": {
    id: "82e46ce4-09cf-4764-8342-4f774cf4040e",
    name: "CN Export Sales",
    accountCode: "423",
    treatment: "Export Sale (Zero-Rated)",
    explanation: "Zero-rated export sale. The client is outside the UK, so no UK VAT applies to this transaction.",
    expectedVAT: 0.0,
  },
};

/**
 * Get branding theme mapping by ID or friendly name
 */
export function getBrandingThemeMapping(
  themeIdOrName: string | null
): BrandingThemeMapping | null {
  if (!themeIdOrName) return null;

  // Try direct ID lookup first
  if (XERO_BRANDING_THEMES[themeIdOrName]) {
    return XERO_BRANDING_THEMES[themeIdOrName];
  }

  // Try friendly name lookup (for backward compatibility)
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
