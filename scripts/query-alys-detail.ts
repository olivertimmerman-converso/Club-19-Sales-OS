import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sales, buyers, shoppers } = await import("@/db/schema");
  const { inArray, eq } = await import("drizzle-orm");

  const invoiceNumbers = ["INV-3256", "INV-3278", "INV-3294", "INV-3211", "INV-3255", "INV-3324"];
  
  const rows = await db
    .select({
      id: sales.id,
      xeroInvoiceNumber: sales.xeroInvoiceNumber,
      xeroInvoiceId: sales.xeroInvoiceId,
      saleAmountIncVat: sales.saleAmountIncVat,
      source: sales.source,
      buyerId: sales.buyerId,
      shopperId: sales.shopperId,
      saleDate: sales.saleDate,
      itemTitle: sales.itemTitle,
    })
    .from(sales)
    .where(inArray(sales.xeroInvoiceNumber, invoiceNumbers));

  // Get buyer & shopper names
  const buyerIds = [...new Set(rows.map(r => r.buyerId).filter(Boolean))] as string[];
  const shopperIds = [...new Set(rows.map(r => r.shopperId).filter(Boolean))] as string[];
  
  const buyerRows = buyerIds.length > 0 ? await db.select({ id: buyers.id, name: buyers.name }).from(buyers).where(inArray(buyers.id, buyerIds)) : [];
  const shopperRows = shopperIds.length > 0 ? await db.select({ id: shoppers.id, name: shoppers.name }).from(shoppers).where(inArray(shoppers.id, shopperIds)) : [];
  
  const buyerMap = Object.fromEntries(buyerRows.map(b => [b.id, b.name]));
  const shopperMap = Object.fromEntries(shopperRows.map(s => [s.id, s.name]));

  console.log("=== GROUP A: INV-3256, INV-3278, INV-3294 ===");
  for (const inv of ["INV-3256", "INV-3278", "INV-3294"]) {
    const r = rows.find(row => row.xeroInvoiceNumber === inv);
    if (r) console.log(`  ${inv}: £${r.saleAmountIncVat} | ${r.saleDate?.toISOString().slice(0,10)} | buyer: ${buyerMap[r.buyerId || ''] || 'unknown'} | shopper: ${shopperMap[r.shopperId || ''] || 'unknown'} | ${r.itemTitle}`);
  }
  
  console.log("\n=== GROUP B: INV-3211, INV-3255, INV-3324 ===");
  for (const inv of ["INV-3211", "INV-3255", "INV-3324"]) {
    const r = rows.find(row => row.xeroInvoiceNumber === inv);
    if (r) console.log(`  ${inv}: £${r.saleAmountIncVat} | ${r.saleDate?.toISOString().slice(0,10)} | buyer: ${buyerMap[r.buyerId || ''] || 'unknown'} | shopper: ${shopperMap[r.shopperId || ''] || 'unknown'} | ${r.itemTitle}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
