/**
 * Club 19 Deal Studio V2 - Zod Validation Schemas
 *
 * Mirrors the TypeScript types from lib/types/invoice.ts
 * Used for API request validation and form validation
 */

import { z } from "zod";
import { TaxRegime, PaymentMethod, TradeSource } from "@/lib/types/invoice";
import { MAX_ITEMS_PER_TRADE } from "@/lib/constants";

// ============================================================================
// ENUMS
// ============================================================================

export const TaxRegimeSchema = z.nativeEnum(TaxRegime);
export const PaymentMethodSchema = z.nativeEnum(PaymentMethod);
export const TradeSourceSchema = z.nativeEnum(TradeSource);

// ============================================================================
// SUPPLIER
// ============================================================================

export const SupplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  country: z.string().min(2, "Country is required"),
  taxRegime: TaxRegimeSchema,
});

// ============================================================================
// TRADE ITEM
// ============================================================================

export const TradeItemSchema = z
  .object({
    id: z.string().uuid(),

    // Product
    brand: z.string().min(1, "Brand is required"),
    category: z.string().min(1, "Category is required"),
    description: z.string().min(1, "Description is required"),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),

    // Supplier side
    supplier: SupplierSchema,
    buyPrice: z.number().min(0, "Buy price must be non-negative"),
    buyCurrency: z.string().length(3, "Currency must be 3 characters"),
    fxRate: z.number().positive().optional(),

    // Buyer side
    sellPrice: z.number().min(0, "Sell price must be non-negative"),
    sellCurrency: z.string().length(3, "Currency must be 3 characters"),

    // Tax fields
    accountCode: z.string().min(1),
    taxType: z.string().min(1),
    taxLabel: z.string().min(1),
    lineAmountTypes: z.string().min(1),
    brandTheme: z.string().min(1),

    // Computed fields (optional)
    buyPriceGBP: z.number().optional(),
    sellPriceGBP: z.number().optional(),
    grossMarginGBP: z.number().optional(),
  })
  .refine(
    (data) => {
      // If buy currency !== sell currency, FX rate is required
      if (data.buyCurrency !== data.sellCurrency) {
        return data.fxRate !== undefined && data.fxRate > 0;
      }
      return true;
    },
    {
      message: "FX rate is required when buy and sell currencies differ",
      path: ["fxRate"],
    },
  );

// ============================================================================
// BUYER
// ============================================================================

export const BuyerSchema = z.object({
  name: z.string().min(1, "Buyer name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  xeroContactId: z.string().optional(),
  country: z.string().optional(),
  tag: z.string().optional(),
});

// ============================================================================
// IMPLIED COSTS
// ============================================================================

export const ImpliedCostsSchema = z.object({
  shipping: z.number().min(0),
  cardFees: z.number().min(0),
  total: z.number().min(0),
});

// ============================================================================
// TRADE
// ============================================================================

export const TradeSchema = z.object({
  // Metadata
  tradeId: z.string().uuid(),
  createdAt: z.string().datetime(),
  source: TradeSourceSchema,

  // Participants
  buyer: BuyerSchema,
  items: z
    .array(TradeItemSchema)
    .min(1, "At least one item is required")
    .max(MAX_ITEMS_PER_TRADE, `Maximum ${MAX_ITEMS_PER_TRADE} items per trade`),

  // Payment & logistics
  paymentMethod: PaymentMethodSchema,
  deliveryCountry: z.string().min(2, "Delivery country is required"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be in YYYY-MM-DD format"),
  notes: z.string().optional(),

  // Costs & margins
  impliedCosts: ImpliedCostsSchema,
  grossMarginGBP: z.number().optional(),
  commissionableMarginGBP: z.number().optional(),

  // Xero integration (optional, populated by Make.com response)
  invoiceNumber: z.string().optional(),
  invoiceId: z.string().optional(),
  invoiceUrl: z.string().url().optional(),
});

// ============================================================================
// MAKE.COM RESPONSE
// ============================================================================

export const MakeResponseSchema = z.object({
  status: z.enum(["success", "error"]),
  message: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceId: z.string().optional(),
  invoiceUrl: z.string().url().optional(),
  airtableRecordId: z.string().optional(),
  commissionableMarginGBP: z.number().optional(),
});

// ============================================================================
// TYPE EXPORTS (inferred from schemas)
// ============================================================================

export type TradeSchemaType = z.infer<typeof TradeSchema>;
export type TradeItemSchemaType = z.infer<typeof TradeItemSchema>;
export type BuyerSchemaType = z.infer<typeof BuyerSchema>;
export type SupplierSchemaType = z.infer<typeof SupplierSchema>;
