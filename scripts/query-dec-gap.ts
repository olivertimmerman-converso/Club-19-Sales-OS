import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sales } = await import("@/db/schema");
  const { gte, lte, and, sql } = await import("drizzle-orm");

  const start = new Date(2025, 11, 1, 0, 0, 0, 0);
  const end = new Date(2025, 11, 31, 23, 59, 59, 999);

  const rows = await db
    .select({
      source: sales.source,
      invoiceStatus: sales.invoiceStatus,
      deletedAt: sales.deletedAt,
      dismissed: sales.dismissed,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(gte(sales.saleDate, start), lte(sales.saleDate, end)))
    .groupBy(sales.source, sales.invoiceStatus, sales.deletedAt, sales.dismissed);

  console.log("=== December 2025 sales breakdown ===");
  let total = 0;
  for (const r of rows) {
    console.log(`  source=${r.source} | status=${r.invoiceStatus} | deleted=${r.deletedAt ? 'YES' : 'no'} | dismissed=${r.dismissed} | count=${r.count}`);
    total += r.count;
  }
  console.log("Total Dec 2025 records:", total);

  // Also show what would pass the sales page filter
  const visible = rows.filter(r => r.source !== 'xero_import' && !r.deletedAt && r.invoiceStatus !== 'VOIDED');
  const visibleCount = visible.reduce((sum, r) => sum + r.count, 0);
  console.log("\nVisible on sales page (after filters):", visibleCount);
  for (const r of visible) {
    console.log(`  source=${r.source} | status=${r.invoiceStatus} | dismissed=${r.dismissed} | count=${r.count}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
