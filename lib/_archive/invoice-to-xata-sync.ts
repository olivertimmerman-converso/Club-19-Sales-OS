/**
 * Invoice to Xata Sync
 *
 * Syncs invoice data from the Trade Invoice wizard to Xata database
 */

import * as logger from '../logger';
import {
  createSale,
  findOrCreateShopper,
  findOrCreateBuyer,
  findOrCreateSupplier,
  type CreateSaleInput,
} from "./xata-client";

export interface InvoiceDataForSync {
  // Core invoice data
  invoiceNumber: string;
  invoiceDate: Date;

  // Parties
  shopperName: string;
  shopperEmail?: string;
  buyerName: string;
  buyerEmail?: string;
  buyerXeroId?: string;
  supplierName: string;
  supplierEmail?: string;
  supplierXeroId?: string;

  // Item details
  brand?: string;
  category?: string;
  itemTitle?: string;
  quantity?: number;

  // Financial data
  saleAmountIncVat: number;
  saleAmountExVat: number;
  buyPrice: number;
  cardFees?: number;
  shippingCost?: number;
  directCosts?: number;
  impliedShipping?: number;
  grossMargin: number;
  commissionableMargin: number;

  // Xero metadata
  currency?: string;
  brandingTheme?: string;
  xeroInvoiceId?: string;
  xeroInvoiceUrl?: string;
  invoiceStatus?: string;

  // Notes
  internalNotes?: string;
}

/**
 * Sync an invoice to Xata database
 *
 * This function:
 * 1. Creates/finds shopper, buyer, supplier
 * 2. Creates the sale record with all relationships
 * 3. Returns the created sale record
 */
export async function syncInvoiceToXata(data: InvoiceDataForSync) {
  try {
    logger.info('XERO_SYNC', `Starting sync for invoice: ${data.invoiceNumber}`);

    // Step 1: Find or create Shopper
    const shopper = await findOrCreateShopper(data.shopperName, {
      email: data.shopperEmail,
      active: true,
    });
    logger.info('XERO_SYNC', `Shopper: ${shopper.name} (${shopper.id})`);

    // Step 2: Find or create Buyer
    const buyer = await findOrCreateBuyer(data.buyerName, {
      email: data.buyerEmail,
      xero_contact_id: data.buyerXeroId,
    });
    logger.info('XERO_SYNC', `Buyer: ${buyer.name} (${buyer.id})`);

    // Step 3: Find or create Supplier
    const supplier = await findOrCreateSupplier(data.supplierName, {
      email: data.supplierEmail,
      xero_contact_id: data.supplierXeroId,
    });
    logger.info('XERO_SYNC', `Supplier: ${supplier.name} (${supplier.id})`);

    // Step 4: Create Sale record
    const saleInput: CreateSaleInput = {
      sale_reference: data.invoiceNumber,
      sale_date: data.invoiceDate,

      // Relationships
      shopper_id: shopper.id,
      buyer_id: buyer.id,
      supplier_id: supplier.id,

      // Item metadata
      brand: data.brand,
      category: data.category,
      item_title: data.itemTitle,
      quantity: data.quantity || 1,

      // Financial data
      sale_amount_inc_vat: data.saleAmountIncVat,
      sale_amount_ex_vat: data.saleAmountExVat,
      buy_price: data.buyPrice,
      card_fees: data.cardFees || 0,
      shipping_cost: data.shippingCost || 0,
      direct_costs: data.directCosts || 0,
      implied_shipping: data.impliedShipping || 0,
      gross_margin: data.grossMargin,
      commissionable_margin: data.commissionableMargin,

      // Xero integration
      currency: data.currency || "GBP",
      branding_theme: data.brandingTheme,
      xero_invoice_id: data.xeroInvoiceId,
      xero_invoice_url: data.xeroInvoiceUrl,
      invoice_status: data.invoiceStatus || "DRAFT",

      // Commission tracking - defaults
      commission_locked: false,
      commission_paid: false,

      // Notes
      internal_notes: data.internalNotes,
    };

    const sale = await createSale(saleInput);
    logger.info('XERO_SYNC', `Sale created: ${sale.id}`);

    logger.info('XERO_SYNC', `Sync complete for invoice: ${data.invoiceNumber}`);

    return {
      success: true,
      sale,
      shopper,
      buyer,
      supplier,
    };
  } catch (error) {
    logger.error('XERO_SYNC', 'Sync failed', error);
    throw error;
  }
}

/**
 * Update an existing sale record in Xata
 *
 * Used when invoice is updated (e.g., Xero invoice created, payment received)
 */
export async function updateSaleInXata(
  saleId: string,
  updates: {
    xeroInvoiceNumber?: string;
    xeroInvoiceId?: string;
    xeroInvoiceUrl?: string;
    invoiceStatus?: string;
    invoicePaidDate?: Date;
  }
) {
  try {
    const { updateSale } = await import("./xata-client");

    await updateSale(saleId, {
      xero_invoice_number: updates.xeroInvoiceNumber,
      xero_invoice_id: updates.xeroInvoiceId,
      xero_invoice_url: updates.xeroInvoiceUrl,
      invoice_status: updates.invoiceStatus,
      invoice_paid_date: updates.invoicePaidDate,
    });

    logger.info('XERO_SYNC', `Sale updated: ${saleId}`);
  } catch (error) {
    logger.error('XERO_SYNC', 'Update failed', error);
    throw error;
  }
}
