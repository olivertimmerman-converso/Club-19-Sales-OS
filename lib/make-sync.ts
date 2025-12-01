/**
 * Make.com Sale Sync Utility
 *
 * Syncs sale data to Make.com/Airtable immediately after successful Xero invoice creation.
 * This enables commission tracking, reporting, and deal management.
 */

import { SalePayload } from "@/lib/types/sale";

/**
 * Make.com webhook URL for sale sync
 * This webhook receives sale data and syncs it to Airtable
 */
const MAKE_WEBHOOK_URL = "https://hook.eu2.make.com/o4z51g88wep546r1bkx7wo7ck2249zq7";

/**
 * Sync sale data to Make.com/Airtable
 *
 * This function is called immediately after successful Xero invoice creation.
 * It sends the sale payload to Make.com for processing and Airtable sync.
 *
 * Features:
 * - Non-blocking (awaits the fetch but doesn't block invoice creation)
 * - Error handling with console logging (doesn't throw)
 * - Production-ready with comprehensive logging
 *
 * @param payload - Sale data payload conforming to SalePayload interface
 * @returns Promise<void> - Resolves when sync completes or fails (never throws)
 *
 * @example
 * ```typescript
 * await syncSaleToMake({
 *   saleReference: "INV-12345",
 *   saleDate: "2025-12-01",
 *   shopperName: "Sophie Williams",
 *   buyerName: "John Smith",
 *   supplierName: "Harrods",
 *   saleAmount: 15000,
 *   directCosts: 12000,
 *   brandTheme: ["CN 20% VAT"],
 *   currency: "GBP",
 * });
 * ```
 */
export async function syncSaleToMake(payload: SalePayload): Promise<void> {
  const startTime = Date.now();
  console.log("[MAKE SYNC] === Syncing sale to Make.com ===");
  console.log("[MAKE SYNC] Sale Reference:", payload.saleReference);
  console.log("[MAKE SYNC] Buyer:", payload.buyerName);
  console.log("[MAKE SYNC] Supplier:", payload.supplierName);
  console.log("[MAKE SYNC] Amount:", `${payload.currency} ${payload.saleAmount}`);

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[MAKE SYNC] ❌ Failed to sync sale to Make:");
      console.error(`[MAKE SYNC] Status: ${response.status} ${response.statusText}`);
      console.error(`[MAKE SYNC] Response: ${errorText}`);
      console.error(`[MAKE SYNC] Duration: ${duration}ms`);
      return; // Don't throw - just log the error
    }

    // Try to parse response for logging
    let responseData;
    try {
      responseData = await response.json();
      console.log("[MAKE SYNC] ✓✓✓ Sale synced successfully to Make.com");
      console.log(`[MAKE SYNC] Duration: ${duration}ms`);
      console.log("[MAKE SYNC] Response:", responseData);
    } catch {
      // Response might not be JSON, that's okay
      console.log("[MAKE SYNC] ✓✓✓ Sale synced successfully to Make.com");
      console.log(`[MAKE SYNC] Duration: ${duration}ms`);
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("[MAKE SYNC] ❌ Error syncing sale to Make:");
    console.error(`[MAKE SYNC] Error: ${error.message || error}`);
    console.error(`[MAKE SYNC] Duration: ${duration}ms`);
    // Don't throw - just log the error
  }
}

/**
 * Build sale payload from invoice data
 *
 * Helper function to construct a SalePayload from invoice creation data.
 * This ensures consistent payload structure across the application.
 *
 * @param params - Invoice and sale data
 * @returns SalePayload ready to send to Make.com
 *
 * @example
 * ```typescript
 * const payload = buildSalePayload({
 *   invoiceNumber: "INV-12345",
 *   invoiceDate: new Date(),
 *   shopperName: "Sophie Williams",
 *   buyerName: "John Smith",
 *   supplierName: "Harrods",
 *   saleAmount: 15000,
 *   buyPrice: 12000,
 *   cardFees: 300,
 *   brandTheme: "CN 20% VAT",
 *   notes: "Luxury handbag deal",
 * });
 * ```
 */
export function buildSalePayload(params: {
  invoiceNumber: string;
  invoiceDate: Date;
  shopperName: string; // The sales person/introducer
  buyerName: string; // The customer
  supplierName: string; // Where the item was sourced
  saleAmount: number; // Total invoice amount (inc VAT)
  buyPrice: number; // Supplier cost
  cardFees?: number; // Card processing fees
  shippingCost?: number; // Shipping cost
  brandTheme: string; // Xero branding theme name
  notes?: string;
  introducerName?: string; // Optional introducer
}): SalePayload {
  // Calculate direct costs (supplier cost + card fees + shipping)
  const directCosts =
    params.buyPrice + (params.cardFees || 0) + (params.shippingCost || 0);

  return {
    saleReference: params.invoiceNumber,
    saleDate: params.invoiceDate.toISOString().split("T")[0], // YYYY-MM-DD
    shopperName: params.shopperName,
    buyerName: params.buyerName,
    supplierName: params.supplierName,
    introducerName: params.introducerName,
    saleAmount: params.saleAmount,
    saleAmountExVat: undefined, // Let Airtable calculate if needed
    directCosts: directCosts,
    brandTheme: [params.brandTheme], // Array of theme names
    commissionBand: undefined, // Let Airtable calculate
    currency: "GBP",
    notes: params.notes,
  };
}
