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
// SUPPLIER
// ============================================================================

export type Supplier = {
  name: string;
  country: string; // e.g. "UK", "France", "USA"
  taxRegime: TaxRegime;
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

  // Legacy fields (no longer used in UI, kept for backwards compatibility)
  email?: string;
  phone?: string;
  country?: string;
  tag?: string;
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
  commissionableMarginGBP?: number; // grossMarginGBP - impliedCosts.total

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

export type WizardStep = 0 | 1 | 2 | 3; // Tax -> Supplier -> Items -> Buyer -> Review

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

  // Step 1: Supplier & purchase defaults for current item
  currentSupplier: Supplier | null;
  currentPaymentMethod: PaymentMethod;
  currentBuyCurrency: string;
  currentFxRate: number | null;
  deliveryCountry: string; // Where items will be delivered (for shipping cost estimation)

  // Step 2: Items
  items: TradeItem[];
  editingItemId: string | null; // ID of item being edited, or 'new'

  // Step 3: Buyer
  buyer: Buyer | null;

  // Invoice metadata
  dueDate: string;
  notes: string;

  // Step 4: Review
  impliedCosts: ImpliedCosts | null;

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

export function requiresFxRate(
  item: Pick<TradeItem, "buyCurrency" | "sellCurrency">,
): boolean {
  return item.buyCurrency !== item.sellCurrency;
}
