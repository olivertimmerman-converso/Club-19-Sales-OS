/**
 * Xata Sales OS - Master Backend Module
 *
 * Consolidated integration layer for Club 19 Sales OS
 * Handles all database operations for sales tracking
 *
 * MIGRATION STATUS: Converted from Xata SDK to Drizzle ORM (Feb 2026)
 * Original Xata code is preserved as comments above each Drizzle query
 */

// ============================================================================
// DRIZZLE IMPORTS (Replaces Xata SDK)
// ============================================================================
import { db } from "@/db";
import {
  shoppers,
  buyers,
  suppliers,
  introducers,
  commissionBands,
  sales,
  errors,
  lineItems,
  type Shopper,
  type Buyer,
  type Supplier,
  type Introducer,
  type CommissionBand,
  type Sale,
  type LineItem,
} from "@/db/schema";
import { eq, and, lte, desc, asc } from "drizzle-orm";

// ============================================================================
// LEGACY XATA IMPORTS (Preserved for reference - DO NOT USE)
// ============================================================================
// import { XataClient } from "@/src/xata";
// import type {
//   ShoppersRecord,
//   BuyersRecord,
//   SuppliersRecord,
//   IntroducersRecord,
//   CommissionBandsRecord,
//   SalesRecord,
//   LineItemsRecord,
// } from "@/src/xata";

// Type aliases for backwards compatibility with existing code
export type ShoppersRecord = Shopper;
export type BuyersRecord = Buyer;
export type SuppliersRecord = Supplier;
export type IntroducersRecord = Introducer;
export type CommissionBandsRecord = CommissionBand;
export type SalesRecord = Sale;
export type LineItemsRecord = LineItem;

import { calculateCommission } from "./commission-engine";
import { transitionSaleStatus } from "./deal-lifecycle";
import { validateSaleInput, formatValidationErrors } from "./validation";
import { ERROR_TYPES, ERROR_TRIGGERED_BY, ERROR_GROUPS } from "./error-types";
import {
  sanitizeString,
  sanitizeNotes,
  sanitizeContactName,
  sanitizeOptional,
} from "./sanitize";
import { calculateSaleEconomics as calculateEconomics } from "./economics";
import * as logger from "./logger";

// ============================================================================
// UPSTREAM TABLE HELPERS - SHOPPERS
// ============================================================================

/**
 * Get or create a shopper, preferring a Clerk-linked row when available.
 *
 * Resolution order:
 *   1. Match by `clerkUserId` (most reliable — avoids legacy duplicates)
 *   2. Match by exact name + active=true
 *   3. Match by exact name (any state)
 *   4. Create a new row
 *
 * Without the clerkUserId hint we historically attached new sales to whichever
 * row matched the user's display name first — including legacy/inactive
 * duplicates created before clerkUserId was wired up. That's how MC's sales
 * kept landing on the inactive "Mary Clair" record while her canonical
 * "Mary Clair Bromfield" record sat dormant.
 *
 * @param name - The shopper's full name (from Clerk)
 * @param clerkUserId - Optional Clerk user ID; strongly preferred when known
 */
export async function getOrCreateShopperByName(
  name: string,
  clerkUserId?: string
): Promise<Shopper> {
  if (clerkUserId) {
    const [byClerk] = await db
      .select()
      .from(shoppers)
      .where(eq(shoppers.clerkUserId, clerkUserId))
      .limit(1);
    if (byClerk) return byClerk;
  }

  const [activeMatch] = await db
    .select()
    .from(shoppers)
    .where(and(eq(shoppers.name, name), eq(shoppers.active, true)))
    .limit(1);
  if (activeMatch) return activeMatch;

  const [anyMatch] = await db
    .select()
    .from(shoppers)
    .where(eq(shoppers.name, name))
    .limit(1);
  if (anyMatch) return anyMatch;

  const [created] = await db
    .insert(shoppers)
    .values({
      name,
      email: "",
      commissionScheme: "",
      active: true,
      clerkUserId: clerkUserId ?? null,
    })
    .returning();

  return created;
}

/**
 * Get a shopper by their Clerk user ID
 *
 * @param clerkId - The Clerk user ID
 * @returns Shopper record or null if not found
 *
 * @example
 * const shopper = await getShopperByClerkId("user_abc123");
 */
export async function getShopperByClerkId(
  clerkId: string
): Promise<Shopper | null> {
  // ORIGINAL XATA:
  // return await xata().db.Shoppers.filter({ name: clerkId }).getFirst();

  // DRIZZLE:
  // Assuming clerk_id is stored in a custom field or matched by name
  // Adjust this based on your actual Clerk integration
  const [result] = await db
    .select()
    .from(shoppers)
    .where(eq(shoppers.name, clerkId))
    .limit(1);

  return result || null;
}

// ============================================================================
// UPSTREAM TABLE HELPERS - BUYERS
// ============================================================================

/**
 * Get or create a buyer by name or Xero contact ID
 *
 * Searches in this order:
 * 1. By name (exact match)
 * 2. By Xero contact ID (if provided)
 * 3. Creates new record if not found
 *
 * @param name - The buyer's name
 * @param email - Optional email address
 * @param xero_contact_id - Optional Xero contact ID
 * @returns Existing or newly created buyer record
 *
 * @example
 * const buyer = await getOrCreateBuyer("John Doe", "john@example.com", "xero_123");
 */
export async function getOrCreateBuyer(
  name: string,
  email?: string,
  xero_contact_id?: string
): Promise<Buyer> {
  // ORIGINAL XATA:
  // let existing = await xata().db.Buyers.filter({ name }).getFirst();
  // if (existing) return existing;
  //
  // if (xero_contact_id) {
  //   existing = await xata().db.Buyers.filter({ xero_contact_id }).getFirst();
  //   if (existing) return existing;
  // }
  //
  // return await xata().db.Buyers.create({
  //   name,
  //   email: email || "",
  //   xero_contact_id: xero_contact_id || "",
  // });

  // DRIZZLE:
  // Try to find by name first
  let [existing] = await db
    .select()
    .from(buyers)
    .where(eq(buyers.name, name))
    .limit(1);

  if (existing) return existing;

  // Try to find by Xero contact ID if provided
  if (xero_contact_id) {
    [existing] = await db
      .select()
      .from(buyers)
      .where(eq(buyers.xeroContactId, xero_contact_id))
      .limit(1);

    if (existing) return existing;
  }

  // Create new buyer
  const [created] = await db
    .insert(buyers)
    .values({
      name,
      email: email || "",
      xeroContactId: xero_contact_id || "",
    })
    .returning();

  return created;
}

// ============================================================================
// UPSTREAM TABLE HELPERS - SUPPLIERS
// ============================================================================

/**
 * Get or create a supplier by name or Xero contact ID
 *
 * Searches in this order:
 * 1. By name (exact match)
 * 2. By Xero contact ID (if provided)
 * 3. Creates new record if not found
 *
 * @param name - The supplier's name
 * @param email - Optional email address
 * @param xero_contact_id - Optional Xero contact ID
 * @returns Existing or newly created supplier record
 *
 * @example
 * const supplier = await getOrCreateSupplier("Luxury Goods Ltd", "info@luxury.com");
 */
export async function getOrCreateSupplier(
  name: string,
  email?: string,
  xero_contact_id?: string
): Promise<Supplier> {
  // ORIGINAL XATA:
  // let existing = await xata().db.Suppliers.filter({ name }).getFirst();
  // if (existing) return existing;
  //
  // if (xero_contact_id) {
  //   existing = await xata().db.Suppliers.filter({ xero_contact_id }).getFirst();
  //   if (existing) return existing;
  // }
  //
  // return await xata().db.Suppliers.create({
  //   name,
  //   email: email || "",
  //   xero_contact_id: xero_contact_id || "",
  // });

  // DRIZZLE:
  // Try to find by name first
  let [existing] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.name, name))
    .limit(1);

  if (existing) return existing;

  // Try to find by Xero contact ID if provided
  if (xero_contact_id) {
    [existing] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.xeroContactId, xero_contact_id))
      .limit(1);

    if (existing) return existing;
  }

  // Create new supplier
  const [created] = await db
    .insert(suppliers)
    .values({
      name,
      email: email || "",
      xeroContactId: xero_contact_id || "",
    })
    .returning();

  return created;
}

// ============================================================================
// UPSTREAM TABLE HELPERS - INTRODUCERS
// ============================================================================

export async function getOrCreateIntroducer(
  name: string,
  commission_percent?: number
): Promise<Introducer> {
  // ORIGINAL XATA:
  // const existing = await xata().db.Introducers.filter({ name }).getFirst();
  // if (existing) return existing;
  //
  // return await xata().db.Introducers.create({
  //   name,
  //   commission_percent: commission_percent || 0,
  // });

  // DRIZZLE:
  const [existing] = await db
    .select()
    .from(introducers)
    .where(eq(introducers.name, name))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(introducers)
    .values({
      name,
      commissionPercent: commission_percent || 0,
    })
    .returning();

  return created;
}

// ============================================================================
// UPSTREAM TABLE HELPERS - COMMISSION BANDS
// ============================================================================

export async function getCommissionBandForMargin(
  margin: number
): Promise<CommissionBand | null> {
  // ORIGINAL XATA:
  // const bands = await xata().db.CommissionBands.getAll();
  //
  // for (const band of bands) {
  //   if (
  //     margin >= (band.min_threshold || 0) &&
  //     margin <= (band.max_threshold || Infinity)
  //   ) {
  //     return band;
  //   }
  // }
  //
  // return null;

  // DRIZZLE:
  // Find the band where margin falls between min and max threshold
  const bands = await db.select().from(commissionBands);

  for (const band of bands) {
    if (
      margin >= (band.minThreshold || 0) &&
      margin <= (band.maxThreshold || Infinity)
    ) {
      return band;
    }
  }

  return null;
}

// ============================================================================
// SALE ECONOMICS CALCULATION
// ============================================================================

export interface SaleEconomicsInput {
  sale_amount_inc_vat: number;
  buy_price: number;
  card_fees: number;
  shipping_cost: number;
  /** Phase 2: flat-£ introducer fee, optional. Treated as a cost deduction. */
  introducer_commission?: number;
  /** Phase 2: flat-£ entrupy authentication fee, optional. */
  entrupy_fee?: number;
  /**
   * CRITICAL: Branding theme is required to determine the correct VAT rate
   * - CN Export Sales = 0% VAT
   * - CN 20% VAT = 20% VAT
   * - CN Margin Scheme = 0% VAT
   */
  branding_theme?: string;
}

export interface SaleEconomicsResult {
  sale_amount_ex_vat: number;
  direct_costs: number;
  implied_shipping: number;
  gross_margin: number;
  commissionable_margin: number;
}

// Deprecated: Use calculateEconomics from lib/economics.ts instead
// Kept for backwards compatibility
export function calculateSaleEconomics(
  fields: SaleEconomicsInput
): SaleEconomicsResult {
  const economics = calculateEconomics({
    sale_amount_inc_vat: fields.sale_amount_inc_vat,
    buy_price: fields.buy_price,
    card_fees: fields.card_fees,
    shipping_cost: fields.shipping_cost,
    introducer_commission: fields.introducer_commission || 0,
    entrupy_fee: fields.entrupy_fee || 0,
    // CRITICAL: Pass branding theme to determine correct VAT rate
    branding_theme: fields.branding_theme,
  });

  return {
    sale_amount_ex_vat: economics.sale_amount_ex_vat,
    direct_costs: economics.card_fees + economics.shipping_cost,
    implied_shipping: economics.shipping_cost,
    gross_margin: economics.gross_margin,
    commissionable_margin: economics.commissionable_margin,
  };
}

// ============================================================================
// MASTER SALE CREATION FUNCTION
// ============================================================================

export interface CreateSalePayload {
  // Core identifiers
  sale_reference: string;
  sale_date: Date;

  // Party names (will be resolved to IDs)
  shopperName: string;
  shopperEmail?: string;
  /** Clerk user ID of the logged-in shopper. Strongly preferred for shopper resolution. */
  shopperClerkUserId?: string;
  buyerName: string;
  buyerEmail?: string;
  buyerXeroId?: string;
  buyerType?: string; // "b2b" | "end_client" (for analytics and commission rules)
  supplierName: string;
  supplierEmail?: string;
  supplierXeroId?: string;
  introducerName?: string;
  introducerCommission?: number;

  // Phase 2 wizard fields (written directly to sales row, not relational)
  introducerNameFreeText?: string;
  hasIntroducer?: boolean;
  isNewClient?: boolean;
  entrupyFee?: number;
  /** Introducer fee as a percentage of gross profit (whole number 0-100). */
  introducerFeePercent?: number;
  /** Whether the wizard captured the fee as a percent of profit or a flat £ amount. */
  introducerFeeType?: "percent" | "flat";

  // Authenticity tracking (Story 2)
  authenticity_status?: string; // "verified" | "pending" | "not_verified"
  supplier_receipt_attached?: boolean;

  // Item metadata
  brand?: string;
  category?: string;
  item_title?: string;
  quantity?: number;

  // Financial inputs (for economics calculation)
  sale_amount_inc_vat: number;
  buy_price: number;
  card_fees?: number;
  shipping_cost?: number;

  // Xero metadata
  currency?: string;
  branding_theme?: string;
  xero_invoice_number?: string;
  xero_invoice_id?: string;
  xero_invoice_url?: string;
  invoice_status?: string;
  invoice_paid_date?: Date;
  invoice_due_date?: Date; // Story 4 - extracted from Xero invoice

  // Commission overrides
  admin_override_commission_percent?: number;
  admin_override_notes?: string;

  // Payment method
  payment_method?: string;

  // Notes
  internal_notes?: string;
}

export async function createSaleFromAppPayload(
  payload: CreateSalePayload
): Promise<Sale> {
  // A) SANITIZE ALL USER INPUT
  logger.info("XATA", "Sanitizing input");

  const sanitizedPayload: CreateSalePayload = {
    ...payload,
    // Required fields
    sale_reference: sanitizeString(payload.sale_reference),
    shopperName: sanitizeContactName(payload.shopperName),
    buyerName: sanitizeContactName(payload.buyerName),
    supplierName: sanitizeContactName(payload.supplierName),

    // Optional string fields
    brand: sanitizeOptional(payload.brand) || undefined,
    category: sanitizeOptional(payload.category) || undefined,
    item_title: sanitizeOptional(payload.item_title) || undefined,
    internal_notes: payload.internal_notes ? sanitizeNotes(payload.internal_notes) : undefined,
    introducerName: payload.introducerName ? sanitizeContactName(payload.introducerName) : undefined,
    introducerNameFreeText: payload.introducerNameFreeText
      ? sanitizeContactName(payload.introducerNameFreeText)
      : undefined,
    admin_override_notes: payload.admin_override_notes ? sanitizeNotes(payload.admin_override_notes) : undefined,

    // Email fields (basic sanitization)
    shopperEmail: sanitizeOptional(payload.shopperEmail) || undefined,
    buyerEmail: sanitizeOptional(payload.buyerEmail) || undefined,
    supplierEmail: sanitizeOptional(payload.supplierEmail) || undefined,
  };

  // B) RESOLVE RELATIONAL TABLES
  logger.info("XATA", "Resolving relationships");

  const shopper = await getOrCreateShopperByName(
    sanitizedPayload.shopperName,
    sanitizedPayload.shopperClerkUserId
  );
  logger.info("XATA", "Shopper resolved", { name: shopper.name, id: shopper.id });

  const buyer = await getOrCreateBuyer(
    sanitizedPayload.buyerName,
    sanitizedPayload.buyerEmail,
    sanitizedPayload.buyerXeroId
  );
  logger.info("XATA", "Buyer resolved", { name: buyer.name, id: buyer.id });

  const supplier = await getOrCreateSupplier(
    sanitizedPayload.supplierName,
    sanitizedPayload.supplierEmail,
    sanitizedPayload.supplierXeroId
  );
  logger.info("XATA", "Supplier resolved", { name: supplier.name, id: supplier.id });

  let introducer: Introducer | null = null;
  if (sanitizedPayload.introducerName) {
    introducer = await getOrCreateIntroducer(
      sanitizedPayload.introducerName,
      sanitizedPayload.introducerCommission
    );
    logger.info("XATA", "Introducer resolved", { name: introducer.name, id: introducer.id });
  }

  // VALIDATION) RUN VALIDATION CHECKS
  logger.info("XATA", "Running validation checks");
  const validation = validateSaleInput(sanitizedPayload);

  // B) COMPUTE ECONOMICS
  logger.info("XATA", "Computing economics");

  const economics = calculateSaleEconomics({
    sale_amount_inc_vat: sanitizedPayload.sale_amount_inc_vat,
    buy_price: sanitizedPayload.buy_price,
    card_fees: sanitizedPayload.card_fees || 0,
    shipping_cost: sanitizedPayload.shipping_cost || 0,
    // Phase 2: introducer fee + entrupy fee are flat-£ cost deductions
    introducer_commission: sanitizedPayload.introducerCommission || 0,
    entrupy_fee: sanitizedPayload.entrupyFee || 0,
    // CRITICAL: Pass branding theme to determine correct VAT rate
    branding_theme: sanitizedPayload.branding_theme,
  });

  logger.info("XATA", "Economics calculated", {
    grossMargin: economics.gross_margin.toFixed(2),
    commissionableMargin: economics.commissionable_margin.toFixed(2)
  });

  // Find commission band based on commissionable margin
  const commissionBand = await getCommissionBandForMargin(
    economics.commissionable_margin
  );
  if (commissionBand) {
    logger.info("XATA", "Commission band found", {
      bandType: commissionBand.bandType,
      commissionPercent: commissionBand.commissionPercent
    });
  }

  // C) CALCULATE COMMISSION
  logger.info("XATA", "Calculating commission");

  const commissionResult = await calculateCommission({
    commissionable_margin: economics.commissionable_margin,
    introducer: introducer && introducer.commissionPercent != null ? {
      commission_percent: introducer.commissionPercent,
    } : null,
    commission_band: commissionBand && commissionBand.commissionPercent != null ? {
      commission_percent: commissionBand.commissionPercent,
    } : null,
    admin_override_commission_percent: sanitizedPayload.admin_override_commission_percent ?? null,
    admin_override_notes: sanitizedPayload.admin_override_notes ?? null,
  });

  logger.info("XATA", "Commission calculated", {
    commissionAmount: commissionResult.commission_amount,
    shopperCommission: commissionResult.commission_split_shopper,
    introducerCommission: commissionResult.commission_split_introducer
  });

  // Check for commission calculation errors
  const hasCommissionErrors = commissionResult.errors.length > 0;
  if (hasCommissionErrors) {
    logger.error("XATA", "Commission calculation errors", {
      errors: commissionResult.errors.join("; ")
    });
  }

  // D) INSERT INTO SALES TABLE
  logger.info("XATA", "Creating sale record");

  // ORIGINAL XATA:
  // const sale = await xata().db.Sales.create({
  //   sale_reference: sanitizedPayload.sale_reference,
  //   sale_date: sanitizedPayload.sale_date,
  //   source: 'atelier',
  //   shopper: shopper.id,
  //   buyer: buyer.id,
  //   supplier: supplier.id,
  //   introducer: introducer?.id,
  //   commission_band: commissionBand?.id,
  //   ... (all other fields)
  // });

  // DRIZZLE:
  const [sale] = await db
    .insert(sales)
    .values({
      // Core identifiers
      saleReference: sanitizedPayload.sale_reference,
      saleDate: sanitizedPayload.sale_date,
      source: 'atelier', // Mark as created via Atelier (Trade Wizard or direct API)

      // Relationships (foreign keys)
      shopperId: shopper.id,
      buyerId: buyer.id,
      supplierId: supplier.id,
      introducerId: introducer?.id,
      commissionBandId: commissionBand?.id,

      // Item metadata
      brand: sanitizedPayload.brand || "",
      category: sanitizedPayload.category || "",
      itemTitle: sanitizedPayload.item_title || "",
      quantity: sanitizedPayload.quantity || 1,

      // Financial fields
      saleAmountIncVat: sanitizedPayload.sale_amount_inc_vat,
      saleAmountExVat: economics.sale_amount_ex_vat,
      buyPrice: sanitizedPayload.buy_price,
      cardFees: sanitizedPayload.card_fees || 0,
      shippingCost: sanitizedPayload.shipping_cost || 0,
      directCosts: economics.direct_costs,

      // Economics
      impliedShipping: economics.implied_shipping,
      grossMargin: economics.gross_margin,
      commissionableMargin: economics.commissionable_margin,

      // Commission (from Commission Engine V1)
      commissionAmount: commissionResult.commission_amount,
      commissionSplitIntroducer: commissionResult.commission_split_introducer,
      commissionSplitShopper: commissionResult.commission_split_shopper,
      introducerSharePercent: commissionResult.introducer_share_percent,
      adminOverrideCommissionPercent: commissionResult.admin_override_commission_percent,
      adminOverrideNotes: commissionResult.admin_override_notes ? [commissionResult.admin_override_notes] : undefined,

      // Status (default to "invoiced" for new sales)
      status: "invoiced",

      // Error tracking
      errorFlag: hasCommissionErrors,
      errorMessage: hasCommissionErrors ? commissionResult.errors : undefined,

      // Xero metadata
      currency: sanitizedPayload.currency || "GBP",
      brandingTheme: sanitizedPayload.branding_theme || "",
      xeroInvoiceNumber: sanitizedPayload.xero_invoice_number || "",
      xeroInvoiceId: sanitizedPayload.xero_invoice_id || "",
      xeroInvoiceUrl: sanitizedPayload.xero_invoice_url || "",
      invoiceStatus: sanitizedPayload.invoice_status || "DRAFT",
      invoicePaidDate: sanitizedPayload.invoice_paid_date,

      // Commission tracking (defaults)
      commissionLocked: false,
      commissionPaid: false,
      commissionLockDate: undefined,
      commissionPaidDate: undefined,

      // Payment
      paymentMethod: sanitizedPayload.payment_method || undefined,

      // Notes
      internalNotes: sanitizedPayload.internal_notes || "",

      // ----------------------------------------------------------------
      // Phase 2 wizard fields (free-text introducer name, new client flag,
      // entrupy fee). Persisted directly to sales row, no FK lookups.
      // The legacy `introducerId` FK is left null when the wizard sets a
      // free-text name; future management edits via /api/sales/[id]/introducer
      // can attach a curated introducer record if needed.
      // ----------------------------------------------------------------
      introducerName: sanitizedPayload.introducerNameFreeText || null,
      hasIntroducer: sanitizedPayload.hasIntroducer || false,
      isNewClient: sanitizedPayload.isNewClient || false,
      entrupyFee: sanitizedPayload.entrupyFee || 0,
      introducerCommission: sanitizedPayload.introducerCommission || 0,
      introducerFeePercent: sanitizedPayload.introducerFeePercent ?? null,
      introducerFeeType: sanitizedPayload.introducerFeeType ?? null,
    })
    .returning();

  logger.info("XATA", "Sale created", { saleId: sale.id });

  // E) ECONOMICS SANITY WARNINGS (Story 5)
  // Check for suspicious margin patterns based on buyer type
  if (sanitizedPayload.buyerType && economics.commissionable_margin > 0) {
    const marginPercent = (economics.commissionable_margin / sanitizedPayload.sale_amount_inc_vat) * 100;

    // End client sales with < 5% margin
    if (sanitizedPayload.buyerType === "end_client" && marginPercent < 5) {
      try {
        // ORIGINAL XATA:
        // await xata().db.Errors.create({
        //   sale: sale.id,
        //   severity: "medium",
        //   source: "economics-sanity-check",
        //   message: [...],
        //   timestamp: new Date(),
        //   resolved: false,
        // });

        // DRIZZLE:
        await db.insert(errors).values({
          saleId: sale.id,
          severity: "medium",
          source: "economics-sanity-check",
          message: [`Low margin alert: End client sale with only ${marginPercent.toFixed(2)}% margin (£${economics.commissionable_margin.toFixed(2)})`],
          timestamp: new Date(),
          resolved: false,
        });
        logger.warn("XATA", "Economics sanity warning logged: End client low margin");
      } catch (err) {
        logger.error("XATA", "Failed to log economics warning", { error: err as any } as any);
      }
    }

    // B2B sales with > 50% margin
    if (sanitizedPayload.buyerType === "b2b" && marginPercent > 50) {
      try {
        // DRIZZLE:
        await db.insert(errors).values({
          saleId: sale.id,
          severity: "medium",
          source: "economics-sanity-check",
          message: [`High margin alert: B2B sale with ${marginPercent.toFixed(2)}% margin (£${economics.commissionable_margin.toFixed(2)}) - verify pricing`],
          timestamp: new Date(),
          resolved: false,
        });
        logger.warn("XATA", "Economics sanity warning logged: B2B high margin");
      } catch (err) {
        logger.error("XATA", "Failed to log economics warning", { error: err as any } as any);
      }
    }
  }

  // F) LOG COMMISSION ERRORS TO ERRORS TABLE
  if (hasCommissionErrors) {
    try {
      const errorMessage = commissionResult.errors.join("; ");

      // ORIGINAL XATA:
      // await xata().db.Errors.create({
      //   sale: sale.id,
      //   severity: "high",
      //   source: "commission-engine",
      //   message: [errorMessage],
      //   timestamp: new Date(),
      //   resolved: false,
      // });

      // DRIZZLE:
      await db.insert(errors).values({
        saleId: sale.id,
        severity: "high",
        source: "commission-engine",
        message: [errorMessage],
        timestamp: new Date(),
        resolved: false,
      });
      logger.warn("XATA", "Commission error logged to Errors table");
    } catch (err) {
      logger.error("XATA", "Failed to log commission error", { error: err as any } as any);
    }
  }

  // G) LOG VALIDATION ERRORS TO ERRORS TABLE
  const hasValidationErrors = validation.errors.length > 0;
  if (hasValidationErrors) {
    try {
      const validationErrorMessage = formatValidationErrors(validation);

      // ORIGINAL XATA:
      // await xata().db.Sales.update(sale.id, {
      //   error_flag: true,
      //   error_message: [validationErrorMessage],
      // });
      //
      // await xata().db.Errors.create({
      //   sale: sale.id,
      //   severity: "high",
      //   source: "validation",
      //   message: [validationErrorMessage],
      //   timestamp: new Date(),
      //   resolved: false,
      // });

      // DRIZZLE:
      // Update sale with error flag and message
      await db
        .update(sales)
        .set({
          errorFlag: true,
          errorMessage: [validationErrorMessage],
        })
        .where(eq(sales.id, sale.id));

      // Log to Errors table
      await db.insert(errors).values({
        saleId: sale.id,
        severity: "high",
        source: "validation",
        message: [validationErrorMessage],
        timestamp: new Date(),
        resolved: false,
      });

      logger.warn("XATA", "Validation errors logged to Errors table");
    } catch (err) {
      logger.error("XATA", "Failed to log validation errors", { error: err as any } as any);
    }
  }

  // G) RETURN THE CREATED SALE RECORD
  return sale;
}

// ============================================================================
// INVOICE SYNC WRAPPER
// ============================================================================

export interface XeroInvoiceData {
  InvoiceNumber: string;
  Date: string;
  Contact: {
    Name: string;
    ContactID: string;
    EmailAddress?: string;
  };
  CurrencyCode?: string;
  BrandingThemeID?: string;
  InvoiceID: string;
  Status: string;
  Total: number;
  // Add other Xero invoice fields as needed
}

export interface AppFormData {
  // Parties
  shopperName: string;
  shopperEmail?: string;
  /** Clerk user ID of the logged-in shopper. Lets the resolver hit the canonical
   *  Clerk-linked row instead of falling back to a name match (which has caused
   *  duplicate-shopper bugs in the past). */
  shopperClerkUserId?: string;
  supplierName: string;
  supplierEmail?: string;
  supplierXeroId?: string;
  introducerName?: string;
  introducerCommission?: number;

  // Item details
  brand?: string;
  category?: string;
  itemTitle?: string;
  quantity?: number;

  // Financial data
  buyPrice: number;
  cardFees?: number;
  shippingCost?: number;

  // Payment
  paymentMethod?: string;

  // Notes
  internalNotes?: string;

  // ----------------------------------------------------------------------
  // Phase 2 wizard fields (written directly to sales row, not relational)
  // ----------------------------------------------------------------------
  /** Free-text introducer name from wizard. Stored on sales.introducer_name.
   *  Distinct from `introducerName` above which is the FK lookup path. */
  introducerNameFreeText?: string;
  /** Whether the wizard's introducer toggle is on. Stored on sales.has_introducer. */
  hasIntroducer?: boolean;
  /** First delivered sale for this buyer at creation time. Stored on sales.is_new_client. */
  isNewClient?: boolean;
  /** Authentication fee, optional. Stored on sales.entrupy_fee and deducted from commissionable margin. */
  entrupyFee?: number;
  /** Introducer fee as a percentage of gross profit. Stored on sales.introducer_fee_percent. */
  introducerFeePercent?: number;
  /** Whether the wizard captured the fee as % of profit or flat £. Stored on sales.introducer_fee_type. */
  introducerFeeType?: "percent" | "flat";
}

export async function syncInvoiceAndAppDataToXata(params: {
  xeroInvoice: XeroInvoiceData;
  formData: AppFormData;
}): Promise<Sale | null> {
  try {
    logger.info("XATA", "Starting invoice sync");
    logger.debug("XATA", "Incoming Xero invoice", { invoice: params.xeroInvoice as any });
    logger.debug("XATA", "Incoming form data", { formData: params.formData as any });

    // Validate required fields
    if (!params.xeroInvoice.InvoiceNumber) {
      logger.warn("XATA", "Missing InvoiceNumber, aborting sync");
      return null;
    }

    if (!params.formData.shopperName) {
      logger.warn("XATA", "Missing shopperName, aborting sync");
      return null;
    }

    const payload: CreateSalePayload = {
      // Core identifiers from Xero
      sale_reference: params.xeroInvoice.InvoiceNumber,
      sale_date: new Date(params.xeroInvoice.Date),

      // Parties
      shopperName: params.formData.shopperName,
      shopperEmail: params.formData.shopperEmail,
      shopperClerkUserId: params.formData.shopperClerkUserId,
      buyerName: params.xeroInvoice.Contact.Name,
      buyerEmail: params.xeroInvoice.Contact.EmailAddress,
      buyerXeroId: params.xeroInvoice.Contact.ContactID,
      supplierName: params.formData.supplierName,
      supplierEmail: params.formData.supplierEmail,
      supplierXeroId: params.formData.supplierXeroId,
      introducerName: params.formData.introducerName,
      introducerCommission: params.formData.introducerCommission,

      // Item metadata from form
      brand: params.formData.brand,
      category: params.formData.category,
      item_title: params.formData.itemTitle,
      quantity: params.formData.quantity,

      // Financial data
      sale_amount_inc_vat: params.xeroInvoice.Total,
      buy_price: params.formData.buyPrice,
      card_fees: params.formData.cardFees,
      shipping_cost: params.formData.shippingCost,

      // Payment
      payment_method: params.formData.paymentMethod,

      // Xero metadata
      currency: params.xeroInvoice.CurrencyCode,
      branding_theme: params.xeroInvoice.BrandingThemeID,
      xero_invoice_number: params.xeroInvoice.InvoiceNumber,
      xero_invoice_id: params.xeroInvoice.InvoiceID,
      xero_invoice_url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${params.xeroInvoice.InvoiceID}`,
      invoice_status: params.xeroInvoice.Status,

      // Notes
      internal_notes: params.formData.internalNotes,

      // Phase 2 wizard fields
      introducerNameFreeText: params.formData.introducerNameFreeText,
      hasIntroducer: params.formData.hasIntroducer,
      isNewClient: params.formData.isNewClient,
      entrupyFee: params.formData.entrupyFee,
      introducerFeePercent: params.formData.introducerFeePercent,
      introducerFeeType: params.formData.introducerFeeType,
    };

    const sale = await createSaleFromAppPayload(payload);

    logger.info("XATA", "Invoice sync complete");
    return sale;
  } catch (error) {
    logger.error("XATA", "Invoice sync failed (non-fatal)", { error: error as any } as any);
    // Don't throw - log and continue
    return null;
  }
}

// ============================================================================
// LINE ITEMS HELPERS
// ============================================================================

/**
 * Line item data for multi-item invoices
 */
export interface LineItemData {
  lineNumber: number;
  brand: string;
  category: string;
  description: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  lineTotal: number;
  lineMargin: number;
  supplierName?: string;
  supplierId?: string;
  supplierInvoiceRef?: string;
  datePurchased?: string;
}

/**
 * Save line items for a sale
 * Creates LineItems records linked to the parent sale
 *
 * @param saleId - The sale record ID
 * @param items - Array of line item data
 * @returns Array of created LineItems records
 */
export async function saveLineItems(
  saleId: string,
  items: LineItemData[]
): Promise<LineItem[]> {
  if (!items || items.length === 0) {
    logger.info("XATA", "No line items to save");
    return [];
  }

  logger.info("XATA", "Saving line items", {
    saleId,
    lineItemCount: items.length,
  });

  const created: LineItem[] = [];

  for (const item of items) {
    try {
      // ORIGINAL XATA:
      // const record = await xata().db.LineItems.create({
      //   sale: saleId,
      //   line_number: item.lineNumber,
      //   brand: item.brand,
      //   category: item.category,
      //   description: item.description,
      //   quantity: item.quantity,
      //   buy_price: item.buyPrice,
      //   sell_price: item.sellPrice,
      //   line_total: item.lineTotal,
      //   line_margin: item.lineMargin,
      //   supplier: item.supplierId || undefined,
      // });

      // DRIZZLE:
      const [record] = await db
        .insert(lineItems)
        .values({
          saleId: saleId,
          lineNumber: item.lineNumber,
          brand: item.brand,
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          buyPrice: item.buyPrice,
          sellPrice: item.sellPrice,
          lineTotal: item.lineTotal,
          lineMargin: item.lineMargin,
          supplierId: item.supplierId || undefined,
          supplierInvoiceRef: item.supplierInvoiceRef || undefined,
          datePurchased: item.datePurchased ? new Date(item.datePurchased) : undefined,
        })
        .returning();

      created.push(record);
      logger.debug("XATA", "Line item created", {
        lineNumber: item.lineNumber,
        brand: item.brand,
      });
    } catch (error) {
      logger.error("XATA", "Failed to create line item", {
        lineNumber: item.lineNumber,
        error: error as any,
      });
    }
  }

  logger.info("XATA", "Line items saved", {
    saleId,
    savedCount: created.length,
    totalCount: items.length,
  });

  return created;
}

/**
 * Backwards-compatible line item type (snake_case for API consumers)
 */
export interface LineItemLegacy {
  id: string;
  line_number: number | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  quantity: number | null;
  buy_price: number | null;
  sell_price: number | null;
  line_total: number | null;
  line_margin: number | null;
  supplier?: { id: string | null; name?: string | null } | null;
}

/**
 * Get line items for a sale
 *
 * @param saleId - The sale record ID
 * @returns Array of LineItems records (with legacy snake_case properties for backwards compatibility)
 */
export async function getLineItemsForSale(
  saleId: string
): Promise<LineItemLegacy[]> {
  // ORIGINAL XATA:
  // const items = await xata()
  //   .db.LineItems.filter({ "sale.id": saleId })
  //   .select(["*", "supplier.id", "supplier.name"])
  //   .sort("line_number", "asc")
  //   .getMany();

  // DRIZZLE:
  // Note: For supplier relation, use a join or query.with() if needed
  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.saleId, saleId))
    .orderBy(asc(lineItems.lineNumber));

  // Map to legacy format for backwards compatibility with existing API consumers
  return items.map(item => ({
    id: item.id,
    line_number: item.lineNumber,
    brand: item.brand,
    category: item.category,
    description: item.description,
    quantity: item.quantity,
    buy_price: item.buyPrice,
    sell_price: item.sellPrice,
    line_total: item.lineTotal,
    line_margin: item.lineMargin,
    supplier: item.supplierId ? { id: item.supplierId } : null,
  }));
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get all sales for a specific shopper
 */
export async function getSalesByShopperId(shopperId: string): Promise<Sale[]> {
  // ORIGINAL XATA:
  // return (await xata()
  //   .db.Sales.filter({ "shopper.id": shopperId })
  //   .sort("sale_date", "desc")
  //   .getMany()) as SalesRecord[];

  // DRIZZLE:
  return await db
    .select()
    .from(sales)
    .where(eq(sales.shopperId, shopperId))
    .orderBy(desc(sales.saleDate));
}

/**
 * Get total commissionable margin for a shopper (unpaid)
 */
export async function getUnpaidCommissionForShopper(
  shopperId: string
): Promise<number> {
  // ORIGINAL XATA:
  // const sales = await xata()
  //   .db.Sales.filter({
  //     "shopper.id": shopperId,
  //     commission_paid: false,
  //   })
  //   .getMany();
  //
  // return sales.reduce((sum, sale) => sum + (sale.commissionable_margin || 0), 0);

  // DRIZZLE:
  const results = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.shopperId, shopperId),
        eq(sales.commissionPaid, false)
      )
    );

  return results.reduce((sum, sale) => sum + (sale.commissionableMargin || 0), 0);
}

/**
 * Lock all unpaid commissions up to a specific date
 */
export async function lockCommissionsUpToDate(date: Date): Promise<number> {
  // ORIGINAL XATA:
  // const sales = await xata()
  //   .db.Sales.filter({
  //     sale_date: { $le: date },
  //     commission_locked: false,
  //   })
  //   .getMany();
  //
  // let count = 0;
  // for (const sale of sales) {
  //   await xata().db.Sales.update(sale.id, {
  //     commission_locked: true,
  //     commission_lock_date: new Date(),
  //   });
  //   count++;
  // }
  //
  // return count;

  // DRIZZLE:
  const salesToLock = await db
    .select()
    .from(sales)
    .where(
      and(
        lte(sales.saleDate, date),
        eq(sales.commissionLocked, false)
      )
    );

  let count = 0;
  for (const sale of salesToLock) {
    await db
      .update(sales)
      .set({
        commissionLocked: true,
        commissionLockDate: new Date(),
      })
      .where(eq(sales.id, sale.id));
    count++;
  }

  return count;
}

// ============================================================================
// XERO PAYMENT SYNC HELPERS (Story D)
// ============================================================================

/**
 * Find a sale by Xero invoice number
 *
 * @param invoiceNumber - Xero invoice number
 * @returns Sale record or null if not found
 */
export async function findSaleByInvoiceNumber(
  invoiceNumber: string
): Promise<Sale | null> {
  logger.info("XATA", "Looking up sale by invoice number", { invoiceNumber });

  // ORIGINAL XATA:
  // const sale = await xata()
  //   .db.Sales.filter({ xero_invoice_number: invoiceNumber })
  //   .getFirst();

  // DRIZZLE:
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.xeroInvoiceNumber, invoiceNumber))
    .limit(1);

  if (sale) {
    logger.info("XATA", "Found sale", { saleId: sale.id });
  } else {
    logger.warn("XATA", "No sale found for invoice", { invoiceNumber });
  }

  return sale || null;
}

/**
 * Update sale payment status from Xero invoice data
 *
 * This function transitions a sale from "invoiced" to "paid" status
 * using the deal lifecycle engine.
 *
 * @param saleId - Sale record ID
 * @param invoice - Xero invoice data with payment information
 * @returns Transition result
 */
export async function updateSalePaymentStatusFromXero(
  saleId: string,
  invoice: { Status?: string; AmountDue?: number; PaidDate?: string }
): Promise<{ success: boolean; error?: string }> {
  logger.info("XATA", "Updating payment status for sale from Xero invoice", { saleId });

  // Validate invoice is paid
  const isPaid =
    invoice.Status === "PAID" ||
    (invoice.AmountDue !== undefined && invoice.AmountDue === 0);

  if (!isPaid) {
    const error = `Invoice not marked as paid (Status: ${invoice.Status}, AmountDue: ${invoice.AmountDue})`;
    logger.warn("XATA", error);
    return { success: false, error };
  }

  // Parse payment date
  let xeroPaymentDate: Date | undefined;
  if (invoice.PaidDate) {
    try {
      xeroPaymentDate = new Date(invoice.PaidDate);
    } catch (err) {
      logger.warn("XATA", "Invalid PaidDate format", { paidDate: invoice.PaidDate });
    }
  }

  // Use deal lifecycle engine to transition status
  const result = await transitionSaleStatus({
    saleId,
    currentStatus: "invoiced",
    nextStatus: "paid",
    xeroPaymentDate,
  });

  if (result.success) {
    logger.info("XATA", "Sale transitioned to paid", { saleId });
  } else {
    logger.error("XATA", "Failed to transition sale", { saleId, error: result.error });
  }

  return result;
}
