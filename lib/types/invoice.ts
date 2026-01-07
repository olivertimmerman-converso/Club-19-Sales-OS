/**
 * Club 19 Deal Studio V2 - Domain Types
 *
 * Single source of truth for all trade/deal domain types.
 * Used by wizard UI, API routes, and Make.com payload builder.
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum TaxRegime {
  UK_VAT = "UK_VAT",
  EU_VAT = "EU_VAT",
  NON_EU = "NON_EU",
  MARGIN_SCHEME = "MARGIN_SCHEME",
}

export enum PaymentMethod {
  CARD = "CARD",
  BANK_TRANSFER = "BANK_TRANSFER",
}

export enum TradeSource {
  DEAL_STUDIO = "DEAL_STUDIO_V2",
}

// ============================================================================
// BUYER TYPE
// ============================================================================

export type BuyerType = "b2b" | "end_client";

// ============================================================================
// SUPPLIER
// ============================================================================

export type Supplier = {
  name: string;
  country: string; // e.g. "UK", "France", "USA"
  taxRegime: TaxRegime;
  xataId?: string; // Xata Suppliers table ID (optional, set when supplier selected from search)
};

// ============================================================================
// TRADE ITEM
// ============================================================================

export type TradeItem = {
  // Client-side identifier
  id: string; // UUID for managing items in wizard

  // Product information
  brand: string;
  category: string;
  description: string;
  quantity: number; // Default 1

  // Supplier side economics
  supplier: Supplier;
  buyPrice: number;
  buyCurrency: string; // "GBP", "EUR", "USD", etc.
  fxRate?: number; // Required if buyCurrency !== sellCurrency

  // Buyer side economics
  sellPrice: number;
  sellCurrency: string; // Typically "GBP"

  // Tax fields (from existing VAT wizard logic)
  accountCode: string;
  taxType: string;
  taxLabel: string;
  lineAmountTypes: string;
  brandTheme: string;

  // Computed fields (optional, calculated on review)
  buyPriceGBP?: number; // Computed: buyPrice * fxRate (if needed)
  sellPriceGBP?: number; // Computed: sellPrice (if GBP) or converted
  grossMarginGBP?: number; // Computed: (sellPriceGBP - buyPriceGBP) * quantity
};

// ============================================================================
// BUYER
// ============================================================================

export type Buyer = {
  // Required fields
  name: string;

  // Optional fields
  xeroContactId?: string; // From customer search
  buyer_type?: BuyerType; // B2B or End Client (affects commission structure)
};

// ============================================================================
// IMPLIED COSTS
// ============================================================================

export type ImpliedCosts = {
  shipping: number; // Total shipping cost in GBP
  cardFees: number; // Total card processing fees in GBP
  total: number; // shipping + cardFees
};

// ============================================================================
// TRADE (Full payload sent to Make.com)
// ============================================================================

export type Trade = {
  // Metadata
  tradeId: string; // UUID generated client-side
  createdAt: string; // ISO timestamp
  source: TradeSource; // Always DEAL_STUDIO_V2

  // Participants
  buyer: Buyer;
  items: TradeItem[]; // 1-10 items per trade

  // Payment & logistics
  paymentMethod: PaymentMethod;
  deliveryCountry: string; // Where items will be delivered (used for shipping cost estimation)
  dueDate: string; // ISO date string (YYYY-MM-DD)
  notes?: string;

  // Costs & margins (computed)
  impliedCosts: ImpliedCosts;
  grossMarginGBP?: number; // Sum of all items' gross margins
  estimatedImportExportGBP?: number | null; // Estimated import/export taxes in GBP (optional)
  importVAT?: number | null; // Import VAT cost (20% of buy price when item enters UK) - internal only
  commissionableMarginGBP?: number; // grossMarginGBP - impliedCosts.total - estimatedImportExportGBP - importVAT

  // Xero integration (populated after Make.com response)
  invoiceNumber?: string;
  invoiceId?: string;
  invoiceUrl?: string;
};

// ============================================================================
// MAKE.COM RESPONSE
// ============================================================================

export type MakeResponse = {
  status: "success" | "error";
  message?: string;

  // Xero details (if success)
  invoiceNumber?: string;
  invoiceId?: string;
  invoiceUrl?: string;

  // Airtable confirmation (if success)
  airtableRecordId?: string;

  // Commission calculation
  commissionableMarginGBP?: number;
};

// ============================================================================
// WIZARD STATE
// ============================================================================

export type WizardStep = 0 | 1 | 2 | 3 | 4; // Item Details -> Pricing -> Supplier & Buyer -> Logistics & Tax -> Review & Create

export type WizardState = {
  currentStep: WizardStep;

  // Step 0: Tax scenario (from existing VAT logic)
  taxScenario: {
    accountCode: string;
    taxType: string;
    taxLabel: string;
    lineAmountTypes: string;
    brandTheme: string;
    amountsAre: string;
    taxLiability: string;
    vatReclaim: string;
  } | null;

  // Current item being created (Steps 0-1)
  currentItem: {
    brand: string;
    category: string;
    description: string;
    quantity: number;
    buyPrice?: number;
    sellPrice?: number;
  } | null;

  // Supplier & purchase defaults
  currentSupplier: Supplier | null;
  currentPaymentMethod: PaymentMethod;
  deliveryCountry: string; // Where items will be delivered (for shipping cost estimation)

  // Logistics data (Step 0)
  itemLocation: string | null; // "uk" | "outside"
  clientLocation: string | null; // "uk" | "outside"
  purchaseType: string | null; // "retail" | "margin"
  directShip: string | null; // "yes" | "no"
  landedDelivery: string | null; // "yes" | "no"

  // Shipping method (Step 3 - Logistics & Tax)
  shippingMethod: "to_be_shipped" | "hand_delivery" | null;
  shippingCostFactored: boolean; // Has shipping been factored into client price?

  // Items (Step 1)
  items: TradeItem[];
  editingItemId: string | null; // ID of item being edited, or 'new'

  // Buyer (Step 2)
  buyer: Buyer | null;

  // Introducer (Step 2 - optional boolean flag only, details added later in Sales OS)
  hasIntroducer?: boolean;

  // Invoice metadata (Step 2)
  dueDate: string;
  notes: string;

  // Costs & margins (Step 2 - Review)
  impliedCosts: ImpliedCosts | null;
  estimatedImportExportGBP: number | null;
  importVAT: number | null; // Import VAT cost (20% of buy price when item enters UK)

  // UI state
  isSubmitting: boolean;
  error: string | null;
};

// ============================================================================
// TYPE GUARDS & VALIDATION HELPERS
// ============================================================================

export function isValidTrade(trade: Partial<Trade>): trade is Trade {
  return !!(
    trade.tradeId &&
    trade.createdAt &&
    trade.source &&
    trade.buyer &&
    trade.buyer.name &&
    trade.items &&
    trade.items.length > 0 &&
    trade.items.length <= 10 &&
    trade.paymentMethod &&
    trade.dueDate &&
    trade.impliedCosts
  );
}

export function isValidTradeItem(item: Partial<TradeItem>): item is TradeItem {
  return !!(
    item.id &&
    item.brand &&
    item.category &&
    item.description &&
    item.quantity &&
    item.quantity > 0 &&
    item.supplier &&
    item.supplier.name &&
    item.buyPrice !== undefined &&
    item.buyPrice >= 0 &&
    item.buyCurrency &&
    item.sellPrice !== undefined &&
    item.sellPrice >= 0 &&
    item.sellCurrency &&
    item.accountCode &&
    item.taxType
  );
}

// NOTE: requiresFxRate() removed - FX logic deprecated in favor of GBP-only v2
