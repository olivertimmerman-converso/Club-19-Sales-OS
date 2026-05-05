/**
 * Manual smoke test for the Google Sheets push integration.
 *
 * Usage: npx tsx scripts/test-sheets-push.ts
 *
 * Pushes a synthetic 2-line invoice to whichever sheet is mapped for the
 * "Test Shopper" name. In dev / non-production environments, this resolves
 * to SHEET_ID_TEST.
 *
 * Expected result:
 *   - Tab named "<Current Month> <Year>" exists with frozen header row
 *   - Two rows appear at the bottom of the tab
 *   - Row 1 has: "INV-TEST-XXXX", "Test Client", supplier "Acme", item
 *     "Hermes Bag — Test Birkin", buy £1000, sell £2500, formula cells
 *     calculate, introducer fee £200, Entrupy £35
 *   - Row 2 has: same invoice number, supplier "Other Supplier", item
 *     "Chanel Wallet — Test Wallet", buy £400, sell £800, formula cells
 *     calculate, costs columns showing 0
 *   - The script logs the row range, which you can paste into your browser
 *     after the sheet URL to jump straight to it
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Type-only imports are erased at compile time, so they don't trigger
// the lib/google-sheets module's auth-client construction at boot.
import type {
  SaleWithRelations,
  LineItemWithSupplier,
} from "@/lib/google-sheets-mapping";

async function main() {
  // Runtime import is lazy so dotenv has already loaded the env vars
  // before lib/google-sheets resolves them.
  const { pushSaleToShopperSheet } = await import("@/lib/google-sheets");

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64) {
    console.error(
      "[test-sheets-push] GOOGLE_SERVICE_ACCOUNT_KEY_B64 not set in .env.local"
    );
    process.exit(1);
  }
  if (!process.env.SHEET_ID_TEST) {
    console.error("[test-sheets-push] SHEET_ID_TEST not set in .env.local");
    process.exit(1);
  }

  // Synthesise a sale row with realistic data. Type assertions are necessary
  // because we're not actually round-tripping through the DB.
  const fakeInvoiceNumber = `INV-TEST-${Math.floor(Math.random() * 10000)}`;
  const now = new Date();

  const sale = {
    id: `test-sale-${Date.now()}`,
    saleReference: fakeInvoiceNumber,
    saleDate: now,
    shopperId: null,
    buyerId: null,
    supplierId: null,
    introducerId: null,
    commissionBandId: null,
    ownerId: null,
    brand: "Hermes",
    category: "Bag",
    itemTitle: "Test Birkin 25",
    quantity: 1,
    currency: "GBP",
    brandingTheme: "CN Margin Scheme",
    saleAmountIncVat: 3300,
    saleAmountExVat: 3300, // Margin scheme: ex VAT == inc VAT for sheet display
    buyPrice: 1400,
    cardFees: 79.2,
    shippingCost: 25,
    directCosts: 0,
    impliedShipping: null,
    grossMargin: 1900,
    commissionableMargin: 1500,
    xeroInvoiceNumber: fakeInvoiceNumber,
    xeroInvoiceId: null,
    xeroInvoiceUrl: null,
    invoiceStatus: "DRAFT",
    invoicePaidDate: null,
    xeroPaymentDate: null,
    commissionAmount: null,
    commissionSplitIntroducer: null,
    commissionSplitShopper: null,
    introducerSharePercent: null,
    adminOverrideCommissionPercent: null,
    adminOverrideNotes: null,
    commissionLocked: false,
    commissionPaid: false,
    commissionLockDate: null,
    commissionPaidDate: null,
    commissionClawback: null,
    commissionClawbackDate: null,
    commissionClawbackReason: null,
    hasIntroducer: true,
    introducerCommission: 200,
    introducerName: "Caroline Stanbury",
    isNewClient: true,
    entrupyFee: 35,
    isPaymentPlan: false,
    paymentPlanInstalments: null,
    depositAmount: null,
    paymentPlanNotes: null,
    shippingMethod: null,
    shippingCostConfirmed: false,
    paymentMethod: "card",
    status: "invoiced",
    source: "atelier",
    buyerType: "end_client",
    needsAllocation: false,
    internalNotes: null,
    allocatedBy: null,
    allocatedAt: null,
    completedAt: null,
    completedBy: null,
    errorFlag: false,
    errorMessage: null,
    deletedAt: null,
    dismissed: false,
    dismissedAt: null,
    dismissedBy: null,
    linkedInvoices: null,
    createdAt: now,
    updatedAt: now,
    xataVersion: null,
    buyer: { id: "fake-buyer", name: "Test Client", email: null, xeroContactId: null, ownerId: null, ownerChangedAt: null, ownerChangedBy: null, createdAt: now, updatedAt: now, xataVersion: null },
    supplier: { id: "fake-supplier", name: "Acme Suppliers", email: null, xeroContactId: null, pendingApproval: false, createdBy: null, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now, xataVersion: null },
  } as unknown as SaleWithRelations;

  const lineItems = [
    {
      id: "test-line-1",
      saleId: sale.id,
      supplierId: "fake-supplier-1",
      lineNumber: 1,
      brand: "Hermes",
      category: "Bag",
      description: "Test Birkin 25",
      quantity: 1,
      buyPrice: 1000,
      sellPrice: 2500,
      lineTotal: 2500,
      lineMargin: 1500,
      supplierInvoiceRef: null,
      datePurchased: null,
      source: "atelier",
      createdAt: now,
      updatedAt: now,
      xataVersion: null,
      supplier: { id: "fake-supplier-1", name: "Acme Suppliers", email: null, xeroContactId: null, pendingApproval: false, createdBy: null, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now, xataVersion: null },
    },
    {
      id: "test-line-2",
      saleId: sale.id,
      supplierId: "fake-supplier-2",
      lineNumber: 2,
      brand: "Chanel",
      category: "Wallet",
      description: "Test Wallet",
      quantity: 1,
      buyPrice: 400,
      sellPrice: 800,
      lineTotal: 800,
      lineMargin: 400,
      supplierInvoiceRef: null,
      datePurchased: null,
      source: "atelier",
      createdAt: now,
      updatedAt: now,
      xataVersion: null,
      supplier: { id: "fake-supplier-2", name: "Other Supplier", email: null, xeroContactId: null, pendingApproval: false, createdBy: null, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now, xataVersion: null },
    },
  ] as unknown as LineItemWithSupplier[];

  console.log("[test-sheets-push] Pushing synthetic 2-line sale...", {
    invoiceNumber: fakeInvoiceNumber,
  });

  const result = await pushSaleToShopperSheet({
    sale,
    lineItems,
    shopperName: "Test Shopper",
  });

  console.log("[test-sheets-push] Result:", JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exit(1);
  }

  if (result.skipped) {
    console.error("[test-sheets-push] Push was skipped — check SHEET_ID_TEST");
    process.exit(1);
  }

  // In dev there's a single test-sheet leg. In prod the master leg drives
  // the row tracking we surface here.
  const anchorLeg =
    result.legs.find((l) => l.spreadsheetId === process.env.SHEET_ID_MASTER) ??
    result.legs[0];
  const startRow = anchorLeg?.startRow ?? 0;
  const rowCount = anchorLeg?.rowCount ?? 0;

  console.log(
    `[test-sheets-push] Open the sheet and look for rows ${startRow}–${
      startRow + rowCount - 1
    } in tab "${anchorLeg?.tabName}" (legs: ${result.legs.length}, failed: ${
      result.legs.filter((l) => !l.success).length
    })`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[test-sheets-push] Fatal error:", err);
  process.exit(1);
});
