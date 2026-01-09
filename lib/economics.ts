/**
 * Club 19 Sales OS - Economics & VAT Calculations
 *
 * SINGLE SOURCE OF TRUTH for all financial calculations including VAT,
 * margins, and commissionable profit.
 *
 * CRITICAL: VAT rate MUST be derived from branding theme, NOT hardcoded!
 * - Export sales (CN Export Sales) = 0% VAT
 * - UK domestic sales (CN 20% VAT) = 20% VAT
 * - Margin scheme sales (CN Margin Scheme) = 0% VAT
 *
 * CRITICAL FORMULAS:
 * - Gross Margin = Sale Price (ex VAT) - Buy Price ONLY
 * - Commissionable Margin = Gross Margin - Shipping - Card Fees - Direct Costs - Introducer Commission
 */

import { getBrandingThemeMapping } from "@/lib/branding-theme-mappings";
import {
  roundCurrency,
  subtractCurrency,
  addCurrency,
  divideCurrency,
  multiplyCurrency,
} from "@/lib/utils/currency";

/**
 * Standard UK VAT rate (20%) - use getVATRateForBrandingTheme() instead of this constant
 * @deprecated Use getVATRateForBrandingTheme() to get the correct VAT rate based on branding theme
 */
export const VAT_RATE = 0.2;
export const VAT_MULTIPLIER = 1 + VAT_RATE; // 1.2

/**
 * Get the correct VAT rate for a branding theme
 *
 * CRITICAL: This is the ONLY way to determine VAT rate. Never hardcode!
 *
 * @param brandingTheme - The branding theme name or ID
 * @returns VAT rate as decimal (0.0 or 0.2)
 */
export function getVATRateForBrandingTheme(brandingTheme: string | null | undefined): number {
  if (!brandingTheme) {
    console.warn("[ECONOMICS] No branding theme provided, defaulting to 20% VAT");
    return 0.2;
  }

  const mapping = getBrandingThemeMapping(brandingTheme);
  if (!mapping) {
    console.warn(`[ECONOMICS] Unknown branding theme "${brandingTheme}", defaulting to 20% VAT`);
    return 0.2;
  }

  const vatRate = mapping.expectedVAT / 100; // Convert 0/20 to 0.0/0.2
  console.log(`[ECONOMICS] VAT rate for "${mapping.name}": ${mapping.expectedVAT}% (${vatRate})`);
  return vatRate;
}

/**
 * Safely convert any value to a number, handling strings, nulls, etc.
 * This prevents NaN bugs from string arithmetic like "1000" - "500" = NaN
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(num) ? 0 : num;
}

/**
 * Calculate amount excluding VAT from amount including VAT
 *
 * @deprecated Use calculateExVatWithRate() instead to handle different VAT rates
 *
 * Formula: amount_inc_vat / 1.2
 *
 * @param amountIncVat - Amount including 20% VAT
 * @returns Amount excluding VAT
 */
export function calculateExVat(amountIncVat: number): number {
  const amount = toNumber(amountIncVat);
  return roundCurrency(amount / VAT_MULTIPLIER);
}

/**
 * Calculate amount excluding VAT from amount including VAT, with configurable VAT rate
 *
 * CRITICAL: Use this function for all VAT calculations to handle export/margin scheme sales correctly
 *
 * @param amountIncVat - Amount including VAT
 * @param vatRate - VAT rate as decimal (0.0 for zero-rated, 0.2 for standard rate)
 * @returns Amount excluding VAT
 */
export function calculateExVatWithRate(amountIncVat: number, vatRate: number): number {
  const amount = roundCurrency(toNumber(amountIncVat));
  if (vatRate === 0) {
    // Zero-rated: inc VAT = ex VAT
    return amount;
  }
  return roundCurrency(amount / (1 + vatRate));
}

/**
 * Calculate VAT amount from amount excluding VAT
 *
 * Formula: amount_ex_vat * 0.2
 *
 * @param amountExVat - Amount excluding VAT
 * @returns VAT amount (20%)
 */
export function calculateVat(amountExVat: number): number {
  const amount = toNumber(amountExVat);
  return roundCurrency(amount * VAT_RATE);
}

/**
 * Calculate VAT amount from amount including VAT
 *
 * Formula: amount_inc_vat - (amount_inc_vat / 1.2)
 *
 * @param amountIncVat - Amount including VAT
 * @returns VAT amount
 */
export function calculateVatFromIncVat(amountIncVat: number): number {
  const amount = roundCurrency(toNumber(amountIncVat));
  const exVat = calculateExVat(amount);
  return subtractCurrency(amount, exVat);
}

/**
 * Calculate gross margin
 *
 * CRITICAL: Gross Margin = Sale Price (ex VAT) - Buy Price ONLY
 * Do NOT subtract direct costs, shipping, or other expenses here!
 *
 * @param saleExVat - Sale amount excluding VAT
 * @param buyPrice - Purchase price (what we paid for the item)
 * @returns Gross margin
 */
export function calculateGrossMargin(
  saleExVat: number | string | null | undefined,
  buyPrice: number | string | null | undefined
): number {
  const sale = roundCurrency(toNumber(saleExVat));
  const buy = roundCurrency(toNumber(buyPrice));
  return subtractCurrency(sale, buy);
}

/**
 * Input for margin calculations
 */
export interface MarginInputs {
  saleAmountExVat: number | string | null | undefined;
  buyPrice: number | string | null | undefined;
  shippingCost?: number | string | null | undefined;
  cardFees?: number | string | null | undefined;
  directCosts?: number | string | null | undefined;
  introducerCommission?: number | string | null | undefined;
}

/**
 * Result of margin calculations
 */
export interface MarginResult {
  grossMargin: number;
  commissionableMargin: number;
  breakdown: {
    saleAmountExVat: number;
    buyPrice: number;
    shippingCost: number;
    cardFees: number;
    directCosts: number;
    introducerCommission: number;
    totalDeductions: number;
  };
}

/**
 * Calculate both gross margin and commissionable margin
 *
 * CRITICAL FORMULAS:
 * - Gross Margin = Sale Price (ex VAT) - Buy Price ONLY
 * - Commissionable Margin = Gross Margin - Shipping - Card Fees - Direct Costs - Introducer Commission
 *
 * This is the SINGLE SOURCE OF TRUTH for margin calculations.
 * All other code should use this function.
 *
 * @param inputs - All financial inputs for the calculation
 * @returns Margin results with breakdown
 */
export function calculateMargins(inputs: MarginInputs): MarginResult {
  // Convert all inputs to numbers safely and round to 2 decimal places
  const saleAmountExVat = roundCurrency(toNumber(inputs.saleAmountExVat));
  const buyPrice = roundCurrency(toNumber(inputs.buyPrice));
  const shippingCost = roundCurrency(toNumber(inputs.shippingCost));
  const cardFees = roundCurrency(toNumber(inputs.cardFees));
  const directCosts = roundCurrency(toNumber(inputs.directCosts));
  const introducerCommission = roundCurrency(toNumber(inputs.introducerCommission));

  // CRITICAL: Gross Margin = Sale - Buy ONLY
  const grossMargin = subtractCurrency(saleAmountExVat, buyPrice);

  // Commissionable Margin = Gross Margin - All Deductions
  const totalDeductions = addCurrency(shippingCost, cardFees, directCosts, introducerCommission);
  const commissionableMargin = subtractCurrency(grossMargin, totalDeductions);

  return {
    grossMargin,
    commissionableMargin,
    breakdown: {
      saleAmountExVat,
      buyPrice,
      shippingCost,
      cardFees,
      directCosts,
      introducerCommission,
      totalDeductions,
    },
  };
}

/**
 * Calculate commissionable margin from gross margin
 *
 * Commissionable Margin = Gross Margin - Shipping - Card Fees - Direct Costs - Introducer Commission
 *
 * This is the margin on which shopper commission is calculated.
 *
 * @param grossMargin - Gross margin (sale ex VAT - buy price ONLY)
 * @param shippingCost - Shipping costs
 * @param cardFees - Card processing fees
 * @param directCosts - Other direct costs
 * @param introducerCommission - Introducer commission (if applicable)
 * @returns Commissionable margin
 */
export function calculateCommissionableMargin(
  grossMargin: number | string | null | undefined,
  shippingCost: number | string | null | undefined = 0,
  cardFees: number | string | null | undefined = 0,
  directCosts: number | string | null | undefined = 0,
  introducerCommission: number | string | null | undefined = 0
): number {
  const margin = roundCurrency(toNumber(grossMargin));
  const shipping = roundCurrency(toNumber(shippingCost));
  const fees = roundCurrency(toNumber(cardFees));
  const direct = roundCurrency(toNumber(directCosts));
  const introducer = roundCurrency(toNumber(introducerCommission));

  const totalDeductions = addCurrency(shipping, fees, direct, introducer);
  return subtractCurrency(margin, totalDeductions);
}

/**
 * Calculate margin percentage
 *
 * Margin % = (Margin / Sale Price Ex VAT) * 100
 *
 * @param margin - Margin amount
 * @param saleExVat - Sale amount excluding VAT
 * @returns Margin as percentage
 */
export function calculateMarginPercent(
  margin: number | string | null | undefined,
  saleExVat: number | string | null | undefined
): number {
  const m = roundCurrency(toNumber(margin));
  const sale = roundCurrency(toNumber(saleExVat));
  if (sale === 0) return 0;
  return roundCurrency((m / sale) * 100);
}

/**
 * Complete economics calculation for a sale
 *
 * Calculates all economic values in one go:
 * - Sale amount ex VAT
 * - VAT amount
 * - Gross margin (Sale ex VAT - Buy Price ONLY)
 * - Commissionable margin (Gross - Shipping - Fees - Costs - Introducer)
 * - Margin percentages
 *
 * @param params - Sale financial parameters
 * @returns Complete economics breakdown
 */
export interface SaleEconomicsParams {
  sale_amount_inc_vat: number | string | null | undefined;
  buy_price: number | string | null | undefined;
  card_fees?: number | string | null | undefined;
  shipping_cost?: number | string | null | undefined;
  direct_costs?: number | string | null | undefined;
  introducer_commission?: number | string | null | undefined;
  /**
   * CRITICAL: Branding theme is required to determine the correct VAT rate
   * - CN Export Sales = 0% VAT
   * - CN 20% VAT = 20% VAT
   * - CN Margin Scheme = 0% VAT
   */
  branding_theme?: string | null | undefined;
}

export interface SaleEconomics {
  sale_amount_inc_vat: number;
  sale_amount_ex_vat: number;
  vat_amount: number;
  buy_price: number;
  direct_costs: number;
  gross_margin: number;
  card_fees: number;
  shipping_cost: number;
  introducer_commission: number;
  commissionable_margin: number;
  gross_margin_percent: number;
  commissionable_margin_percent: number;
}

export function calculateSaleEconomics(params: SaleEconomicsParams): SaleEconomics {
  // Convert all inputs safely and round to 2 decimal places
  const sale_amount_inc_vat = roundCurrency(toNumber(params.sale_amount_inc_vat));
  const buy_price = roundCurrency(toNumber(params.buy_price));
  const card_fees = roundCurrency(toNumber(params.card_fees));
  const shipping_cost = roundCurrency(toNumber(params.shipping_cost));
  const direct_costs = roundCurrency(toNumber(params.direct_costs));
  const introducer_commission = roundCurrency(toNumber(params.introducer_commission));

  // CRITICAL: Get the correct VAT rate from branding theme
  const vatRate = getVATRateForBrandingTheme(params.branding_theme);

  console.log("[ECONOMICS] calculateSaleEconomics inputs:", {
    sale_amount_inc_vat,
    buy_price,
    branding_theme: params.branding_theme,
    vatRate,
  });

  // Step 1: Calculate sale amount ex VAT using the CORRECT VAT rate
  const sale_amount_ex_vat = calculateExVatWithRate(sale_amount_inc_vat, vatRate);

  // Step 2: Calculate VAT amount (rounded)
  const vat_amount = subtractCurrency(sale_amount_inc_vat, sale_amount_ex_vat);

  // Step 3: Calculate gross margin (CRITICAL: Sale - Buy ONLY)
  const gross_margin = calculateGrossMargin(sale_amount_ex_vat, buy_price);

  // Step 4: Calculate commissionable margin (Gross - All Deductions)
  const commissionable_margin = calculateCommissionableMargin(
    gross_margin,
    shipping_cost,
    card_fees,
    direct_costs,
    introducer_commission
  );

  // Step 5: Calculate margin percentages
  const gross_margin_percent = calculateMarginPercent(gross_margin, sale_amount_ex_vat);
  const commissionable_margin_percent = calculateMarginPercent(
    commissionable_margin,
    sale_amount_ex_vat
  );

  console.log("[ECONOMICS] calculateSaleEconomics result:", {
    sale_amount_inc_vat,
    sale_amount_ex_vat,
    vat_amount,
    gross_margin,
    commissionable_margin,
  });

  // SAFEGUARD: Validate zero-rated sales have zero VAT
  if (vatRate === 0 && Math.abs(vat_amount) > 0.01) {
    console.error("[ECONOMICS] BUG: Zero-rated sale has non-zero VAT!", {
      branding_theme: params.branding_theme,
      vatRate,
      vat_amount,
    });
  }

  return {
    sale_amount_inc_vat,
    sale_amount_ex_vat,
    vat_amount,
    buy_price,
    direct_costs,
    gross_margin,
    card_fees,
    shipping_cost,
    introducer_commission,
    commissionable_margin,
    gross_margin_percent,
    commissionable_margin_percent,
  };
}
