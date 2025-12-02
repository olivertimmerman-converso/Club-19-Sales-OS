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
} from "@/src/xata";
import { calculateCommission } from "./commission-engine";
import { transitionSaleStatus } from "./deal-lifecycle";
import { validateSaleInput, formatValidationErrors } from "./validation";
import { ERROR_TYPES, ERROR_TRIGGERED_BY } from "./error-types";
import {
  sanitizeString,
  sanitizeNotes,
  sanitizeContactName,
  sanitizeOptional,
} from "./sanitize";
import { calculateSaleEconomics as calculateEconomics } from "./economics";

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
  supplierName: string;
  supplierEmail?: string;
  supplierXeroId?: string;
  introducerName?: string;
  introducerCommission?: number;

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
  console.log("[XATA SALES] Sanitizing input...");

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
  console.log("[XATA SALES] Resolving relationships...");

  const shopper = await getOrCreateShopperByName(sanitizedPayload.shopperName);
  console.log(`[XATA SALES] ✓ Shopper: ${shopper.name} (${shopper.id})`);

  const buyer = await getOrCreateBuyer(
    sanitizedPayload.buyerName,
    sanitizedPayload.buyerEmail,
    sanitizedPayload.buyerXeroId
  );
  console.log(`[XATA SALES] ✓ Buyer: ${buyer.name} (${buyer.id})`);

  const supplier = await getOrCreateSupplier(
    sanitizedPayload.supplierName,
    sanitizedPayload.supplierEmail,
    sanitizedPayload.supplierXeroId
  );
  console.log(`[XATA SALES] ✓ Supplier: ${supplier.name} (${supplier.id})`);

  let introducer: IntroducersRecord | null = null;
  if (sanitizedPayload.introducerName) {
    introducer = await getOrCreateIntroducer(
      sanitizedPayload.introducerName,
      sanitizedPayload.introducerCommission
    );
    console.log(`[XATA SALES] ✓ Introducer: ${introducer.name} (${introducer.id})`);
  }

  // VALIDATION) RUN VALIDATION CHECKS
  console.log("[XATA SALES] Running validation checks...");
  const validation = validateSaleInput(sanitizedPayload);

  // B) COMPUTE ECONOMICS
  console.log("[XATA SALES] Computing economics...");

  const economics = calculateSaleEconomics({
    sale_amount_inc_vat: sanitizedPayload.sale_amount_inc_vat,
    buy_price: sanitizedPayload.buy_price,
    card_fees: sanitizedPayload.card_fees || 0,
    shipping_cost: sanitizedPayload.shipping_cost || 0,
  });

  console.log(`[XATA SALES] ✓ Gross margin: ${economics.gross_margin.toFixed(2)}`);
  console.log(
    `[XATA SALES] ✓ Commissionable margin: ${economics.commissionable_margin.toFixed(2)}`
  );

  // Find commission band based on commissionable margin
  const commissionBand = await getCommissionBandForMargin(
    economics.commissionable_margin
  );
  if (commissionBand) {
    console.log(
      `[XATA SALES] ✓ Commission band: ${commissionBand.band_type} (${commissionBand.commission_percent}%)`
    );
  }

  // C) CALCULATE COMMISSION
  console.log("[XATA SALES] Calculating commission...");

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

  console.log(
    `[XATA SALES] ✓ Commission amount: £${commissionResult.commission_amount}`
  );
  console.log(
    `[XATA SALES] ✓ Shopper commission: £${commissionResult.commission_split_shopper}`
  );
  if (commissionResult.commission_split_introducer > 0) {
    console.log(
      `[XATA SALES] ✓ Introducer commission: £${commissionResult.commission_split_introducer}`
    );
  }

  // Check for commission calculation errors
  const hasCommissionErrors = commissionResult.errors.length > 0;
  if (hasCommissionErrors) {
    console.error(
      `[XATA SALES] ⚠️ Commission errors: ${commissionResult.errors.join("; ")}`
    );
  }

  // D) INSERT INTO XATA SALES TABLE
  console.log("[XATA SALES] Creating sale record...");

  const sale = await xata().db.Sales.create({
    // Core identifiers
    sale_reference: sanitizedPayload.sale_reference,
    sale_date: sanitizedPayload.sale_date,

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

    // Notes
    internal_notes: sanitizedPayload.internal_notes || "",
  });

  console.log(`[XATA SALES] ✅ Sale created: ${sale.id}`);

  // E) LOG COMMISSION ERRORS TO ERRORS TABLE
  if (hasCommissionErrors) {
    try {
      const errorMessage = commissionResult.errors.join("; ");
      await xata().db.Errors.create({
        sale: sale.id,
        error_type: ERROR_TYPES.COMMISSION,
        severity: "high",
        source: "commission-engine",
        message: [errorMessage],
        metadata: {
          saleId: sale.id,
          commissionErrors: commissionResult.errors,
          payload: {
            sale_reference: sanitizedPayload.sale_reference,
            brand: sanitizedPayload.brand,
            category: sanitizedPayload.category,
          },
        },
        triggered_by: ERROR_TRIGGERED_BY.COMMISSION_ENGINE,
        timestamp: new Date(),
        resolved: false,
        resolved_by: null,
        resolved_at: null,
        resolved_notes: null,
      });
      console.log(`[XATA SALES] ⚠️ Commission error logged to Errors table`);
    } catch (err) {
      console.error(`[XATA SALES] ❌ Failed to log commission error:`, err);
    }
  }

  // F) LOG VALIDATION ERRORS TO ERRORS TABLE
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
        error_type: ERROR_TYPES.VALIDATION,
        severity: "high",
        source: "validation",
        message: [validationErrorMessage],
        metadata: {
          saleId: sale.id,
          validationErrors: validation.errors,
          validationWarnings: validation.warnings,
          payload: {
            sale_reference: sanitizedPayload.sale_reference,
            brand: sanitizedPayload.brand,
            category: sanitizedPayload.category,
            buyerName: sanitizedPayload.buyerName,
            supplierName: sanitizedPayload.supplierName,
          },
        },
        triggered_by: ERROR_TRIGGERED_BY.VALIDATION,
        timestamp: new Date(),
        resolved: false,
        resolved_by: null,
        resolved_at: null,
        resolved_notes: null,
      });

      console.log(`[XATA SALES] ⚠️ Validation errors logged to Errors table`);
    } catch (err) {
      console.error(`[XATA SALES] ❌ Failed to log validation errors:`, err);
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
    console.log("[XATA SALES] Starting invoice sync...");
    console.log("[XATA] Incoming Xero invoice:", params.xeroInvoice);
    console.log("[XATA] Incoming form data:", params.formData);

    // Validate required fields
    if (!params.xeroInvoice.InvoiceNumber) {
      console.warn("[XATA] Missing InvoiceNumber — aborting sync.");
      return null;
    }

    if (!params.formData.shopperName) {
      console.warn("[XATA] Missing shopperName — aborting sync.");
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

    console.log("[XATA SALES] ✅ Invoice sync complete");
    return sale;
  } catch (error) {
    console.error("[XATA SALES] ❌ Invoice sync failed (non-fatal):", error);
    // Don't throw - log and continue
    return null;
  }
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
  console.log(`[XATA SALES] Looking up sale by invoice number: ${invoiceNumber}`);

  const sale = await xata()
    .db.Sales.filter({ xero_invoice_number: invoiceNumber })
    .getFirst();

  if (sale) {
    console.log(`[XATA SALES] ✓ Found sale: ${sale.id}`);
  } else {
    console.warn(`[XATA SALES] ⚠️ No sale found for invoice: ${invoiceNumber}`);
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
  console.log(
    `[XATA SALES] Updating payment status for sale ${saleId} from Xero invoice`
  );

  // Validate invoice is paid
  const isPaid =
    invoice.Status === "PAID" ||
    (invoice.AmountDue !== undefined && invoice.AmountDue === 0);

  if (!isPaid) {
    const error = `Invoice not marked as paid (Status: ${invoice.Status}, AmountDue: ${invoice.AmountDue})`;
    console.warn(`[XATA SALES] ⚠️ ${error}`);
    return { success: false, error };
  }

  // Parse payment date
  let xeroPaymentDate: Date | undefined;
  if (invoice.PaidDate) {
    try {
      xeroPaymentDate = new Date(invoice.PaidDate);
    } catch (err) {
      console.warn(`[XATA SALES] ⚠️ Invalid PaidDate format: ${invoice.PaidDate}`);
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
    console.log(`[XATA SALES] ✅ Sale ${saleId} transitioned to "paid"`);
  } else {
    console.error(`[XATA SALES] ❌ Failed to transition sale: ${result.error}`);
  }

  return result;
}
