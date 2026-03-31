import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

import fs from "fs";

async function main() {
  const { db } = await import("@/db");
  const { suppliers, sales } = await import("@/db/schema");
  const { sql, isNull, isNotNull, eq, desc, max, count } = await import("drizzle-orm");

  // Query all suppliers with linked sales count and last used date
  const rows = await db
    .select({
      name: suppliers.name,
      pendingApproval: suppliers.pendingApproval,
      createdAt: suppliers.createdAt,
      // No deletedAt on suppliers table, so status is active vs pending
      linkedSalesCount: count(sales.id),
      lastUsed: max(sales.saleDate),
    })
    .from(suppliers)
    .leftJoin(sales, sql`${sales.supplierId} = ${suppliers.id} AND ${sales.deletedAt} IS NULL`)
    .groupBy(suppliers.id, suppliers.name, suppliers.pendingApproval, suppliers.createdAt)
    .orderBy(sql`LOWER(${suppliers.name})`);

  // Build CSV
  const csvLines: string[] = [];
  csvLines.push("Supplier Name,Status,Linked Sales Count,Date Created,Last Used");

  for (const row of rows) {
    const status = row.pendingApproval ? "pending approval" : "active";
    const name = (row.name ?? "").replace(/"/g, '""');
    const created = row.createdAt ? row.createdAt.toISOString().split("T")[0] : "";
    const lastUsed = row.lastUsed ? row.lastUsed.toISOString().split("T")[0] : "";

    csvLines.push(`"${name}",${status},${row.linkedSalesCount},${created},${lastUsed}`);
  }

  const csv = csvLines.join("\n") + "\n";
  const outPath = "supplier-export.csv";
  fs.writeFileSync(outPath, csv);

  console.log(`Exported ${rows.length} suppliers to ${outPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
