import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { suppliers, sales } = await import("@/db/schema");
  const { sql, isNull, isNotNull } = await import("drizzle-orm");

  const allSuppliers = await db.select({ id: suppliers.id, name: suppliers.name, pending: suppliers.pendingApproval }).from(suppliers).orderBy(suppliers.name);
  console.log(`Total supplier records: ${allSuppliers.length}\n`);
  console.log("All suppliers:");
  allSuppliers.forEach(s => console.log(`  [${s.pending ? "PENDING" : "active "}] ${s.name}`));

  const withSupplier = await db.select({ count: sql`count(*)` }).from(sales).where(isNotNull(sales.supplierId));
  const withoutSupplier = await db.select({ count: sql`count(*)` }).from(sales).where(isNull(sales.supplierId));
  console.log(`\nSales with linked supplier: ${withSupplier[0].count}`);
  console.log(`Sales without linked supplier: ${withoutSupplier[0].count}`);

  const perSupplier = await db.select({
    supplierName: suppliers.name,
    count: sql<number>`count(${sales.id})`
  }).from(suppliers).leftJoin(sales, sql`${sales.supplierId} = ${suppliers.id}`).groupBy(suppliers.id, suppliers.name).orderBy(sql`count(${sales.id}) desc`);
  console.log("\nSales per supplier:");
  perSupplier.forEach(r => console.log(`  ${r.supplierName}: ${r.count}`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
