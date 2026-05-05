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
// INTRODUCER FEE TYPE
// ============================================================================

export type IntroducerFeeType = "percent" | "flat";

/**
 * Narrow a raw DB value (Drizzle returns text columns as `string | null`)
 * to the IntroducerFeeType union. Any unexpected value falls through to
 * null, which is the safe default at every read site (no recalc, no flat-
 * mode display branch, sheets falls back to bare introducer name).
 */
export function normalizeIntroducerFeeType(
  raw: unknown
): IntroducerFeeType | null {
  if (raw === "flat") return "flat";
  if (raw === "percent") return "percent";
  return null;
}

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

  // Purchase tracking
  supplierInvoiceRef?: string; // Supplier's invoice/receipt reference
  datePurchased?: string; // ISO date string (YYYY-MM-DD) — when item was purchased from supplier

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
  country?: string; // Auto-derived from Xero contact address (used to seed deliveryCountry)
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

// Phase 2 reordered flow: Client -> Supplier & Item -> Pricing -> VAT & Logistics -> Review
export type WizardStep = 0 | 1 | 2 | 3 | 4;

export type WizardState = {
  currentStep: WizardStep;

  // Auto-set on creation; not user-editable in wizard
  saleDate: string; // ISO date

  // Tax scenario (from VAT engine, set on Step 3 — VAT & Logistics)
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

  // Current item being created (Step 1 — Supplier & Item)
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
  deliveryCountry: string; // Auto-derived from Xero contact address; falls back to a prompt on Step 3

  // Logistics data (Step 3 — VAT & Logistics)
  itemLocation: string | null; // "uk" | "outside"
  clientLocation: string | null; // "uk" | "outside"
  purchaseType: string | null; // "retail" | "margin"
  directShip: string | null; // "yes" | "no"
  landedDelivery: string | null; // "yes" | "no"

  // Delivery cost
  hasDeliveryCost: boolean | null; // true = cost to be confirmed, false = free delivery

  // Estimated shipping cost (Step 2 — Pricing)
  shippingCost: number; // Explicit shipping cost in GBP (0 = none)

  // Entrupy fee (Step 2 — Pricing, optional ancillary cost)
  entrupyFee: number;

  // Items (Step 1 — Supplier & Item)
  items: TradeItem[];
  editingItemId: string | null; // ID of item being edited, or 'new'

  // Buyer (Step 0 — Client)
  buyer: Buyer | null;

  // New client flag — derived from buyer history at the moment the contact is selected
  isNewClient: boolean;

  // Introducer (Step 0 — Client). Phase 2 model: free-text name + fee.
  // MC's referrers are paid either as a % of gross profit OR a flat £ amount —
  // the wizard toggles between the two via `introducerFeeType`. The fee is
  // treated as a cost deduction, not a percentage commission split.
  hasIntroducer?: boolean;
  introducerName: string;
  introducerFeeType: IntroducerFeeType;
  introducerFeePercent: number; // used when type === "percent"
  introducerFeeFlat: number; // used when type === "flat" (£ amount)

  // Invoice metadata (Step 4 — Review)
  dueDate: string;
  notes: string;

  // Costs & margins
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
