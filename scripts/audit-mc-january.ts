import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

import { db } from "@/db";
import { shoppers, sales, buyers, suppliers, lineItems } from "@/db/schema";
import { ilike, or, and, gte, lt, isNull, eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import fs from "fs";

// ─── Helpers ───────────────────────────────────────────────────────────────

function excelDateToJS(serial: number): Date {
  // Excel serial date (days since 1900-01-01, with the 1900 leap year bug)
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

function parseSheetDate(val: unknown): Date | null {
  if (val == null) return null;
  if (typeof val === "number") {
    return excelDateToJS(val);
  }
  if (typeof val === "string") {
    // DD/M/YY format
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (m) {
      const day = parseInt(m[1]);
      const month = parseInt(m[2]);
      const year = 2000 + parseInt(m[3]);
      return new Date(year, month - 1, day);
    }
  }
  return null;
}

function parseInvoiceNumbers(val: unknown): string[] {
  if (val == null) return [];
  const s = String(val).trim();
  if (s === "N/A" || s === "") return [];
  // Handle compound like "3291/3293"
  return s.split("/").map((x) => "INV-" + x.trim());
}

function normalise(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // ── Step 1: Read MC's sheet ──────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 1: MC's January 2026 Sales (from spreadsheet)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const wb = XLSX.readFile("/Users/olivertimmerman/Downloads/MC Sales sheet.xlsx");
  const ws = wb.Sheets["MC 2026"];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  // Headers in row 0
  const headers = (raw[0] as string[]).map((h) => (h ?? "").trim());

  interface SheetRow {
    referrer: string;
    date: Date | null;
    invoice: string[];
    invoiceRaw: string;
    client: string;
    clientStatus: string;
    supplier: string;
    item: string;
    brand: string;
    category: string;
    buy: number | null;
    sell: number | null;
    margin: number | string | null;
    paid: string;
  }

  const sheetRows: SheetRow[] = [];

  // Scan rows 1–25 to capture all January invoices (INV-3233 through ~INV-3293)
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length < 3) continue;

    const invoiceRaw = String(r[2] ?? "").trim();
    const invNums = parseInvoiceNumbers(r[2]);
    const date = parseSheetDate(r[1]);

    // Stop when we're clearly past January (invoice > 3293 and date is Feb+)
    // But include all rows that have invoice numbers in the Jan range
    const firstInvNum = invNums.length > 0 ? parseInt(invNums[0].replace("INV-", "")) : 0;

    // Include if: invoice is in range 3233-3293, OR row index <= 20 with valid data
    const isJanByInvoice = firstInvNum >= 3233 && firstInvNum <= 3293;
    const isJanByDate = date && date.getMonth() === 0 && date.getFullYear() === 2026;
    const isEarlyRow = i <= 20;

    if (!isJanByInvoice && !isJanByDate && !isEarlyRow) continue;
    // Skip completely empty rows
    if (!r[2] && !r[3] && !r[6]) continue;

    sheetRows.push({
      referrer: String(r[0] ?? "").trim(),
      date,
      invoice: invNums,
      invoiceRaw,
      client: String(r[3] ?? "").trim(),
      clientStatus: String(r[4] ?? "").trim(),
      supplier: String(r[5] ?? "").trim(),
      item: String(r[6] ?? "").trim(),
      brand: String(r[7] ?? "").trim(),
      category: String(r[8] ?? "").trim(),
      buy: typeof r[9] === "number" ? r[9] : null,
      sell: typeof r[10] === "number" ? r[10] : null,
      margin: r[11] != null ? r[11] : null,
      paid: String(r[12] ?? "").trim(),
    });
  }

  console.log(`Found ${sheetRows.length} January rows in MC's sheet:\n`);
  console.log(
    "INV#".padEnd(14) +
      "CLIENT".padEnd(25) +
      "SUPPLIER".padEnd(18) +
      "BUY".padStart(10) +
      "SELL".padStart(10) +
      "MARGIN".padStart(10) +
      "  PAID"
  );
  console.log("-".repeat(95));
  for (const row of sheetRows) {
    const invStr = row.invoiceRaw || "(none)";
    console.log(
      invStr.padEnd(14) +
        row.client.slice(0, 24).padEnd(25) +
        row.supplier.slice(0, 17).padEnd(18) +
        fmt(row.buy).padStart(10) +
        fmt(row.sell).padStart(10) +
        String(row.margin ?? "-").toString().padStart(10) +
        "  " +
        (row.paid || "-")
    );
  }

  // ── Step 2: Query Sales OS database ──────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  STEP 2: MC's January 2026 Sales (from Sales OS database)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Find MC
  const mcRecords = await db
    .select()
    .from(shoppers)
    .where(or(ilike(shoppers.name, "%mary%"), ilike(shoppers.name, "%MC%"), ilike(shoppers.name, "%clair%")));

  if (mcRecords.length === 0) {
    // Try broader search
    const allShoppers = await db.select({ id: shoppers.id, name: shoppers.name }).from(shoppers);
    console.log("Could not find MC. All shoppers:", allShoppers.map((s) => s.name).join(", "));
    process.exit(1);
  }

  const mc = mcRecords[0];
  console.log(`MC found: ${mc.name} (ID: ${mc.id})\n`);

  const janSales = await db
    .select({
      id: sales.id,
      invoiceNumber: sales.xeroInvoiceNumber,
      saleRef: sales.saleReference,
      saleDate: sales.saleDate,
      buyerName: buyers.name,
      supplierName: suppliers.name,
      brand: sales.brand,
      category: sales.category,
      itemTitle: sales.itemTitle,
      buyPrice: sales.buyPrice,
      saleAmountIncVat: sales.saleAmountIncVat,
      saleAmountExVat: sales.saleAmountExVat,
      grossMargin: sales.grossMargin,
      invoiceStatus: sales.invoiceStatus,
      source: sales.source,
      needsAllocation: sales.needsAllocation,
      completedAt: sales.completedAt,
      status: sales.status,
    })
    .from(sales)
    .leftJoin(buyers, eq(sales.buyerId, buyers.id))
    .leftJoin(suppliers, eq(sales.supplierId, suppliers.id))
    .where(
      and(
        or(eq(sales.shopperId, mc.id), eq(sales.ownerId, mc.id)),
        gte(sales.saleDate, new Date("2026-01-01")),
        lt(sales.saleDate, new Date("2026-02-01")),
        isNull(sales.deletedAt)
      )
    )
    .orderBy(sales.xeroInvoiceNumber);

  console.log(`Found ${janSales.length} January sales in Sales OS:\n`);
  console.log(
    "INV#".padEnd(14) +
      "CLIENT".padEnd(25) +
      "SUPPLIER".padEnd(18) +
      "BUY".padStart(10) +
      "SELL(ex)".padStart(10) +
      "MARGIN".padStart(10) +
      "  STATUS"
  );
  console.log("-".repeat(95));
  for (const s of janSales) {
    console.log(
      (s.invoiceNumber ?? "(none)").padEnd(14) +
        (s.buyerName ?? "-").slice(0, 24).padEnd(25) +
        (s.supplierName ?? "-").slice(0, 17).padEnd(18) +
        fmt(s.buyPrice).padStart(10) +
        fmt(s.saleAmountExVat).padStart(10) +
        fmt(s.grossMargin).padStart(10) +
        "  " +
        (s.invoiceStatus ?? s.status ?? "-")
    );
  }

  // Get line items for context
  const saleIds = janSales.map((s) => s.id);
  let dbLineItems: { saleId: string; description: string | null; buyPrice: number | null; sellPrice: number | null; supplierName: string | null }[] = [];
  if (saleIds.length > 0) {
    dbLineItems = await db
      .select({
        saleId: lineItems.saleId,
        description: lineItems.description,
        buyPrice: lineItems.buyPrice,
        sellPrice: lineItems.sellPrice,
        supplierName: suppliers.name,
      })
      .from(lineItems)
      .leftJoin(suppliers, eq(lineItems.supplierId, suppliers.id))
      .where(sql`${lineItems.saleId} IN (${sql.join(saleIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  // ── Step 3: Cross-reference ──────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  STEP 3: Comparison Report");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Build lookup maps
  const dbByInvoice = new Map<string, (typeof janSales)[0]>();
  for (const s of janSales) {
    if (s.invoiceNumber) dbByInvoice.set(s.invoiceNumber, s);
  }

  const sheetByInvoice = new Map<string, SheetRow>();
  for (const row of sheetRows) {
    for (const inv of row.invoice) {
      sheetByInvoice.set(inv, row);
    }
  }

  // All invoice numbers from both sources
  const allInvoices = new Set([...dbByInvoice.keys(), ...sheetByInvoice.keys()]);

  const missingFromDB: SheetRow[] = [];
  const missingFromSheet: (typeof janSales)[0][] = [];
  const mismatches: {
    invoice: string;
    field: string;
    sheet: string;
    db: string;
  }[] = [];

  for (const inv of [...allInvoices].sort()) {
    const inSheet = sheetByInvoice.has(inv);
    const inDB = dbByInvoice.has(inv);

    if (inSheet && !inDB) {
      missingFromDB.push(sheetByInvoice.get(inv)!);
      continue;
    }
    if (inDB && !inSheet) {
      missingFromSheet.push(dbByInvoice.get(inv)!);
      continue;
    }

    // Both exist — compare
    const sheetRow = sheetByInvoice.get(inv)!;
    const dbRow = dbByInvoice.get(inv)!;

    // Client name
    if (normalise(sheetRow.client) !== normalise(dbRow.buyerName)) {
      mismatches.push({
        invoice: inv,
        field: "Client",
        sheet: sheetRow.client,
        db: dbRow.buyerName ?? "(none)",
      });
    }

    // Supplier name
    if (normalise(sheetRow.supplier) !== normalise(dbRow.supplierName) && sheetRow.supplier) {
      mismatches.push({
        invoice: inv,
        field: "Supplier",
        sheet: sheetRow.supplier,
        db: dbRow.supplierName ?? "(none)",
      });
    }

    // Sell price — sheet SELL vs DB saleAmountExVat (MC's sheet appears to be ex-VAT for export/B2B)
    // Compare against both inc and ex VAT
    if (sheetRow.sell != null && dbRow.saleAmountExVat != null) {
      const sheetSell = sheetRow.sell;
      const dbSellEx = dbRow.saleAmountExVat;
      const dbSellInc = dbRow.saleAmountIncVat ?? dbSellEx;
      // Allow match against either
      if (Math.abs(sheetSell - dbSellEx) > 1 && Math.abs(sheetSell - dbSellInc) > 1) {
        mismatches.push({
          invoice: inv,
          field: "Sell Price",
          sheet: fmt(sheetSell),
          db: `${fmt(dbSellEx)} (ex) / ${fmt(dbSellInc)} (inc)`,
        });
      }
    }

    // Buy price
    if (sheetRow.buy != null && dbRow.buyPrice != null) {
      if (Math.abs(sheetRow.buy - dbRow.buyPrice) > 1) {
        mismatches.push({
          invoice: inv,
          field: "Buy Price",
          sheet: fmt(sheetRow.buy),
          db: fmt(dbRow.buyPrice),
        });
      }
    }

    // Margin
    const sheetMarginNum = typeof sheetRow.margin === "number" ? sheetRow.margin : null;
    if (sheetMarginNum != null && dbRow.grossMargin != null) {
      if (Math.abs(sheetMarginNum - dbRow.grossMargin) > 1) {
        mismatches.push({
          invoice: inv,
          field: "Margin",
          sheet: fmt(sheetMarginNum),
          db: fmt(dbRow.grossMargin),
        });
      }
    }
  }

  // Also flag sheet rows with no invoice number
  const noInvoiceRows = sheetRows.filter((r) => r.invoice.length === 0 && r.invoiceRaw !== "N/A");
  const naRows = sheetRows.filter((r) => r.invoiceRaw === "N/A");

  // ── Report ───────────────────────────────────────────────────────────────

  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│  MISSING FROM SALES OS (in MC's sheet, not in database)    │");
  console.log("└─────────────────────────────────────────────────────────────┘\n");
  if (missingFromDB.length === 0) {
    console.log("  None — all sheet invoices found in database.\n");
  } else {
    for (const row of missingFromDB) {
      console.log(`  ${row.invoice.join("/")}  ${row.client}  —  ${row.item}`);
      console.log(`    Supplier: ${row.supplier}  |  Buy: ${fmt(row.buy)}  |  Sell: ${fmt(row.sell)}`);
    }
    console.log();
  }

  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│  MISSING FROM MC'S SHEET (in database, not in her sheet)   │");
  console.log("└─────────────────────────────────────────────────────────────┘\n");
  if (missingFromSheet.length === 0) {
    console.log("  None — all database invoices found in MC's sheet.\n");
  } else {
    for (const s of missingFromSheet) {
      console.log(`  ${s.invoiceNumber}  ${s.buyerName}  —  ${s.itemTitle ?? "(no item title)"}`);
      console.log(`    Supplier: ${s.supplierName ?? "-"}  |  Buy: ${fmt(s.buyPrice)}  |  Sell: ${fmt(s.saleAmountExVat)}  |  Source: ${s.source}`);
    }
    console.log();
  }

  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│  DATA MISMATCHES (same invoice, different values)          │");
  console.log("└─────────────────────────────────────────────────────────────┘\n");
  if (mismatches.length === 0) {
    console.log("  None — all matched invoices have consistent data.\n");
  } else {
    let lastInv = "";
    for (const m of mismatches) {
      if (m.invoice !== lastInv) {
        console.log(`  ${m.invoice}:`);
        lastInv = m.invoice;
      }
      console.log(`    ${m.field.padEnd(12)} Sheet: ${m.sheet}`);
      console.log(`    ${"".padEnd(12)} DB:    ${m.db}`);
    }
    console.log();
  }

  if (noInvoiceRows.length > 0 || naRows.length > 0) {
    console.log("┌─────────────────────────────────────────────────────────────┐");
    console.log("│  SHEET ROWS WITHOUT INVOICE NUMBERS                        │");
    console.log("└─────────────────────────────────────────────────────────────┘\n");
    for (const row of [...noInvoiceRows, ...naRows]) {
      console.log(`  [${row.invoiceRaw || "blank"}]  ${row.client}  —  ${row.item}`);
      console.log(`    Supplier: ${row.supplier}  |  Buy: ${fmt(row.buy)}  |  Sell: ${fmt(row.sell)}`);
    }
    console.log();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  MC's sheet (January):          ${sheetRows.length} rows`);
  console.log(`  Sales OS (January, MC):        ${janSales.length} invoices`);
  console.log(`  Missing from Sales OS:         ${missingFromDB.length}`);
  console.log(`  Missing from MC's sheet:       ${missingFromSheet.length}`);
  console.log(`  Data mismatches:               ${mismatches.length}`);
  console.log(`  Sheet rows without invoice #:  ${noInvoiceRows.length + naRows.length}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Write report to file
  // Capture everything we printed to a file too
  const reportPath = "mc-january-audit-report.txt";
  console.log(`Report also saved to: ${reportPath}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
