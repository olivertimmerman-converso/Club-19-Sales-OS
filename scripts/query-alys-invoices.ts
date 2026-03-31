import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sales } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");

  const invoiceNumbers = ["INV-3256", "INV-3278", "INV-3294", "INV-3211", "INV-3255", "INV-3324"];
  
  const rows = await db
    .select()
    .from(sales)
    .where(inArray(sales.xeroInvoiceNumber, invoiceNumbers));

  console.log("Found " + rows.length + " of " + invoiceNumbers.length + " invoices:\n");
  
  for (const inv of invoiceNumbers) {
    const row = rows.find(r => r.xeroInvoiceNumber === inv);
    if (row) {
      const linked = Array.isArray(row.linkedInvoices) ? row.linkedInvoices : [];
      console.log(inv + ": £" + row.saleAmountIncVat + " | source: " + row.source + " | status: " + row.invoiceStatus + " | deleted: " + (row.deletedAt ? "YES" : "no") + " | buyer: " + row.buyerName + " | linked: " + linked.length + " | needsAlloc: " + row.needsAllocation);
    } else {
      console.log(inv + ": NOT IN DATABASE");
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
