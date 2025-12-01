/**
 * Sale Payload for Make.com/Airtable Integration
 *
 * This payload is sent to Make.com immediately after successful Xero invoice creation
 * to sync sale data with Airtable for commission tracking and reporting.
 */

export interface SalePayload {
  saleReference: string; // unique ID used by Airtable + app
  saleDate: string; // ISO string e.g. 2025-12-01
  shopperName: string; // linked to Shopper table
  buyerName: string; // linked to Buyer table
  supplierName: string; // linked to Supplier table
  introducerName?: string; // optional linked introducer

  saleAmount: number; // Gross sale price (inc VAT)
  saleAmountExVat?: number; // Optional – app can compute or omit
  directCosts: number; // Supplier cost + card fees etc

  brandTheme: string[]; // array of theme names or IDs
  commissionBand?: string; // optional – Airtable can calculate

  currency: string; // "GBP"
  notes?: string; // optional
}
