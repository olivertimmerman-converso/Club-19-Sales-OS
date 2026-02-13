/**
 * Club 19 Sales OS - Drizzle ORM Schema
 *
 * This schema mirrors the existing Xata database structure.
 * Tables: shoppers, buyers, suppliers, introducers, commissionBands,
 *         sales, errors, paymentSchedule, lineItems,
 *         legacySuppliers, legacyClients, legacyTrades
 *
 * Migration from Xata SDK to Drizzle ORM (Feb 2026 deadline)
 */

import {
  pgTable,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// SHOPPERS
// ============================================================================
export const shoppers = pgTable(
  "shoppers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email"),
    clerkUserId: text("clerk_user_id"),
    commissionScheme: text("commission_scheme"),
    active: boolean("active").default(true),
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("shoppers_name_idx").on(table.name),
    index("shoppers_clerk_user_id_idx").on(table.clerkUserId),
  ]
);

export const shoppersRelations = relations(shoppers, ({ many }) => ({
  sales: many(sales, { relationName: "shopperSales" }),
  ownedBuyers: many(buyers, { relationName: "buyerOwner" }),
  ownedSales: many(sales, { relationName: "ownerSales" }),
}));

// ============================================================================
// BUYERS
// ============================================================================
export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email"),
    xeroContactId: text("xero_contact_id"),
    ownerId: uuid("owner_id").references(() => shoppers.id),
    ownerChangedAt: timestamp("owner_changed_at", { withTimezone: true }),
    ownerChangedBy: text("owner_changed_by"),
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("buyers_name_idx").on(table.name),
    index("buyers_xero_contact_id_idx").on(table.xeroContactId),
  ]
);

export const buyersRelations = relations(buyers, ({ one, many }) => ({
  owner: one(shoppers, {
    fields: [buyers.ownerId],
    references: [shoppers.id],
    relationName: "buyerOwner",
  }),
  sales: many(sales, { relationName: "buyerSales" }),
}));

// ============================================================================
// SUPPLIERS
// ============================================================================
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email"),
    xeroContactId: text("xero_contact_id"),
    pendingApproval: boolean("pending_approval").default(false),
    createdBy: text("created_by"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("suppliers_name_idx").on(table.name),
    index("suppliers_xero_contact_id_idx").on(table.xeroContactId),
  ]
);

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  sales: many(sales, { relationName: "supplierSales" }),
  lineItems: many(lineItems, { relationName: "supplierLineItems" }),
}));

// ============================================================================
// INTRODUCERS
// ============================================================================
export const introducers = pgTable("introducers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  commissionPercent: doublePrecision("commission_percent"),
  createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
});

export const introducersRelations = relations(introducers, ({ many }) => ({
  sales: many(sales, { relationName: "introducerSales" }),
}));

// ============================================================================
// COMMISSION BANDS
// ============================================================================
export const commissionBands = pgTable("commission_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandType: text("band_type"),
  minThreshold: doublePrecision("min_threshold"),
  maxThreshold: doublePrecision("max_threshold"),
  commissionPercent: doublePrecision("commission_percent"),
  createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
});

export const commissionBandsRelations = relations(
  commissionBands,
  ({ many }) => ({
    sales: many(sales, { relationName: "commissionBandSales" }),
  })
);

// ============================================================================
// SALES (Master Table - ~50 columns)
// ============================================================================
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // References
    saleReference: text("sale_reference"),
    saleDate: timestamp("sale_date", { withTimezone: true }),

    // Foreign Keys
    shopperId: uuid("shopper_id").references(() => shoppers.id),
    buyerId: uuid("buyer_id").references(() => buyers.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    introducerId: uuid("introducer_id").references(() => introducers.id),
    commissionBandId: uuid("commission_band_id").references(
      () => commissionBands.id
    ),
    ownerId: uuid("owner_id").references(() => shoppers.id),

    // Item Details
    brand: text("brand"),
    category: text("category"),
    itemTitle: text("item_title"),
    quantity: integer("quantity"),
    currency: text("currency"),
    brandingTheme: text("branding_theme"),

    // Financial - Sale Amounts
    saleAmountIncVat: doublePrecision("sale_amount_inc_vat"),
    saleAmountExVat: doublePrecision("sale_amount_ex_vat"),
    buyPrice: doublePrecision("buy_price"),
    cardFees: doublePrecision("card_fees"),
    shippingCost: doublePrecision("shipping_cost"),
    directCosts: doublePrecision("direct_costs"),
    impliedShipping: doublePrecision("implied_shipping"),
    grossMargin: doublePrecision("gross_margin"),
    commissionableMargin: doublePrecision("commissionable_margin"),

    // Xero Integration
    xeroInvoiceNumber: text("xero_invoice_number"),
    xeroInvoiceId: text("xero_invoice_id"),
    xeroInvoiceUrl: text("xero_invoice_url"),
    invoiceStatus: text("invoice_status"),
    invoicePaidDate: timestamp("invoice_paid_date", { withTimezone: true }),
    xeroPaymentDate: timestamp("xero_payment_date", { withTimezone: true }),

    // Commission
    commissionAmount: doublePrecision("commission_amount"),
    commissionSplitIntroducer: doublePrecision("commission_split_introducer"),
    commissionSplitShopper: doublePrecision("commission_split_shopper"),
    introducerSharePercent: doublePrecision("introducer_share_percent"),
    adminOverrideCommissionPercent: doublePrecision(
      "admin_override_commission_percent"
    ),
    adminOverrideNotes: jsonb("admin_override_notes").$type<string[]>(),
    commissionLocked: boolean("commission_locked").default(false),
    commissionPaid: boolean("commission_paid").default(false),
    commissionLockDate: timestamp("commission_lock_date", {
      withTimezone: true,
    }),
    commissionPaidDate: timestamp("commission_paid_date", {
      withTimezone: true,
    }),
    commissionClawback: boolean("commission_clawback"),
    commissionClawbackDate: timestamp("commission_clawback_date", {
      withTimezone: true,
    }),
    commissionClawbackReason: text("commission_clawback_reason"),

    // Introducer
    hasIntroducer: boolean("has_introducer").default(false),
    introducerCommission: doublePrecision("introducer_commission"),

    // Payment Plan
    isPaymentPlan: boolean("is_payment_plan").default(false),
    paymentPlanInstalments: integer("payment_plan_instalments"),

    // Shipping
    shippingMethod: text("shipping_method"),
    shippingCostConfirmed: boolean("shipping_cost_confirmed"),

    // Status & Metadata
    status: text("status"),
    source: text("source"),
    buyerType: text("buyer_type"),
    needsAllocation: boolean("needs_allocation").default(false),
    internalNotes: text("internal_notes"),

    // Allocation Tracking (management assigns sale to shopper)
    allocatedBy: text("allocated_by"), // Clerk user ID who allocated
    allocatedAt: timestamp("allocated_at", { withTimezone: true }),

    // Completion Tracking (shopper completes sale details)
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"), // Clerk user ID who completed

    // Error Tracking
    errorFlag: boolean("error_flag"),
    errorMessage: jsonb("error_message").$type<string[]>(),

    // Soft Delete & Dismissal
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    dismissed: boolean("dismissed").default(false),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedBy: text("dismissed_by"),

    // JSON Fields
    linkedInvoices: jsonb("linked_invoices"),

    // Timestamps
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sales_sale_date_idx").on(table.saleDate),
    index("sales_shopper_id_idx").on(table.shopperId),
    index("sales_buyer_id_idx").on(table.buyerId),
    index("sales_xero_invoice_id_idx").on(table.xeroInvoiceId),
    index("sales_deleted_at_idx").on(table.deletedAt),
    index("sales_needs_allocation_idx").on(table.needsAllocation),
    index("sales_source_idx").on(table.source),
    index("sales_completed_at_idx").on(table.completedAt),
  ]
);

export const salesRelations = relations(sales, ({ one, many }) => ({
  shopper: one(shoppers, {
    fields: [sales.shopperId],
    references: [shoppers.id],
    relationName: "shopperSales",
  }),
  buyer: one(buyers, {
    fields: [sales.buyerId],
    references: [buyers.id],
    relationName: "buyerSales",
  }),
  supplier: one(suppliers, {
    fields: [sales.supplierId],
    references: [suppliers.id],
    relationName: "supplierSales",
  }),
  introducer: one(introducers, {
    fields: [sales.introducerId],
    references: [introducers.id],
    relationName: "introducerSales",
  }),
  commissionBand: one(commissionBands, {
    fields: [sales.commissionBandId],
    references: [commissionBands.id],
    relationName: "commissionBandSales",
  }),
  owner: one(shoppers, {
    fields: [sales.ownerId],
    references: [shoppers.id],
    relationName: "ownerSales",
  }),
  errors: many(errors, { relationName: "saleErrors" }),
  paymentSchedule: many(paymentSchedule, { relationName: "salePayments" }),
  lineItems: many(lineItems, { relationName: "saleLineItems" }),
}));

// ============================================================================
// ERRORS
// ============================================================================
export const errors = pgTable(
  "errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id").references(() => sales.id),
    severity: text("severity"),
    source: text("source"),
    message: jsonb("message").$type<string[]>(),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    resolved: boolean("resolved").default(false),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("errors_sale_id_idx").on(table.saleId),
    index("errors_resolved_idx").on(table.resolved),
  ]
);

export const errorsRelations = relations(errors, ({ one }) => ({
  sale: one(sales, {
    fields: [errors.saleId],
    references: [sales.id],
    relationName: "saleErrors",
  }),
}));

// ============================================================================
// PAYMENT SCHEDULE
// ============================================================================
export const paymentSchedule = pgTable(
  "payment_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id").references(() => sales.id),
    instalmentNumber: integer("instalment_number"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    amount: doublePrecision("amount"),
    status: text("status"),
    xeroInvoiceId: text("xero_invoice_id"),
    xeroInvoiceNumber: text("xero_invoice_number"),
    paidDate: timestamp("paid_date", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("payment_schedule_sale_id_idx").on(table.saleId)]
);

export const paymentScheduleRelations = relations(
  paymentSchedule,
  ({ one }) => ({
    sale: one(sales, {
      fields: [paymentSchedule.saleId],
      references: [sales.id],
      relationName: "salePayments",
    }),
  })
);

// ============================================================================
// LINE ITEMS
// ============================================================================
export const lineItems = pgTable(
  "line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id").references(() => sales.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    lineNumber: integer("line_number"),
    brand: text("brand"),
    category: text("category"),
    description: text("description"),
    quantity: integer("quantity"),
    buyPrice: doublePrecision("buy_price"),
    sellPrice: doublePrecision("sell_price"),
    lineTotal: doublePrecision("line_total"),
    lineMargin: doublePrecision("line_margin"),
    createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("line_items_sale_id_idx").on(table.saleId)]
);

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  sale: one(sales, {
    fields: [lineItems.saleId],
    references: [sales.id],
    relationName: "saleLineItems",
  }),
  supplier: one(suppliers, {
    fields: [lineItems.supplierId],
    references: [suppliers.id],
    relationName: "supplierLineItems",
  }),
}));

// ============================================================================
// LEGACY TABLES (For historical data migration)
// ============================================================================

export const legacySuppliers = pgTable("legacy_suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierClean: text("supplier_clean"),
  rawVariants: jsonb("raw_variants").$type<string[]>(),
  requiresReview: boolean("requires_review"),
  reason: text("reason"),
  firstSeen: timestamp("first_seen", { withTimezone: true }),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  tradeCount: integer("trade_count"),
  createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
});

export const legacySuppliersRelations = relations(
  legacySuppliers,
  ({ many }) => ({
    trades: many(legacyTrades, { relationName: "legacySupplierTrades" }),
  })
);

export const legacyClients = pgTable("legacy_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientClean: text("client_clean"),
  rawVariants: jsonb("raw_variants").$type<string[]>(),
  clientStatus: text("client_status"),
  firstSeen: timestamp("first_seen", { withTimezone: true }),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  tradeCount: integer("trade_count"),
  requiresReview: boolean("requires_review"),
  createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
});

export const legacyClientsRelations = relations(legacyClients, ({ many }) => ({
  trades: many(legacyTrades, { relationName: "legacyClientTrades" }),
}));

export const legacyTrades = pgTable("legacy_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  tradeDate: timestamp("trade_date", { withTimezone: true }),
  rawClient: text("raw_client"),
  rawSupplier: text("raw_supplier"),
  clientId: uuid("client_id").references(() => legacyClients.id),
  supplierId: uuid("supplier_id").references(() => legacySuppliers.id),
  item: text("item"),
  brand: text("brand"),
  category: text("category"),
  source: text("source"),
  buyPrice: doublePrecision("buy_price"),
  sellPrice: doublePrecision("sell_price"),
  margin: doublePrecision("margin"),
  invoiceNumber: text("invoice_number"),
  rawRow: jsonb("raw_row"),
  createdAt: timestamp("xata.createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("xata.updatedAt", { withTimezone: true }).defaultNow(),
});

export const legacyTradesRelations = relations(legacyTrades, ({ one }) => ({
  client: one(legacyClients, {
    fields: [legacyTrades.clientId],
    references: [legacyClients.id],
    relationName: "legacyClientTrades",
  }),
  supplier: one(legacySuppliers, {
    fields: [legacyTrades.supplierId],
    references: [legacySuppliers.id],
    relationName: "legacySupplierTrades",
  }),
}));

// ============================================================================
// TYPE EXPORTS (for use in application code)
// ============================================================================

export type Shopper = typeof shoppers.$inferSelect;
export type NewShopper = typeof shoppers.$inferInsert;

export type Buyer = typeof buyers.$inferSelect;
export type NewBuyer = typeof buyers.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

export type Introducer = typeof introducers.$inferSelect;
export type NewIntroducer = typeof introducers.$inferInsert;

export type CommissionBand = typeof commissionBands.$inferSelect;
export type NewCommissionBand = typeof commissionBands.$inferInsert;

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;

export type Error = typeof errors.$inferSelect;
export type NewError = typeof errors.$inferInsert;

export type PaymentScheduleRecord = typeof paymentSchedule.$inferSelect;
export type NewPaymentScheduleRecord = typeof paymentSchedule.$inferInsert;

export type LineItem = typeof lineItems.$inferSelect;
export type NewLineItem = typeof lineItems.$inferInsert;

export type LegacySupplier = typeof legacySuppliers.$inferSelect;
export type NewLegacySupplier = typeof legacySuppliers.$inferInsert;

export type LegacyClient = typeof legacyClients.$inferSelect;
export type NewLegacyClient = typeof legacyClients.$inferInsert;

export type LegacyTrade = typeof legacyTrades.$inferSelect;
export type NewLegacyTrade = typeof legacyTrades.$inferInsert;
