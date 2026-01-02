/**
 * Xata Database Client - Club 19 Sales OS
 *
 * Provides type-safe CRUD operations for all tables with relationship management.
 * Uses singleton pattern to avoid multiple client instances.
 */

import { getXataClient } from "@/src/xata";
import type {
  ShoppersRecord,
  BuyersRecord,
  SuppliersRecord,
  IntroducersRecord,
  CommissionBandsRecord,
  SalesRecord,
} from "@/src/xata";

// Singleton client instance
const xata = getXataClient();

// ============================================================================
// SALES OPERATIONS
// ============================================================================

export interface CreateSaleInput {
  // Core identifiers
  sale_reference: string;
  sale_date: Date;

  // Relationships (pass record IDs)
  shopper_id?: string;
  buyer_id?: string;
  supplier_id?: string;
  introducer_id?: string;
  commission_band_id?: string;

  // Item metadata
  brand?: string;
  category?: string;
  item_title?: string;
  quantity?: number;

  // Financial fields
  sale_amount_inc_vat: number;
  sale_amount_ex_vat: number;
  buy_price: number;
  card_fees?: number;
  shipping_cost?: number;
  direct_costs?: number;
  implied_shipping?: number;
  gross_margin: number;
  commissionable_margin: number;

  // Xero integration
  currency?: string;
  branding_theme?: string;
  xero_invoice_number?: string;
  xero_invoice_id?: string;
  xero_invoice_url?: string;
  invoice_status?: string;
  invoice_paid_date?: Date;

  // Commission tracking
  commission_locked?: boolean;
  commission_paid?: boolean;
  commission_lock_date?: Date;
  commission_paid_date?: Date;

  // Notes
  internal_notes?: string;
}

/**
 * Create a new sale record
 */
export async function createSale(input: CreateSaleInput): Promise<SalesRecord> {
  return await xata.db.Sales.create({
    sale_reference: input.sale_reference,
    sale_date: input.sale_date,

    // Relationships
    shopper: input.shopper_id,
    buyer: input.buyer_id,
    supplier: input.supplier_id,
    introducer: input.introducer_id,
    commission_band: input.commission_band_id,

    // Item metadata
    brand: input.brand || "",
    category: input.category || "",
    item_title: input.item_title || "",
    quantity: input.quantity || 1,

    // Financial fields
    sale_amount_inc_vat: input.sale_amount_inc_vat,
    sale_amount_ex_vat: input.sale_amount_ex_vat,
    buy_price: input.buy_price,
    card_fees: input.card_fees || 0,
    shipping_cost: input.shipping_cost || 0,
    direct_costs: input.direct_costs || 0,
    implied_shipping: input.implied_shipping || 0,
    gross_margin: input.gross_margin,
    commissionable_margin: input.commissionable_margin,

    // Xero
    currency: input.currency || "GBP",
    branding_theme: input.branding_theme || "",
    xero_invoice_number: input.xero_invoice_number || "",
    xero_invoice_id: input.xero_invoice_id || "",
    xero_invoice_url: input.xero_invoice_url || "",
    invoice_status: input.invoice_status || "DRAFT",
    invoice_paid_date: input.invoice_paid_date,

    // Commission
    commission_locked: input.commission_locked || false,
    commission_paid: input.commission_paid || false,
    commission_lock_date: input.commission_lock_date,
    commission_paid_date: input.commission_paid_date,

    // Notes
    internal_notes: input.internal_notes || "",
  });
}

/**
 * Get a sale by ID with all relationships populated
 */
export async function getSaleById(id: string): Promise<SalesRecord | null> {
  return await xata.db.Sales.read(id, [
    "shopper.*",
    "buyer.*",
    "supplier.*",
    "introducer.*",
    "commission_band.*",
  ]);
}

/**
 * List all sales with pagination and filtering
 */
export async function listSales(options?: {
  limit?: number;
  offset?: number;
  shopper_id?: string;
  buyer_id?: string;
  supplier_id?: string;
  date_from?: Date;
  date_to?: Date;
}): Promise<SalesRecord[]> {
  let query = xata.db.Sales.select([
    "*",
    "shopper.*",
    "buyer.*",
    "supplier.*",
    "introducer.*",
    "commission_band.*",
  ]);

  // Apply filters
  if (options?.shopper_id) {
    query = query.filter({ "shopper.id": options.shopper_id });
  }
  if (options?.buyer_id) {
    query = query.filter({ "buyer.id": options.buyer_id });
  }
  if (options?.supplier_id) {
    query = query.filter({ "supplier.id": options.supplier_id });
  }
  if (options?.date_from) {
    query = query.filter({ sale_date: { $ge: options.date_from } });
  }
  if (options?.date_to) {
    query = query.filter({ sale_date: { $le: options.date_to } });
  }

  // Apply pagination
  if (options?.offset) {
    query = query.offset(options.offset);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  // Sort by date descending
  query = query.sort("sale_date", "desc");

  return await query.getMany();
}

/**
 * Update a sale record
 */
export async function updateSale(
  id: string,
  updates: Partial<CreateSaleInput>
): Promise<SalesRecord | null> {
  const updateData: Record<string, unknown> = {};

  // Only include fields that are provided
  if (updates.sale_reference !== undefined)
    updateData.sale_reference = updates.sale_reference;
  if (updates.sale_date !== undefined) updateData.sale_date = updates.sale_date;
  if (updates.shopper_id !== undefined) updateData.shopper = updates.shopper_id;
  if (updates.buyer_id !== undefined) updateData.buyer = updates.buyer_id;
  if (updates.supplier_id !== undefined) updateData.supplier = updates.supplier_id;
  if (updates.introducer_id !== undefined)
    updateData.introducer = updates.introducer_id;
  if (updates.commission_band_id !== undefined)
    updateData.commission_band = updates.commission_band_id;
  if (updates.brand !== undefined) updateData.brand = updates.brand;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.item_title !== undefined) updateData.item_title = updates.item_title;
  if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
  if (updates.sale_amount_inc_vat !== undefined)
    updateData.sale_amount_inc_vat = updates.sale_amount_inc_vat;
  if (updates.sale_amount_ex_vat !== undefined)
    updateData.sale_amount_ex_vat = updates.sale_amount_ex_vat;
  if (updates.buy_price !== undefined) updateData.buy_price = updates.buy_price;
  if (updates.card_fees !== undefined) updateData.card_fees = updates.card_fees;
  if (updates.shipping_cost !== undefined)
    updateData.shipping_cost = updates.shipping_cost;
  if (updates.direct_costs !== undefined)
    updateData.direct_costs = updates.direct_costs;
  if (updates.implied_shipping !== undefined)
    updateData.implied_shipping = updates.implied_shipping;
  if (updates.gross_margin !== undefined)
    updateData.gross_margin = updates.gross_margin;
  if (updates.commissionable_margin !== undefined)
    updateData.commissionable_margin = updates.commissionable_margin;
  if (updates.currency !== undefined) updateData.currency = updates.currency;
  if (updates.branding_theme !== undefined)
    updateData.branding_theme = updates.branding_theme;
  if (updates.xero_invoice_number !== undefined)
    updateData.xero_invoice_number = updates.xero_invoice_number;
  if (updates.xero_invoice_id !== undefined)
    updateData.xero_invoice_id = updates.xero_invoice_id;
  if (updates.xero_invoice_url !== undefined)
    updateData.xero_invoice_url = updates.xero_invoice_url;
  if (updates.invoice_status !== undefined)
    updateData.invoice_status = updates.invoice_status;
  if (updates.invoice_paid_date !== undefined)
    updateData.invoice_paid_date = updates.invoice_paid_date;
  if (updates.commission_locked !== undefined)
    updateData.commission_locked = updates.commission_locked;
  if (updates.commission_paid !== undefined)
    updateData.commission_paid = updates.commission_paid;
  if (updates.commission_lock_date !== undefined)
    updateData.commission_lock_date = updates.commission_lock_date;
  if (updates.commission_paid_date !== undefined)
    updateData.commission_paid_date = updates.commission_paid_date;
  if (updates.internal_notes !== undefined)
    updateData.internal_notes = updates.internal_notes;

  return await xata.db.Sales.update(id, updateData);
}

/**
 * Delete a sale record
 */
export async function deleteSale(id: string): Promise<void> {
  await xata.db.Sales.delete(id);
}

// ============================================================================
// SHOPPER OPERATIONS
// ============================================================================

export interface CreateShopperInput {
  name: string;
  email?: string;
  commission_scheme?: string;
  active?: boolean;
}

export async function createShopper(
  input: CreateShopperInput
): Promise<ShoppersRecord> {
  return await xata.db.Shoppers.create({
    name: input.name,
    email: input.email || "",
    commission_scheme: input.commission_scheme || "",
    active: input.active !== undefined ? input.active : true,
  });
}

export async function getShopperById(
  id: string
): Promise<ShoppersRecord | null> {
  return await xata.db.Shoppers.read(id);
}

export async function getShopperByName(
  name: string
): Promise<ShoppersRecord | null> {
  return await xata.db.Shoppers.filter({ name }).getFirst();
}

export async function listShoppers(): Promise<ShoppersRecord[]> {
  return await xata.db.Shoppers.getAll();
}

export async function updateShopper(
  id: string,
  updates: Partial<CreateShopperInput>
): Promise<ShoppersRecord | null> {
  return await xata.db.Shoppers.update(id, updates);
}

export async function deleteShopper(id: string): Promise<void> {
  await xata.db.Shoppers.delete(id);
}

// ============================================================================
// BUYER OPERATIONS
// ============================================================================

export interface CreateBuyerInput {
  name: string;
  email?: string;
  xero_contact_id?: string;
}

export async function createBuyer(input: CreateBuyerInput): Promise<BuyersRecord> {
  return await xata.db.Buyers.create({
    name: input.name,
    email: input.email || "",
    xero_contact_id: input.xero_contact_id || "",
  });
}

export async function getBuyerById(id: string): Promise<BuyersRecord | null> {
  return await xata.db.Buyers.read(id);
}

export async function getBuyerByName(name: string): Promise<BuyersRecord | null> {
  return await xata.db.Buyers.filter({ name }).getFirst();
}

export async function getBuyerByXeroId(
  xeroId: string
): Promise<BuyersRecord | null> {
  return await xata.db.Buyers.filter({ xero_contact_id: xeroId }).getFirst();
}

export async function listBuyers(): Promise<BuyersRecord[]> {
  return await xata.db.Buyers.getAll();
}

export async function updateBuyer(
  id: string,
  updates: Partial<CreateBuyerInput>
): Promise<BuyersRecord | null> {
  return await xata.db.Buyers.update(id, updates);
}

export async function deleteBuyer(id: string): Promise<void> {
  await xata.db.Buyers.delete(id);
}

// ============================================================================
// SUPPLIER OPERATIONS
// ============================================================================

export interface CreateSupplierInput {
  name: string;
  email?: string;
  xero_contact_id?: string;
}

export async function createSupplier(
  input: CreateSupplierInput
): Promise<SuppliersRecord> {
  return await xata.db.Suppliers.create({
    name: input.name,
    email: input.email || "",
    xero_contact_id: input.xero_contact_id || "",
  });
}

export async function getSupplierById(id: string): Promise<SuppliersRecord | null> {
  return await xata.db.Suppliers.read(id);
}

export async function getSupplierByName(
  name: string
): Promise<SuppliersRecord | null> {
  return await xata.db.Suppliers.filter({ name }).getFirst();
}

export async function getSupplierByXeroId(
  xeroId: string
): Promise<SuppliersRecord | null> {
  return await xata.db.Suppliers.filter({ xero_contact_id: xeroId }).getFirst();
}

export async function listSuppliers(): Promise<SuppliersRecord[]> {
  return await xata.db.Suppliers.getAll();
}

export async function updateSupplier(
  id: string,
  updates: Partial<CreateSupplierInput>
): Promise<SuppliersRecord | null> {
  return await xata.db.Suppliers.update(id, updates);
}

export async function deleteSupplier(id: string): Promise<void> {
  await xata.db.Suppliers.delete(id);
}

// ============================================================================
// INTRODUCER OPERATIONS
// ============================================================================

export interface CreateIntroducerInput {
  name: string;
  commission_percent: number;
}

export async function createIntroducer(
  input: CreateIntroducerInput
): Promise<IntroducersRecord> {
  return await xata.db.Introducers.create({
    name: input.name,
    commission_percent: input.commission_percent,
  });
}

export async function getIntroducerById(
  id: string
): Promise<IntroducersRecord | null> {
  return await xata.db.Introducers.read(id);
}

export async function getIntroducerByName(
  name: string
): Promise<IntroducersRecord | null> {
  return await xata.db.Introducers.filter({ name }).getFirst();
}

export async function listIntroducers(): Promise<IntroducersRecord[]> {
  return await xata.db.Introducers.getAll();
}

export async function updateIntroducer(
  id: string,
  updates: Partial<CreateIntroducerInput>
): Promise<IntroducersRecord | null> {
  return await xata.db.Introducers.update(id, updates);
}

export async function deleteIntroducer(id: string): Promise<void> {
  await xata.db.Introducers.delete(id);
}

// ============================================================================
// COMMISSION BAND OPERATIONS
// ============================================================================

export interface CreateCommissionBandInput {
  band_type: string;
  min_threshold: number;
  max_threshold: number;
  commission_percent: number;
}

export async function createCommissionBand(
  input: CreateCommissionBandInput
): Promise<CommissionBandsRecord> {
  return await xata.db.CommissionBands.create({
    band_type: input.band_type,
    min_threshold: input.min_threshold,
    max_threshold: input.max_threshold,
    commission_percent: input.commission_percent,
  });
}

export async function getCommissionBandById(
  id: string
): Promise<CommissionBandsRecord | null> {
  return await xata.db.CommissionBands.read(id);
}

export async function listCommissionBands(): Promise<CommissionBandsRecord[]> {
  return await xata.db.CommissionBands.getAll();
}

export async function updateCommissionBand(
  id: string,
  updates: Partial<CreateCommissionBandInput>
): Promise<CommissionBandsRecord | null> {
  return await xata.db.CommissionBands.update(id, updates);
}

export async function deleteCommissionBand(id: string): Promise<void> {
  await xata.db.CommissionBands.delete(id);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Find or create a shopper by name
 */
export async function findOrCreateShopper(
  name: string,
  data?: Partial<CreateShopperInput>
): Promise<ShoppersRecord> {
  const existing = await getShopperByName(name);
  if (existing) return existing;

  return await createShopper({
    name,
    ...data,
  });
}

/**
 * Find or create a buyer by name
 */
export async function findOrCreateBuyer(
  name: string,
  data?: Partial<CreateBuyerInput>
): Promise<BuyersRecord> {
  const existing = await getBuyerByName(name);
  if (existing) return existing;

  return await createBuyer({
    name,
    ...data,
  });
}

/**
 * Find or create a supplier by name
 */
export async function findOrCreateSupplier(
  name: string,
  data?: Partial<CreateSupplierInput>
): Promise<SuppliersRecord> {
  const existing = await getSupplierByName(name);
  if (existing) return existing;

  return await createSupplier({
    name,
    ...data,
  });
}

/**
 * Calculate total sales for a shopper
 */
export async function getShopperTotalSales(shopperId: string): Promise<number> {
  const sales = await listSales({ shopper_id: shopperId });
  return sales.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
}

/**
 * Calculate total commission for a shopper (unpaid)
 */
export async function getShopperUnpaidCommission(
  shopperId: string
): Promise<number> {
  const sales = await xata.db.Sales.filter({
    "shopper.id": shopperId,
    commission_paid: false,
  }).getMany();

  return sales.reduce((sum, sale) => sum + (sale.commissionable_margin || 0), 0);
}

/**
 * Lock commissions for all sales up to a specific date
 */
export async function lockCommissionsUpToDate(date: Date): Promise<number> {
  const sales = await xata.db.Sales.filter({
    sale_date: { $le: date },
    commission_locked: false,
  }).getMany();

  let count = 0;
  for (const sale of sales) {
    await xata.db.Sales.update(sale.id, {
      commission_locked: true,
      commission_lock_date: new Date(),
    });
    count++;
  }

  return count;
}
