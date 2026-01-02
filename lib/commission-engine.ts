/**
 * Club 19 Sales OS - Commission Engine V1
 *
 * Calculates commission splits between shoppers and introducers
 * based on commissionable margin, commission bands, and admin overrides.
 */

import * as logger from './logger';

export interface CommissionInput {
  commissionable_margin: number;
  introducer?: {
    commission_percent?: number;
  } | null;
  commission_band?: {
    commission_percent: number;
  } | null;
  admin_override_commission_percent?: number | null;
  admin_override_notes?: string | null;
}

export interface CommissionResult {
  commission_amount: number;
  commission_split_introducer: number;
  commission_split_shopper: number;
  introducer_share_percent: number;
  admin_override_commission_percent?: number;
  admin_override_notes?: string;
  errors: string[];
}

/**
 * Round a number to 2 decimal places
 */
function roundTo2dp(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Calculate commission for a sale
 *
 * Logic:
 * 1. Validate margin is a positive number
 * 2. Determine commission percentage (admin override > commission band)
 * 3. Calculate total commission amount
 * 4. Split between introducer and shopper
 * 5. Round all values to 2 decimal places
 *
 * @param sale - Sale data with margin and commission configuration
 * @returns Commission breakdown with any validation errors
 */
export async function calculateCommission(
  sale: CommissionInput
): Promise<CommissionResult> {
  const errors: string[] = [];

  // Default result structure
  const result: CommissionResult = {
    commission_amount: 0,
    commission_split_introducer: 0,
    commission_split_shopper: 0,
    introducer_share_percent: 0,
    errors: [],
  };

  // STEP 1: Validate margin
  const margin = sale.commissionable_margin;

  if (typeof margin !== "number" || isNaN(margin)) {
    errors.push("Commissionable margin must be a valid number");
    result.errors = errors;
    return result;
  }

  if (margin < 0) {
    errors.push("Commissionable margin cannot be negative");
    result.errors = errors;
    return result;
  }

  // STEP 2: Determine commission percentage
  let commissionPercent: number | null = null;

  // Check for admin override first (highest priority)
  if (
    sale.admin_override_commission_percent !== null &&
    sale.admin_override_commission_percent !== undefined
  ) {
    commissionPercent = sale.admin_override_commission_percent;
    result.admin_override_commission_percent = commissionPercent;

    if (sale.admin_override_notes) {
      result.admin_override_notes = sale.admin_override_notes;
    }

    logger.info('COMMISSIONS', `Using admin override: ${commissionPercent}%`);
  }
  // Otherwise, use commission band
  else if (
    sale.commission_band &&
    typeof sale.commission_band.commission_percent === "number"
  ) {
    commissionPercent = sale.commission_band.commission_percent;
    logger.info('COMMISSIONS', `Using commission band: ${commissionPercent}%`);
  }
  // No commission percentage available
  else {
    errors.push(
      "No commission percentage available (no commission band assigned and no admin override)"
    );
    result.errors = errors;
    return result;
  }

  // STEP 3: Calculate total commission amount
  const commissionAmount = roundTo2dp(margin * (commissionPercent / 100));
  result.commission_amount = commissionAmount;

  logger.info('COMMISSIONS', `Commission amount: £${commissionAmount} (${commissionPercent}% of £${margin})`);

  // STEP 4: Split commission between introducer and shopper
  let introducerSharePercent = 0;
  let introducerCommission = 0;
  let shopperCommission = commissionAmount;

  // Check if there's an introducer
  if (
    sale.introducer &&
    typeof sale.introducer.commission_percent === "number"
  ) {
    introducerSharePercent = sale.introducer.commission_percent;
    introducerCommission = roundTo2dp(
      commissionAmount * (introducerSharePercent / 100)
    );
    shopperCommission = roundTo2dp(commissionAmount - introducerCommission);

    logger.info('COMMISSIONS', `Introducer split: £${introducerCommission} (${introducerSharePercent}%)`);
    logger.info('COMMISSIONS', `Shopper split: £${shopperCommission}`);
  } else {
    logger.info('COMMISSIONS', `No introducer - 100% to shopper: £${shopperCommission}`);
  }

  // STEP 5: Set final result values
  result.commission_split_introducer = introducerCommission;
  result.commission_split_shopper = shopperCommission;
  result.introducer_share_percent = introducerSharePercent;
  result.errors = errors;

  return result;
}
