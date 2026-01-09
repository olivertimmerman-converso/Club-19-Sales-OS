/**
 * VAT CALCULATION - SINGLE SOURCE OF TRUTH
 *
 * This module centralizes all VAT calculations to prevent bugs where
 * export sales incorrectly get 20% VAT applied.
 *
 * CRITICAL RULES:
 * - VAT rate MUST be derived from branding theme, NEVER hardcoded
 * - Export sales (CN Export Sales) = 0% VAT
 * - UK domestic sales (CN 20% VAT) = 20% VAT
 * - Margin scheme sales (CN Margin Scheme) = 0% VAT
 */

import {
  getBrandingThemeMapping,
  BrandingThemeMapping,
} from "@/lib/branding-theme-mappings";
import { toNumber } from "@/lib/economics";

export interface VATInputs {
  brandTheme: string;
  saleAmountExVat: number | string | null | undefined;
}

export interface VATResult {
  brandingTheme: BrandingThemeMapping;
  vatRate: number; // 0 or 20 (percentage)
  vatRateDecimal: number; // 0 or 0.2
  saleAmountExVat: number;
  vatAmount: number;
  saleAmountIncVat: number;
  isZeroRated: boolean;
}

/**
 * Calculate VAT based on branding theme
 *
 * CRITICAL: This is the SINGLE SOURCE OF TRUTH for VAT calculations.
 * All VAT calculations should use this function.
 *
 * @param inputs - Brand theme and sale amount (ex VAT)
 * @returns VAT calculation result
 * @throws Error if brand theme is unknown or if validation fails
 */
export function calculateVAT(inputs: VATInputs): VATResult {
  const { brandTheme, saleAmountExVat: rawSaleAmount } = inputs;

  // Get branding theme mapping
  const mapping = getBrandingThemeMapping(brandTheme);
  if (!mapping) {
    throw new Error(
      `Unknown branding theme: "${brandTheme}". Cannot determine VAT rate.`
    );
  }

  // Convert sale amount safely
  const saleAmountExVat = toNumber(rawSaleAmount);

  // VAT rate comes ONLY from the branding theme - NEVER hardcoded
  const vatRate = mapping.expectedVAT; // 0 or 20
  const vatRateDecimal = vatRate / 100; // 0 or 0.2
  const isZeroRated = vatRate === 0;

  // Calculate VAT amount and total
  let vatAmount: number;
  let saleAmountIncVat: number;

  if (isZeroRated) {
    // Zero-rated: No VAT added
    vatAmount = 0;
    saleAmountIncVat = saleAmountExVat;
  } else {
    // Standard rate: Add VAT
    vatAmount = saleAmountExVat * vatRateDecimal;
    saleAmountIncVat = saleAmountExVat + vatAmount;
  }

  // Round to 2 decimal places
  vatAmount = Math.round(vatAmount * 100) / 100;
  saleAmountIncVat = Math.round(saleAmountIncVat * 100) / 100;

  // CRITICAL VALIDATION: Zero-rated sales must have zero VAT
  if (isZeroRated && vatAmount > 0.01) {
    throw new Error(
      `VAT calculation error: ${mapping.treatment} should have 0% VAT but calculated £${vatAmount.toFixed(2)} VAT.`
    );
  }

  // CRITICAL VALIDATION: Standard rate sales must have correct VAT
  if (!isZeroRated) {
    const expectedVAT = Math.round(saleAmountExVat * vatRateDecimal * 100) / 100;
    if (Math.abs(vatAmount - expectedVAT) > 0.01) {
      throw new Error(
        `VAT calculation error: Expected £${expectedVAT.toFixed(2)} VAT for ${vatRate}% rate but calculated £${vatAmount.toFixed(2)}.`
      );
    }
  }

  console.log("[VAT_CALC] Calculation result:", {
    brandTheme,
    themeName: mapping.name,
    treatment: mapping.treatment,
    vatRate,
    isZeroRated,
    saleAmountExVat,
    vatAmount,
    saleAmountIncVat,
  });

  return {
    brandingTheme: mapping,
    vatRate,
    vatRateDecimal,
    saleAmountExVat,
    vatAmount,
    saleAmountIncVat,
    isZeroRated,
  };
}

/**
 * Validate that a sale's VAT is correct for its branding theme
 *
 * @param brandTheme - The branding theme (name or ID)
 * @param saleAmountExVat - Sale amount excluding VAT
 * @param saleAmountIncVat - Sale amount including VAT
 * @returns Validation result with any discrepancies
 */
export function validateSaleVAT(
  brandTheme: string,
  saleAmountExVat: number | string | null | undefined,
  saleAmountIncVat: number | string | null | undefined
): {
  isValid: boolean;
  expectedVATRate: number;
  actualVATAmount: number;
  expectedVATAmount: number;
  discrepancy: number;
  message?: string;
} {
  const mapping = getBrandingThemeMapping(brandTheme);
  if (!mapping) {
    return {
      isValid: false,
      expectedVATRate: 0,
      actualVATAmount: 0,
      expectedVATAmount: 0,
      discrepancy: 0,
      message: `Unknown branding theme: ${brandTheme}`,
    };
  }

  const exVat = toNumber(saleAmountExVat);
  const incVat = toNumber(saleAmountIncVat);
  const actualVATAmount = incVat - exVat;

  const expectedVATRate = mapping.expectedVAT;
  const expectedVATAmount =
    expectedVATRate === 0 ? 0 : exVat * (expectedVATRate / 100);

  const discrepancy = Math.abs(actualVATAmount - expectedVATAmount);
  const isValid = discrepancy < 0.01;

  return {
    isValid,
    expectedVATRate,
    actualVATAmount: Math.round(actualVATAmount * 100) / 100,
    expectedVATAmount: Math.round(expectedVATAmount * 100) / 100,
    discrepancy: Math.round(discrepancy * 100) / 100,
    message: isValid
      ? undefined
      : `VAT mismatch: Expected £${expectedVATAmount.toFixed(2)} (${expectedVATRate}%) but found £${actualVATAmount.toFixed(2)}`,
  };
}
