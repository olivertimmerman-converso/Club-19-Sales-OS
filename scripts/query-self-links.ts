import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sales } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");

  const invoiceNumbers = ["INV-3256", "INV-3294", "INV-3255"];
  
  const rows = await db
    .select({
      id: sales.id,
      xeroInvoiceId: sales.xeroInvoiceId,
      xeroInvoiceNumber: sales.xeroInvoiceNumber,
      linkedInvoices: sales.linkedInvoices,
      saleAmountIncVat: sales.saleAmountIncVat,
    })
    .from(sales)
    .where(inArray(sales.xeroInvoiceNumber, invoiceNumbers));

  for (const row of rows) {
    console.log("\n=== " + row.xeroInvoiceNumber + " ===");
    console.log("  DB ID:", row.id);
    console.log("  Xero Invoice ID:", row.xeroInvoiceId);
    console.log("  Amount:", row.saleAmountIncVat);
    const linked = (row.linkedInvoices as any[]) || [];
    console.log("  Linked invoices:", JSON.stringify(linked, null, 2));
    
    // Check for self-reference
    const selfRef = linked.find((inv: any) => inv.xero_invoice_id === row.xeroInvoiceId);
    if (selfRef) {
      console.log("  ** SELF-LINK DETECTED **");
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
