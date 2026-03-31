import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

import fs from "fs";

async function main() {
  const { db } = await import("@/db");
  const { sales, shoppers, buyers, suppliers } = await import("@/db/schema");
  const { gte, lte, and, eq, sql } = await import("drizzle-orm");

  const start = new Date(2026, 0, 1, 0, 0, 0, 0); // Jan 1 2026
  const end = new Date(2026, 0, 31, 23, 59, 59, 999); // Jan 31 2026

  console.log("Querying January 2026 sales...");

  const rows = await db
    .select({
      // Sale identifiers
      id: sales.id,
      saleReference: sales.saleReference,
      xeroInvoiceNumber: sales.xeroInvoiceNumber,
      xeroInvoiceId: sales.xeroInvoiceId,
      saleDate: sales.saleDate,

      // Names via joins
      buyerName: buyers.name,
      shopperName: shoppers.name,
      supplierName: suppliers.name,

      // Item details
      brand: sales.brand,
      category: sales.category,
      itemTitle: sales.itemTitle,
      currency: sales.currency,
      brandingTheme: sales.brandingTheme,

      // Financials
      saleAmountIncVat: sales.saleAmountIncVat,
      saleAmountExVat: sales.saleAmountExVat,
      buyPrice: sales.buyPrice,
      grossMargin: sales.grossMargin,
      shippingCost: sales.shippingCost,
      shippingMethod: sales.shippingMethod,

      // Xero / Status
      invoiceStatus: sales.invoiceStatus,
      source: sales.source,
      buyerType: sales.buyerType,

      // Completion
      completedAt: sales.completedAt,
      completedBy: sales.completedBy,

      // Linked invoices
      linkedInvoices: sales.linkedInvoices,

      // Soft delete / dismissed
      deletedAt: sales.deletedAt,
      dismissed: sales.dismissed,

      // Introducer
      hasIntroducer: sales.hasIntroducer,
      introducerId: sales.introducerId,
      introducerCommission: sales.introducerCommission,
    })
    .from(sales)
    .leftJoin(shoppers, eq(sales.shopperId, shoppers.id))
    .leftJoin(buyers, eq(sales.buyerId, buyers.id))
    .leftJoin(suppliers, eq(sales.supplierId, suppliers.id))
    .where(and(gte(sales.saleDate, start), lte(sales.saleDate, end)))
    .orderBy(sales.xeroInvoiceNumber);

  console.log(`Found ${rows.length} records for January 2026.\n`);

  // --- Compute flags and missing fields ---
  const csvRows: string[] = [];

  // CSV header
  const headers = [
    "id",
    "xero_invoice_number",
    "sale_reference",
    "sale_date",
    "buyer_name",
    "shopper_name",
    "brand",
    "category",
    "item_title",
    "sale_amount_inc_vat",
    "sale_amount_ex_vat",
    "buy_price",
    "gross_margin",
    "margin_pct",
    "supplier_name",
    "shipping_method",
    "shipping_cost",
    "currency",
    "invoice_status",
    "source",
    "buyer_type",
    "branding_theme",
    "is_export",
    "completed_at",
    "completed_by",
    "linked_invoices_count",
    "linked_invoice_numbers",
    "deleted_at",
    "dismissed",
    "has_introducer",
    "introducer_commission",
    // Flags
    "FLAG_no_buy_price",
    "FLAG_negative_margin",
    "FLAG_no_supplier",
    "FLAG_no_brand",
    "FLAG_missing_fields",
    "missing_fields_list",
  ];
  csvRows.push(headers.join(","));

  // Counters for summary
  let totalRevenue = 0;
  let totalMargin = 0;
  let flagNoBuyPrice = 0;
  let flagNegativeMargin = 0;
  let flagNoSupplier = 0;
  let flagNoBrand = 0;
  let flagIncomplete = 0;
  let activeCount = 0;
  let deletedCount = 0;
  let dismissedCount = 0;
  let voidedCount = 0;
  let xeroImportCount = 0;
  let atelierCount = 0;
  const statusCounts: Record<string, number> = {};

  for (const r of rows) {
    // Calculate margin % safely
    const marginPct =
      r.saleAmountExVat && r.saleAmountExVat > 0
        ? ((r.grossMargin || 0) / r.saleAmountExVat) * 100
        : 0;

    // Is export (branding theme based)
    const isExport =
      r.brandingTheme?.toLowerCase().includes("export") ? true : false;

    // Linked invoices
    let linkedCount = 0;
    let linkedNumbers = "";
    if (r.linkedInvoices) {
      try {
        const linked = r.linkedInvoices as any[];
        linkedCount = linked.length;
        linkedNumbers = linked
          .map((l: any) => l.xero_invoice_number || l.xeroInvoiceNumber || "?")
          .join("; ");
      } catch {
        // ignore parse errors
      }
    }

    // Missing fields (replicating getMissingFields logic)
    const missing: string[] = [];
    if (!r.brand || r.brand === "Unknown") missing.push("brand");
    if (!r.category || r.category === "Unknown") missing.push("category");
    if (!r.buyPrice || r.buyPrice === 0) missing.push("buy_price");
    if (!r.supplierName) missing.push("supplier");
    if (r.hasIntroducer && !r.introducerId) missing.push("introducer");
    if (
      r.hasIntroducer &&
      (!r.introducerCommission || r.introducerCommission === 0)
    )
      missing.push("introducer_commission");

    // Flags
    const fNoBuyPrice = !r.buyPrice || r.buyPrice === 0;
    const fNegativeMargin = (r.grossMargin || 0) < 0;
    const fNoSupplier = !r.supplierName;
    const fNoBrand = !r.brand || r.brand === "Unknown";
    const fMissing = missing.length > 0;

    // Summary accumulators
    const isActive =
      r.source !== "xero_import" &&
      !r.deletedAt &&
      r.invoiceStatus !== "VOIDED";
    if (isActive) {
      activeCount++;
      totalRevenue += r.saleAmountIncVat || 0;
      totalMargin += r.grossMargin || 0;
    }
    if (r.deletedAt) deletedCount++;
    if (r.dismissed) dismissedCount++;
    if (r.invoiceStatus === "VOIDED") voidedCount++;
    if (r.source === "xero_import") xeroImportCount++;
    if (r.source === "atelier") atelierCount++;
    if (fNoBuyPrice && isActive) flagNoBuyPrice++;
    if (fNegativeMargin && isActive) flagNegativeMargin++;
    if (fNoSupplier && isActive) flagNoSupplier++;
    if (fNoBrand && isActive) flagNoBrand++;
    if (fMissing && isActive) flagIncomplete++;
    statusCounts[r.invoiceStatus || "NULL"] =
      (statusCounts[r.invoiceStatus || "NULL"] || 0) + 1;

    // CSV row
    const csvRow = [
      r.id,
      esc(r.xeroInvoiceNumber),
      esc(r.saleReference),
      r.saleDate ? r.saleDate.toISOString().split("T")[0] : "",
      esc(r.buyerName),
      esc(r.shopperName),
      esc(r.brand),
      esc(r.category),
      esc(r.itemTitle),
      num(r.saleAmountIncVat),
      num(r.saleAmountExVat),
      num(r.buyPrice),
      num(r.grossMargin),
      marginPct.toFixed(1),
      esc(r.supplierName),
      esc(r.shippingMethod),
      num(r.shippingCost),
      esc(r.currency),
      esc(r.invoiceStatus),
      esc(r.source),
      esc(r.buyerType),
      esc(r.brandingTheme),
      isExport ? "YES" : "NO",
      r.completedAt ? r.completedAt.toISOString().split("T")[0] : "",
      esc(r.completedBy),
      linkedCount,
      esc(linkedNumbers),
      r.deletedAt ? r.deletedAt.toISOString().split("T")[0] : "",
      r.dismissed ? "YES" : "NO",
      r.hasIntroducer ? "YES" : "NO",
      num(r.introducerCommission),
      fNoBuyPrice ? "YES" : "",
      fNegativeMargin ? "YES" : "",
      fNoSupplier ? "YES" : "",
      fNoBrand ? "YES" : "",
      fMissing ? "YES" : "",
      esc(missing.join("; ")),
    ];
    csvRows.push(csvRow.join(","));
  }

  // Write CSV
  const csvContent = csvRows.join("\n");
  const outPath = "jan-2026-reconciliation.csv";
  fs.writeFileSync(outPath, csvContent, "utf-8");
  console.log(`CSV written to ${outPath}`);

  // Console summary
  console.log("\n========================================");
  console.log("  JANUARY 2026 RECONCILIATION SUMMARY");
  console.log("========================================\n");
  console.log(`Total records:           ${rows.length}`);
  console.log(`  Atelier source:        ${atelierCount}`);
  console.log(`  Xero import source:    ${xeroImportCount}`);
  console.log(`  Other source:          ${rows.length - atelierCount - xeroImportCount}`);
  console.log(`  Deleted (soft):        ${deletedCount}`);
  console.log(`  Dismissed:             ${dismissedCount}`);
  console.log(`  Voided:                ${voidedCount}`);
  console.log(`\nActive sales (visible on sales page): ${activeCount}`);
  console.log(`  Total revenue (inc VAT): £${totalRevenue.toFixed(2)}`);
  console.log(`  Total gross margin:      £${totalMargin.toFixed(2)}`);
  console.log(`\nInvoice status breakdown:`);
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`\nFlags (active sales only):`);
  console.log(`  No buy price:          ${flagNoBuyPrice}`);
  console.log(`  Negative margin:       ${flagNegativeMargin}`);
  console.log(`  No supplier:           ${flagNoSupplier}`);
  console.log(`  No brand:              ${flagNoBrand}`);
  console.log(`  Incomplete (any):      ${flagIncomplete}`);
  console.log("");

  process.exit(0);
}

function esc(val: string | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function num(val: number | null | undefined): string {
  if (val == null) return "";
  return val.toFixed(2);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
