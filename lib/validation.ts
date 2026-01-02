/**
 * Club 19 Sales OS - Validation Layer
 *
 * Validates all incoming sale data before processing
 * Ensures data integrity, safety, and business rule compliance
 *
 * All validation is non-throwing - errors collected in arrays
 */

import type { CreateSalePayload } from "./xata-sales";
import { calculateExVat } from "./economics";
import * as logger from './logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate sale input data
 *
 * Checks:
 * - Required fields present
 * - Numeric constraints
 * - Economic sanity (selling price vs buy price)
 * - String field trimming
 * - Business logic rules
 *
 * @param input - Sale payload to validate
 * @returns Validation result with errors and warnings (never throws)
 */
export function validateSaleInput(input: CreateSalePayload): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info('VALIDATION', 'Starting sale input validation');

  // =========================================================================
  // 1) REQUIRED FIELD CHECKS
  // =========================================================================

  if (!input.sale_reference || input.sale_reference.trim() === "") {
    errors.push("Sale reference is required");
  }

  if (!input.brand || input.brand.trim() === "") {
    errors.push("Brand is required");
  }

  if (!input.category || input.category.trim() === "") {
    errors.push("Category is required");
  }

  if (input.quantity === undefined || input.quantity === null) {
    errors.push("Quantity is required");
  }

  if (!input.buyerName || input.buyerName.trim() === "") {
    errors.push("Buyer name is required");
  }

  if (!input.supplierName || input.supplierName.trim() === "") {
    errors.push("Supplier name is required");
  }

  // =========================================================================
  // 2) NUMERIC FIELD CHECKS
  // =========================================================================

  // Sale amount validation
  if (input.sale_amount_inc_vat === undefined || input.sale_amount_inc_vat === null) {
    errors.push("Sale amount (inc VAT) is required");
  } else if (typeof input.sale_amount_inc_vat !== "number" || isNaN(input.sale_amount_inc_vat)) {
    errors.push("Sale amount must be a valid number");
  } else if (input.sale_amount_inc_vat <= 0) {
    errors.push("Sale amount must be greater than zero");
  }

  // Buy price validation
  if (input.buy_price === undefined || input.buy_price === null) {
    errors.push("Buy price is required");
  } else if (typeof input.buy_price !== "number" || isNaN(input.buy_price)) {
    errors.push("Buy price must be a valid number");
  } else if (input.buy_price < 0) {
    errors.push("Buy price cannot be negative");
  }

  // Card fees validation (optional but must be valid if provided)
  if (input.card_fees !== undefined && input.card_fees !== null) {
    if (typeof input.card_fees !== "number" || isNaN(input.card_fees)) {
      errors.push("Card fees must be a valid number");
    } else if (input.card_fees < 0) {
      errors.push("Card fees cannot be negative");
    }
  }

  // Shipping cost validation (optional but must be valid if provided)
  if (input.shipping_cost !== undefined && input.shipping_cost !== null) {
    if (typeof input.shipping_cost !== "number" || isNaN(input.shipping_cost)) {
      errors.push("Shipping cost must be a valid number");
    } else if (input.shipping_cost < 0) {
      errors.push("Shipping cost cannot be negative");
    }
  }

  // Quantity validation
  if (input.quantity !== undefined && input.quantity !== null) {
    if (typeof input.quantity !== "number" || isNaN(input.quantity)) {
      errors.push("Quantity must be a valid number");
    } else if (input.quantity <= 0) {
      errors.push("Quantity must be greater than zero");
    } else if (!Number.isInteger(input.quantity)) {
      warnings.push("Quantity should be a whole number");
    }
  }

  // =========================================================================
  // 3) ECONOMIC SANITY CHECKS
  // =========================================================================

  // Calculate sale_amount_ex_vat for validation
  const saleAmountExVat = calculateExVat(input.sale_amount_inc_vat);

  // Check if selling price is below purchase price (potential loss)
  if (
    typeof saleAmountExVat === "number" &&
    !isNaN(saleAmountExVat) &&
    typeof input.buy_price === "number" &&
    !isNaN(input.buy_price)
  ) {
    if (saleAmountExVat < input.buy_price) {
      errors.push(
        `Selling price (£${saleAmountExVat.toFixed(2)} ex VAT) is below purchase price (£${input.buy_price.toFixed(2)})`
      );
    }
  }

  // Check for suspiciously high margins (warning only)
  if (
    typeof saleAmountExVat === "number" &&
    !isNaN(saleAmountExVat) &&
    typeof input.buy_price === "number" &&
    !isNaN(input.buy_price) &&
    input.buy_price > 0
  ) {
    const marginPercent = ((saleAmountExVat - input.buy_price) / input.buy_price) * 100;
    if (marginPercent > 200) {
      // Over 200% margin
      warnings.push(
        `Very high margin detected (${marginPercent.toFixed(0)}%) - please verify pricing`
      );
    }
  }

  // =========================================================================
  // 4) STRING FIELD TRIMMING AND VALIDATION
  // =========================================================================

  // Brand validation (required and non-empty)
  if (input.brand && input.brand.trim() === "") {
    errors.push("Brand cannot be empty or whitespace only");
  }

  // Category validation (required and non-empty)
  if (input.category && input.category.trim() === "") {
    errors.push("Category cannot be empty or whitespace only");
  }

  // Item title validation (optional but must not be empty string if provided)
  if (input.item_title && input.item_title.trim() === "") {
    warnings.push("Item title is empty or whitespace only");
  }

  // Sale reference validation (required and non-empty)
  if (input.sale_reference && input.sale_reference.trim() === "") {
    errors.push("Sale reference cannot be empty or whitespace only");
  }

  // =========================================================================
  // 5) INTRODUCER VALIDATION
  // =========================================================================

  // Validate introducer commission if provided
  if (input.introducerCommission !== undefined && input.introducerCommission !== null) {
    if (typeof input.introducerCommission !== "number" || isNaN(input.introducerCommission)) {
      errors.push("Introducer commission must be a valid number");
    } else if (input.introducerCommission < 0) {
      errors.push("Introducer commission cannot be negative");
    } else if (input.introducerCommission > 100) {
      errors.push("Introducer commission cannot exceed 100%");
    }
  }

  // If introducer name provided but no commission, warn
  if (input.introducerName && input.introducerName.trim() !== "") {
    if (!input.introducerCommission || input.introducerCommission === 0) {
      warnings.push("Introducer specified but no commission percentage set");
    }
  }

  // =========================================================================
  // 6) ADMIN OVERRIDE VALIDATION
  // =========================================================================

  if (
    input.admin_override_commission_percent !== undefined &&
    input.admin_override_commission_percent !== null
  ) {
    if (
      typeof input.admin_override_commission_percent !== "number" ||
      isNaN(input.admin_override_commission_percent)
    ) {
      errors.push("Admin override commission must be a valid number");
    } else if (input.admin_override_commission_percent < 0) {
      errors.push("Admin override commission cannot be negative");
    } else if (input.admin_override_commission_percent > 100) {
      errors.push("Admin override commission cannot exceed 100%");
    }
  }

  // =========================================================================
  // 7) BUYER TYPE VALIDATION (Story 1)
  // =========================================================================

  if (!input.buyerType || input.buyerType.trim() === "") {
    warnings.push("Buyer type (B2B/End Client) not specified - analytics and reporting may be affected");
  }

  // =========================================================================
  // 8) AUTHENTICITY VALIDATION (Story 2)
  // =========================================================================

  if (!input.authenticity_status || input.authenticity_status.trim() === "") {
    warnings.push("Authenticity status not specified - defaults to 'not_verified'");
  }

  if (!input.supplier_receipt_attached) {
    warnings.push("Supplier receipt not attached - authenticity verification may be delayed");
  }

  // =========================================================================
  // 9) INVOICE DUE DATE VALIDATION (Story 4)
  // =========================================================================

  if (!input.invoice_due_date) {
    warnings.push("Invoice due date not specified - payment tracking may be affected");
  }

  // =========================================================================
  // VALIDATION COMPLETE
  // =========================================================================

  if (errors.length > 0) {
    logger.error('VALIDATION', `Found ${errors.length} errors`, errors);
  }

  if (warnings.length > 0) {
    logger.warn('VALIDATION', `Found ${warnings.length} warnings`, warnings);
  }

  if (errors.length === 0 && warnings.length === 0) {
    logger.info('VALIDATION', 'All checks passed');
  }

  return { errors, warnings };
}

/**
 * Check if validation result has errors
 */
export function hasValidationErrors(result: ValidationResult): boolean {
  return result.errors.length > 0;
}

/**
 * Check if validation result has warnings
 */
export function hasValidationWarnings(result: ValidationResult): boolean {
  return result.warnings.length > 0;
}

/**
 * Format validation errors as a single string
 */
export function formatValidationErrors(result: ValidationResult): string {
  return result.errors.join("; ");
}

/**
 * Format validation warnings as a single string
 */
export function formatValidationWarnings(result: ValidationResult): string {
  return result.warnings.join("; ");
}
