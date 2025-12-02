/**
 * Club 19 Sales OS - Economics & VAT Calculations
 *
 * Centralized module for all financial calculations including VAT,
 * margins, and commissionable profit.
 *
 * UK VAT Rate: 20% (1.2 multiplier)
 */

/**
 * Standard UK VAT rate (20%)
 */
export const VAT_RATE = 0.2;
export const VAT_MULTIPLIER = 1 + VAT_RATE; // 1.2

/**
 * Calculate amount excluding VAT from amount including VAT
 *
 * Formula: amount_inc_vat / 1.2
 *
 * @param amountIncVat - Amount including 20% VAT
 * @returns Amount excluding VAT
 */
export function calculateExVat(amountIncVat: number): number {
  if (typeof amountIncVat !== 'number' || isNaN(amountIncVat)) {
    return 0;
  }
  return amountIncVat / VAT_MULTIPLIER;
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
  if (typeof amountExVat !== 'number' || isNaN(amountExVat)) {
    return 0;
  }
  return amountExVat * VAT_RATE;
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
  const exVat = calculateExVat(amountIncVat);
  return amountIncVat - exVat;
}

/**
 * Calculate gross margin
 *
 * Gross Margin = Sale Price (ex VAT) - Buy Price - Direct Costs
 *
 * @param saleExVat - Sale amount excluding VAT
 * @param buyPrice - Purchase price
 * @param directCosts - Optional direct costs (defaults to 0)
 * @returns Gross margin
 */
export function calculateGrossMargin(
  saleExVat: number,
  buyPrice: number,
  directCosts: number = 0
): number {
  if (typeof saleExVat !== 'number' || isNaN(saleExVat)) return 0;
  if (typeof buyPrice !== 'number' || isNaN(buyPrice)) return 0;
  if (typeof directCosts !== 'number' || isNaN(directCosts)) directCosts = 0;

  return saleExVat - buyPrice - directCosts;
}

/**
 * Calculate commissionable margin
 *
 * Commissionable Margin = Gross Margin - Card Fees - Shipping Costs
 *
 * This is the margin on which shopper commission is calculated.
 *
 * @param grossMargin - Gross margin (sale ex VAT - buy price - direct costs)
 * @param cardFees - Card processing fees
 * @param shippingCost - Shipping costs (defaults to 0)
 * @returns Commissionable margin
 */
export function calculateCommissionableMargin(
  grossMargin: number,
  cardFees: number,
  shippingCost: number = 0
): number {
  if (typeof grossMargin !== 'number' || isNaN(grossMargin)) return 0;
  if (typeof cardFees !== 'number' || isNaN(cardFees)) cardFees = 0;
  if (typeof shippingCost !== 'number' || isNaN(shippingCost)) shippingCost = 0;

  return grossMargin - cardFees - shippingCost;
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
export function calculateMarginPercent(margin: number, saleExVat: number): number {
  if (saleExVat === 0 || isNaN(saleExVat)) return 0;
  return (margin / saleExVat) * 100;
}

/**
 * Complete economics calculation for a sale
 *
 * Calculates all economic values in one go:
 * - Sale amount ex VAT
 * - VAT amount
 * - Gross margin
 * - Commissionable margin
 * - Margin percentages
 *
 * @param params - Sale financial parameters
 * @returns Complete economics breakdown
 */
export interface SaleEconomicsParams {
  sale_amount_inc_vat: number;
  buy_price: number;
  card_fees?: number;
  shipping_cost?: number;
  direct_costs?: number;
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
  commissionable_margin: number;
  gross_margin_percent: number;
  commissionable_margin_percent: number;
}

export function calculateSaleEconomics(params: SaleEconomicsParams): SaleEconomics {
  const {
    sale_amount_inc_vat,
    buy_price,
    card_fees = 0,
    shipping_cost = 0,
    direct_costs = 0,
  } = params;

  // Step 1: Calculate sale amount ex VAT
  const sale_amount_ex_vat = calculateExVat(sale_amount_inc_vat);

  // Step 2: Calculate VAT amount
  const vat_amount = sale_amount_inc_vat - sale_amount_ex_vat;

  // Step 3: Calculate gross margin
  const gross_margin = calculateGrossMargin(sale_amount_ex_vat, buy_price, direct_costs);

  // Step 4: Calculate commissionable margin
  const commissionable_margin = calculateCommissionableMargin(
    gross_margin,
    card_fees,
    shipping_cost
  );

  // Step 5: Calculate margin percentages
  const gross_margin_percent = calculateMarginPercent(gross_margin, sale_amount_ex_vat);
  const commissionable_margin_percent = calculateMarginPercent(
    commissionable_margin,
    sale_amount_ex_vat
  );

  return {
    sale_amount_inc_vat,
    sale_amount_ex_vat,
    vat_amount,
    buy_price,
    direct_costs,
    gross_margin,
    card_fees,
    shipping_cost,
    commissionable_margin,
    gross_margin_percent,
    commissionable_margin_percent,
  };
}
