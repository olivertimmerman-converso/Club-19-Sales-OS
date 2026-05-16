/**
 * Club 19 Sales OS - Sale Completeness Detection
 *
 * Utility function to assess whether a sale has all required data fields.
 * Used to identify sales that need data completion after adoption or claiming.
 *
 * This module works both server-side and client-side.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CompletenessResult {
  isComplete: boolean;
  completionPercentage: number; // 0-100
  missingFields: MissingField[];
  totalFields: number;
  completedFields: number;
}

export interface MissingField {
  field: string; // column name e.g. "supplier_id"
  label: string; // human readable e.g. "Supplier"
  priority: "required" | "recommended";
}

/**
 * Minimal sale record interface for completeness checking.
 * Uses camelCase to match Drizzle schema field names.
 */
export interface SaleForCompleteness {
  supplierId?: string | null;
  category?: string | null;
  brand?: string | null;
  buyPrice?: number | null;
  brandingTheme?: string | null;
  buyerType?: string | null;
  itemTitle?: string | null;
  shippingCost?: number | null;
  cardFees?: number | null;
}

// ============================================================================
// FIELD DEFINITIONS
// ============================================================================

interface FieldCheck {
  field: keyof SaleForCompleteness;
  label: string;
  priority: "required" | "recommended";
  isMissing: (value: unknown) => boolean;
}

/**
 * Field checks for completeness assessment.
 *
 * IMPORTANT:
 * - For shipping_cost and card_fees: 0 is VALID (field is complete)
 * - For buy_price: 0 is INVALID (every sale has a buy price)
 * - For brand/category: "Unknown" counts as missing
 */
const FIELD_CHECKS: FieldCheck[] = [
  {
    field: "supplierId",
    label: "Supplier",
    priority: "required",
    isMissing: (v) => v === null || v === undefined || v === "",
  },
  {
    field: "category",
    label: "Category",
    priority: "required",
    isMissing: (v) =>
      v === null ||
      v === undefined ||
      v === "" ||
      (typeof v === "string" && v.toLowerCase() === "unknown"),
  },
  {
    field: "brand",
    label: "Brand",
    priority: "required",
    isMissing: (v) =>
      v === null ||
      v === undefined ||
      v === "" ||
      (typeof v === "string" && v.toLowerCase() === "unknown"),
  },
  {
    field: "buyPrice",
    label: "Buy Price",
    priority: "required",
    isMissing: (v) => v === null || v === undefined || v === 0,
  },
  {
    field: "brandingTheme",
    label: "VAT Treatment",
    priority: "required",
    isMissing: (v) => v === null || v === undefined || v === "",
  },
  {
    field: "buyerType",
    label: "Buyer Type",
    priority: "recommended",
    isMissing: (v) => v === null || v === undefined || v === "",
  },
  {
    field: "itemTitle",
    label: "Item Description",
    priority: "recommended",
    isMissing: (v) => v === null || v === undefined || v === "",
  },
  {
    field: "shippingCost",
    label: "Shipping Cost",
    priority: "recommended",
    // Note: 0 is valid - only null/undefined is missing
    isMissing: (v) => v === null || v === undefined,
  },
  {
    field: "cardFees",
    label: "Card Fees",
    priority: "recommended",
    // Note: 0 is valid - only null/undefined is missing
    isMissing: (v) => v === null || v === undefined,
  },
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Assess the completeness of a sale record.
 *
 * @param sale - Sale record with fields to check
 * @returns Completeness assessment with missing fields and percentage
 */
export function assessCompleteness(sale: SaleForCompleteness): CompletenessResult {
  const missingFields: MissingField[] = [];
  let completedFields = 0;
  const totalFields = FIELD_CHECKS.length;

  for (const check of FIELD_CHECKS) {
    const value = sale[check.field];
    if (check.isMissing(value)) {
      missingFields.push({
        field: check.field,
        label: check.label,
        priority: check.priority,
      });
    } else {
      completedFields++;
    }
  }

  const completionPercentage = Math.round((completedFields / totalFields) * 100);

  // A sale is complete if ALL required fields are present
  const hasAllRequired = !missingFields.some((f) => f.priority === "required");
  const isComplete = hasAllRequired && completionPercentage === 100;

  return {
    isComplete,
    completionPercentage,
    missingFields,
    totalFields,
    completedFields,
  };
}

/**
 * Check if a sale has at least one missing required field.
 * Useful for quick filtering without full assessment.
 *
 * @param sale - Sale record with fields to check
 * @returns true if any required field is missing
 */
export function hasIncompleteRequiredFields(sale: SaleForCompleteness): boolean {
  return FIELD_CHECKS.filter((c) => c.priority === "required").some((check) =>
    check.isMissing(sale[check.field])
  );
}

/**
 * Get completion bar color based on percentage.
 *
 * @param percentage - Completion percentage (0-100)
 * @returns Tailwind color class
 */
export function getCompletionColor(percentage: number): string {
  if (percentage <= 40) return "bg-red-500";
  if (percentage <= 70) return "bg-amber-500";
  return "bg-green-500";
}
