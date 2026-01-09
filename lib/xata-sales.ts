/**
 * Xata Sales OS - Master Backend Module
 *
 * Consolidated integration layer for Club 19 Sales OS
 * Handles all Xata database operations for sales tracking
 */

import { XataClient } from "@/src/xata";
import type {
  ShoppersRecord,
  BuyersRecord,
  SuppliersRecord,
  IntroducersRecord,
  CommissionBandsRecord,
  SalesRecord,
  LineItemsRecord,
} from "@/src/xata";
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
// CLIENT SINGLETON
// ============================================================================

let _xata: XataClient | null = null;

export function xata() {
  if (!_xata) _xata = new XataClient();
  return _xata;
}

// ============================================================================
// UPSTREAM TABLE HELPERS - SHOPPERS
// ============================================================================

/**
 * Get or create a shopper by name
 *
 * @param name - The shopper's full name
 * @returns Existing or newly created shopper record
 *
 * @example
 * const shopper = await getOrCreateShopperByName("Hope Smith");
 */
export async function getOrCreateShopperByName(
  name: string
): Promise<ShoppersRecord> {
  const existing = await xata().db.Shoppers.filter({ name }).getFirst();
  if (existing) return existing;

  return await xata().db.Shoppers.create({
    name,
    email: "",
    commission_scheme: "",
    active: true,
  });
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
): Promise<ShoppersRecord | null> {
  // Assuming clerk_id is stored in a custom field or matched by name
  // Adjust this based on your actual Clerk integration
  return await xata().db.Shoppers.filter({ name: clerkId }).getFirst();
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
): Promise<BuyersRecord> {
  // Try to find by name first
  let existing = await xata().db.Buyers.filter({ name }).getFirst();
  if (existing) return existing;

  // Try to find by Xero contact ID if provided
  if (xero_contact_id) {
    existing = await xata()
      .db.Buyers.filter({ xero_contact_id })
      .getFirst();
    if (existing) return existing;
  }

  // Create new buyer
  return await xata().db.Buyers.create({
    name,
    email: email || "",
    xero_contact_id: xero_contact_id || "",
  });
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
): Promise<SuppliersRecord> {
  // Try to find by name first
  let existing = await xata().db.Suppliers.filter({ name }).getFirst();
  if (existing) return existing;

  // Try to find by Xero contact ID if provided
  if (xero_contact_id) {
    existing = await xata()
      .db.Suppliers.filter({ xero_contact_id })
      .getFirst();
    if (existing) return existing;
  }

  // Create new supplier
  return await xata().db.Suppliers.create({
    name,
    email: email || "",
    xero_contact_id: xero_contact_id || "",
  });
}

// ============================================================================
// UPSTREAM TABLE HELPERS - INTRODUCERS
// ============================================================================

export async function getOrCreateIntroducer(
  name: string,
  commission_percent?: number
): Promise<IntroducersRecord> {
  const existing = await xata().db.Introducers.filter({ name }).getFirst();
  if (existing) return existing;

  return await xata().db.Introducers.create({
    name,
    commission_percent: commission_percent || 0,
  });
}

// ============================================================================
// UPSTREAM TABLE HELPERS - COMMISSION BANDS
// ============================================================================

export async function getCommissionBandForMargin(
  margin: number
): Promise<CommissionBandsRecord | null> {
  // Find the band where margin falls between min and max threshold
  const bands = await xata().db.CommissionBands.getAll();

  for (const band of bands) {
    if (
      margin >= (band.min_threshold || 0) &&
      margin <= (band.max_threshold || Infinity)
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
  buyerName: string;
  buyerEmail?: string;
  buyerXeroId?: string;
  buyerType?: string; // "b2b" | "end_client" (for analytics and commission rules)
  supplierName: string;
  supplierEmail?: string;
  supplierXeroId?: string;
  introducerName?: string;
  introducerCommission?: number;

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

  // Notes
  internal_notes?: string;
}

export async function createSaleFromAppPayload(
  payload: CreateSalePayload
): Promise<SalesRecord> {
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
    admin_override_notes: payload.admin_override_notes ? sanitizeNotes(payload.admin_override_notes) : undefined,

    // Email fields (basic sanitization)
    shopperEmail: sanitizeOptional(payload.shopperEmail) || undefined,
    buyerEmail: sanitizeOptional(payload.buyerEmail) || undefined,
    supplierEmail: sanitizeOptional(payload.supplierEmail) || undefined,
  };

  // B) RESOLVE RELATIONAL TABLES
  logger.info("XATA", "Resolving relationships");

  const shopper = await getOrCreateShopperByName(sanitizedPayload.shopperName);
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

  let introducer: IntroducersRecord | null = null;
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
      bandType: commissionBand.band_type,
      commissionPercent: commissionBand.commission_percent
    });
  }

  // C) CALCULATE COMMISSION
  logger.info("XATA", "Calculating commission");

  const commissionResult = await calculateCommission({
    commissionable_margin: economics.commissionable_margin,
    introducer: introducer && introducer.commission_percent != null ? {
      commission_percent: introducer.commission_percent,
    } : null,
    commission_band: commissionBand && commissionBand.commission_percent != null ? {
      commission_percent: commissionBand.commission_percent,
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

  // D) INSERT INTO XATA SALES TABLE
  logger.info("XATA", "Creating sale record");

  const sale = await xata().db.Sales.create({
    // Core identifiers
    sale_reference: sanitizedPayload.sale_reference,
    sale_date: sanitizedPayload.sale_date,
    source: 'atelier', // Mark as created via Atelier (Trade Wizard or direct API)

    // Relationships
    shopper: shopper.id,
    buyer: buyer.id,
    supplier: supplier.id,
    introducer: introducer?.id,
    commission_band: commissionBand?.id,

    // Item metadata
    brand: sanitizedPayload.brand || "",
    category: sanitizedPayload.category || "",
    item_title: sanitizedPayload.item_title || "",
    quantity: sanitizedPayload.quantity || 1,

    // Financial fields
    sale_amount_inc_vat: sanitizedPayload.sale_amount_inc_vat,
    sale_amount_ex_vat: economics.sale_amount_ex_vat,
    buy_price: sanitizedPayload.buy_price,
    card_fees: sanitizedPayload.card_fees || 0,
    shipping_cost: sanitizedPayload.shipping_cost || 0,
    direct_costs: economics.direct_costs,

    // Economics
    implied_shipping: economics.implied_shipping,
    gross_margin: economics.gross_margin,
    commissionable_margin: economics.commissionable_margin,

    // Commission (from Commission Engine V1)
    commission_amount: commissionResult.commission_amount,
    commission_split_introducer: commissionResult.commission_split_introducer,
    commission_split_shopper: commissionResult.commission_split_shopper,
    introducer_share_percent: commissionResult.introducer_share_percent,
    admin_override_commission_percent: commissionResult.admin_override_commission_percent,
    admin_override_notes: commissionResult.admin_override_notes,

    // Status (default to "invoiced" for new sales)
    status: "invoiced",

    // Error tracking
    error_flag: hasCommissionErrors,
    error_message: hasCommissionErrors ? commissionResult.errors : undefined,

    // Xero metadata
    currency: sanitizedPayload.currency || "GBP",
    branding_theme: sanitizedPayload.branding_theme || "",
    xero_invoice_number: sanitizedPayload.xero_invoice_number || "",
    xero_invoice_id: sanitizedPayload.xero_invoice_id || "",
    xero_invoice_url: sanitizedPayload.xero_invoice_url || "",
    invoice_status: sanitizedPayload.invoice_status || "DRAFT",
    invoice_paid_date: sanitizedPayload.invoice_paid_date,

    // Commission tracking (defaults)
    commission_locked: false,
    commission_paid: false,
    commission_lock_date: undefined,
    commission_paid_date: undefined,

    // NOTE: The following fields exist in TypeScript schema but NOT in actual Xata database
    // Commenting out to prevent "column not found" errors until schema is migrated
    // buyer_type: sanitizedPayload.buyerType || "",
    // authenticity_status: sanitizedPayload.authenticity_status || "not_verified",
    // supplier_receipt_attached: sanitizedPayload.supplier_receipt_attached || false,
    // buyer_name: buyer.name,
    // supplier_name: supplier.name,
    // shopper_name: shopper.name,
    // introducer_name: introducer?.name || "",
    // invoice_due_date: sanitizedPayload.invoice_due_date,

    // Notes
    internal_notes: sanitizedPayload.internal_notes || "",
  });

  logger.info("XATA", "Sale created", { saleId: sale.id });

  // E) ECONOMICS SANITY WARNINGS (Story 5)
  // Check for suspicious margin patterns based on buyer type
  if (sanitizedPayload.buyerType && economics.commissionable_margin > 0) {
    const marginPercent = (economics.commissionable_margin / sanitizedPayload.sale_amount_inc_vat) * 100;

    // End client sales with < 5% margin
    if (sanitizedPayload.buyerType === "end_client" && marginPercent < 5) {
      try {
        await xata().db.Errors.create({
          sale: sale.id,
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
        await xata().db.Errors.create({
          sale: sale.id,
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
      await xata().db.Errors.create({
        sale: sale.id,
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

      // Update sale with error flag and message
      await xata().db.Sales.update(sale.id, {
        error_flag: true,
        error_message: [validationErrorMessage],
      });

      // Log to Errors table
      await xata().db.Errors.create({
        sale: sale.id,
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
  return sale as SalesRecord;
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

  // Notes
  internalNotes?: string;
}

export async function syncInvoiceAndAppDataToXata(params: {
  xeroInvoice: XeroInvoiceData;
  formData: AppFormData;
}): Promise<SalesRecord | null> {
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

      // Xero metadata
      currency: params.xeroInvoice.CurrencyCode,
      branding_theme: params.xeroInvoice.BrandingThemeID,
      xero_invoice_number: params.xeroInvoice.InvoiceNumber,
      xero_invoice_id: params.xeroInvoice.InvoiceID,
      xero_invoice_url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${params.xeroInvoice.InvoiceID}`,
      invoice_status: params.xeroInvoice.Status,

      // Notes
      internal_notes: params.formData.internalNotes,
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
}

/**
 * Save line items for a sale
 * Creates LineItems records linked to the parent sale
 *
 * @param saleId - The sale record ID
 * @param lineItems - Array of line item data
 * @returns Array of created LineItems records
 */
export async function saveLineItems(
  saleId: string,
  lineItems: LineItemData[]
): Promise<LineItemsRecord[]> {
  if (!lineItems || lineItems.length === 0) {
    logger.info("XATA", "No line items to save");
    return [];
  }

  logger.info("XATA", "Saving line items", {
    saleId,
    lineItemCount: lineItems.length,
  });

  const created: LineItemsRecord[] = [];

  for (const item of lineItems) {
    try {
      const record = await xata().db.LineItems.create({
        sale: saleId,
        line_number: item.lineNumber,
        brand: item.brand,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        buy_price: item.buyPrice,
        sell_price: item.sellPrice,
        line_total: item.lineTotal,
        line_margin: item.lineMargin,
        supplier: item.supplierId || undefined,
      });

      created.push(record as LineItemsRecord);
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
    totalCount: lineItems.length,
  });

  return created;
}

/**
 * Get line items for a sale
 *
 * @param saleId - The sale record ID
 * @returns Array of LineItems records
 */
export async function getLineItemsForSale(
  saleId: string
): Promise<LineItemsRecord[]> {
  const items = await xata()
    .db.LineItems.filter({ "sale.id": saleId })
    .select(["*", "supplier.id", "supplier.name"])
    .sort("line_number", "asc")
    .getMany();

  return items as LineItemsRecord[];
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get all sales for a specific shopper
 */
export async function getSalesByShopperId(shopperId: string): Promise<SalesRecord[]> {
  return (await xata()
    .db.Sales.filter({ "shopper.id": shopperId })
    .sort("sale_date", "desc")
    .getMany()) as SalesRecord[];
}

/**
 * Get total commissionable margin for a shopper (unpaid)
 */
export async function getUnpaidCommissionForShopper(
  shopperId: string
): Promise<number> {
  const sales = await xata()
    .db.Sales.filter({
      "shopper.id": shopperId,
      commission_paid: false,
    })
    .getMany();

  return sales.reduce((sum, sale) => sum + (sale.commissionable_margin || 0), 0);
}

/**
 * Lock all unpaid commissions up to a specific date
 */
export async function lockCommissionsUpToDate(date: Date): Promise<number> {
  const sales = await xata()
    .db.Sales.filter({
      sale_date: { $le: date },
      commission_locked: false,
    })
    .getMany();

  let count = 0;
  for (const sale of sales) {
    await xata().db.Sales.update(sale.id, {
      commission_locked: true,
      commission_lock_date: new Date(),
    });
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
): Promise<SalesRecord | null> {
  logger.info("XATA", "Looking up sale by invoice number", { invoiceNumber });

  const sale = await xata()
    .db.Sales.filter({ xero_invoice_number: invoiceNumber })
    .getFirst();

  if (sale) {
    logger.info("XATA", "Found sale", { saleId: sale.id });
  } else {
    logger.warn("XATA", "No sale found for invoice", { invoiceNumber });
  }

  return sale as SalesRecord | null;
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
