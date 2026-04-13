/**
 * Club 19 Sales OS — Commission Calculation Engine (V2)
 *
 * SINGLE SOURCE OF TRUTH for shopper commission calculation.
 *
 * Core mechanic: flat-rate bands on cumulative monthly total.
 * NOT marginal/tiered — the rate for the band the cumulative monthly profit
 * falls into applies to the ENTIRE cumulative amount.
 *
 * Example: MC hits £25K cumulative profit → £20K-£30K band → 15% × £25K = £3,750.
 *
 * Per-shopper VAT treatment:
 *   Hope: commission on gross profit (sell - buy - costs). VAT is irrelevant.
 *   MC:   commission on net profit (gross profit minus VAT due). VAT reduces
 *         her commissionable amount.
 *
 * Cost deductions (applied before commission for both shoppers):
 *   - Introducer fees
 *   - CC / handling fees
 *   - Entrupy fee
 *   - All logistics costs (DHL, Addison Lee, taxi, hand delivery, other)
 *
 * Delivery gate: only sales with delivery_confirmed = true are included.
 *
 * New client bonus: 10% on sales where is_new_client = true, calculated on
 * the same commissionable profit figure.
 * TODO: Confirm with Sophie — is the 10% new client bonus on gross or
 * commissionable profit? Currently implemented on commissionable.
 */

import { roundCurrency, subtractCurrency, addCurrency, multiplyCurrency } from "@/lib/utils/currency";
import { getVATRateForBrandingTheme } from "@/lib/economics";

// ============================================================================
// TYPES
// ============================================================================

export interface CommissionBand {
  min: number;
  max: number;
  /** Decimal rate, e.g. 0.10 for 10% */
  rate: number;
}

export interface ShopperCommissionConfig {
  shopperId: string;
  name: string;
  bands: CommissionBand[];
  /**
   * If true, VAT due is deducted from gross profit before commission calc.
   *
   * - MC:   true  → commissionable = gross profit − VAT due − costs
   * - Hope: false → commissionable = gross profit − costs (VAT irrelevant)
   *
   * "Gross profit" here means sell price (ex VAT) minus buy price.
   */
  deductVatFromProfit: boolean;
  /** Decimal rate for new client bonus, e.g. 0.10 for 10% */
  newClientBonusRate: number;
}

/** Minimal sale shape needed by the commission engine. */
export interface SaleForCommission {
  id: string;
  xeroInvoiceNumber: string | null;
  saleDate: Date | string | null;
  saleAmountIncVat: number | null;
  saleAmountExVat: number | null;
  buyPrice: number | null;
  brandingTheme: string | null;
  introducerCommission: number | null;
  cardFees: number | null;
  entrupyFee: number | null;
  shippingCost: number | null;
  dhlCost: number | null;
  addisonLeeCost: number | null;
  taxiCost: number | null;
  handDeliveryCost: number | null;
  otherLogisticsCost: number | null;
  deliveryConfirmed: boolean | null;
  isNewClient: boolean | null;
  buyerName?: string | null;
}

/** Per-sale breakdown in the result. */
export interface SaleCommissionDetail {
  saleId: string;
  invoiceNumber: string;
  saleDate: string | null;
  buyerName: string;
  sellPrice: number;
  buyPrice: number;
  grossProfit: number;
  vatDue: number;
  totalCosts: number;
  commissionableProfit: number;
  isNewClient: boolean;
  cumulativeProfit: number;
}

/** Per-shopper result for a month. */
export interface CommissionResult {
  shopperId: string;
  shopperName: string;
  month: string; // "YYYY-MM"
  deliveredSaleCount: number;
  totalSales: number; // count before delivery filter
  cumulativeProfit: number;
  currentBand: CommissionBand | null;
  commissionRate: number;
  commissionAmount: number;
  newClientBonusAmount: number;
  totalPayable: number;
  sales: SaleCommissionDetail[];
}

// ============================================================================
// SHOPPER CONFIGS (code constants — two shoppers, not DB-dynamic)
// ============================================================================

/**
 * MC — Mary Clair Bromfield
 * Commission on NET profit (gross profit minus VAT due).
 */
const MC_CONFIG: ShopperCommissionConfig = {
  shopperId: "rec_d5dt9i185bnc3iimglfg",
  name: "MC",
  bands: [
    { min: 0, max: 999.99, rate: 0 },
    { min: 1000, max: 19999.99, rate: 0.10 },
    { min: 20000, max: 29999.99, rate: 0.15 },
    { min: 30000, max: 55000, rate: 0.20 },
    { min: 55000.01, max: Infinity, rate: 0.25 },
  ],
  deductVatFromProfit: true,
  newClientBonusRate: 0.10,
};

/**
 * Hope — Hope Peverell
 * Commission on GROSS profit (VAT is irrelevant to her calc).
 */
const HOPE_CONFIG: ShopperCommissionConfig = {
  shopperId: "rec_d4u06nkgmio87vvfila0",
  name: "Hope",
  bands: [
    { min: 0, max: 999.99, rate: 0 },
    { min: 1000, max: 9999.99, rate: 0.10 },
    { min: 10000, max: 19999.99, rate: 0.12 },
    { min: 20000, max: 29999.99, rate: 0.18 },
    { min: 30000, max: 55000, rate: 0.20 },
    { min: 55000.01, max: Infinity, rate: 0.25 },
  ],
  deductVatFromProfit: false,
  newClientBonusRate: 0.10,
};

const SHOPPER_CONFIGS: ShopperCommissionConfig[] = [MC_CONFIG, HOPE_CONFIG];

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the commission config for a shopper by ID.
 * Returns null if the shopper has no commission config (e.g. Sophie, Alys).
 */
export function getShopperConfig(shopperId: string): ShopperCommissionConfig | null {
  return SHOPPER_CONFIGS.find((c) => c.shopperId === shopperId) ?? null;
}

/** Returns all shopper configs that have commission bands defined. */
export function getAllShopperConfigs(): ShopperCommissionConfig[] {
  return SHOPPER_CONFIGS;
}

/**
 * Calculate commission for a shopper for a given set of sales (typically one month).
 *
 * Steps:
 * 1. Filter to delivered sales only (delivery_confirmed = true)
 * 2. For each sale, compute commissionable profit:
 *    gross_profit = sell_price_ex_vat - buy_price
 *    costs = introducer_fee + cc_fee + entrupy + total_logistics
 *    vat_due = (only if deductVatFromProfit) margin-scheme VAT calculation
 *    commissionable = gross_profit - costs - vat_due
 * 3. Sum to cumulative total (only positive-profit sales contribute)
 * 4. Look up band for cumulative total
 * 5. Apply flat rate to entire cumulative total
 * 6. Add new client bonus (bonus rate × commissionable profit per new-client sale)
 */
export function calculateShopperCommission(
  allSales: SaleForCommission[],
  config: ShopperCommissionConfig,
  month: string
): CommissionResult {
  // Step 1: filter to delivered only
  const deliveredSales = allSales.filter((s) => s.deliveryConfirmed === true);

  // Step 2-3: compute per-sale and accumulate
  const saleDetails: SaleCommissionDetail[] = [];
  let cumulativeProfit = 0;
  let newClientBonusTotal = 0;

  for (const sale of deliveredSales) {
    const detail = computeSaleProfit(sale, config);
    // Only positive-profit sales contribute to cumulative total
    if (detail.commissionableProfit > 0) {
      cumulativeProfit = roundCurrency(cumulativeProfit + detail.commissionableProfit);
    }
    detail.cumulativeProfit = cumulativeProfit;
    saleDetails.push(detail);

    // New client bonus accrues per qualifying sale
    if (detail.isNewClient && detail.commissionableProfit > 0) {
      newClientBonusTotal = addCurrency(
        newClientBonusTotal,
        multiplyCurrency(detail.commissionableProfit, config.newClientBonusRate)
      );
    }
  }

  // Step 4: look up band
  const band = findBand(cumulativeProfit, config.bands);
  const rate = band?.rate ?? 0;

  // Step 5: flat rate on entire cumulative total
  const commissionAmount = multiplyCurrency(cumulativeProfit, rate);

  // Step 6: total payable
  const totalPayable = addCurrency(commissionAmount, newClientBonusTotal);

  return {
    shopperId: config.shopperId,
    shopperName: config.name,
    month,
    deliveredSaleCount: deliveredSales.length,
    totalSales: allSales.length,
    cumulativeProfit,
    currentBand: band,
    commissionRate: rate,
    commissionAmount,
    newClientBonusAmount: newClientBonusTotal,
    totalPayable,
    sales: saleDetails,
  };
}

// ============================================================================
// INTERNALS
// ============================================================================

/**
 * Compute the commissionable profit for a single sale.
 */
function computeSaleProfit(
  sale: SaleForCommission,
  config: ShopperCommissionConfig
): SaleCommissionDetail {
  const sellPrice = roundCurrency(sale.saleAmountExVat ?? 0);
  const buyPrice = roundCurrency(sale.buyPrice ?? 0);
  const grossProfit = subtractCurrency(sellPrice, buyPrice);

  // Cost deductions
  const introducerFee = roundCurrency(sale.introducerCommission ?? 0);
  const ccFee = roundCurrency(sale.cardFees ?? 0);
  const entrupyFee = roundCurrency(sale.entrupyFee ?? 0);

  // Logistics: use granular fields if any are set, else fall back to shippingCost
  const dhl = roundCurrency(sale.dhlCost ?? 0);
  const addisonLee = roundCurrency(sale.addisonLeeCost ?? 0);
  const taxi = roundCurrency(sale.taxiCost ?? 0);
  const handDelivery = roundCurrency(sale.handDeliveryCost ?? 0);
  const otherLogistics = roundCurrency(sale.otherLogisticsCost ?? 0);
  const granularLogistics = addCurrency(dhl, addisonLee, taxi, handDelivery, otherLogistics);
  const logistics = granularLogistics > 0
    ? granularLogistics
    : roundCurrency(sale.shippingCost ?? 0);

  const totalCosts = addCurrency(introducerFee, ccFee, entrupyFee, logistics);

  // VAT deduction (MC only)
  let vatDue = 0;
  if (config.deductVatFromProfit && grossProfit > 0) {
    // For Margin Scheme sales, VAT due = margin / 6 (1/6 of the margin)
    // For Export/zero-rated, VAT due = 0
    // For 20% VAT sales, VAT has already been separated (saleAmountExVat is net)
    // so the "VAT due on profit" concept applies mainly to Margin Scheme
    const vatRate = getVATRateForBrandingTheme(sale.brandingTheme);
    if (sale.brandingTheme) {
      // Margin Scheme: VAT on the margin = gross_profit / 6
      // This matches the Google Sheets formula: =IF(G="Margin Scheme", J/6, 0)
      const themeName = sale.brandingTheme.toLowerCase();
      // Check if it's margin scheme (either by name or by the GUID)
      const isMarginScheme = themeName.includes("margin") ||
        themeName === "8173b901-4ea8-498b-a4ba-52a8446ec43f";
      if (isMarginScheme) {
        vatDue = roundCurrency(grossProfit / 6);
      } else if (vatRate > 0) {
        // Standard 20% VAT — VAT is already excluded from saleAmountExVat,
        // so no additional deduction needed
        vatDue = 0;
      }
    }
  }

  const commissionableProfit = subtractCurrency(
    subtractCurrency(grossProfit, totalCosts),
    vatDue
  );

  return {
    saleId: sale.id,
    invoiceNumber: sale.xeroInvoiceNumber || "—",
    saleDate: sale.saleDate
      ? (typeof sale.saleDate === "string" ? sale.saleDate : sale.saleDate.toISOString())
      : null,
    buyerName: sale.buyerName || "Unknown",
    sellPrice,
    buyPrice,
    grossProfit,
    vatDue,
    totalCosts,
    commissionableProfit,
    isNewClient: sale.isNewClient === true,
    cumulativeProfit: 0, // filled in by caller
  };
}

/**
 * Find the band that the cumulative profit falls into.
 * Flat-rate: the entire amount gets the rate of the matched band.
 */
function findBand(amount: number, bands: CommissionBand[]): CommissionBand | null {
  for (const band of bands) {
    if (amount >= band.min && amount <= band.max) {
      return band;
    }
  }
  // Above all bands — use the highest
  if (bands.length > 0 && amount > bands[bands.length - 1].max) {
    return bands[bands.length - 1];
  }
  return null;
}
