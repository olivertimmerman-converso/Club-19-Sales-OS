/**
 * Add Google Sheets row tracking columns to sales table.
 *
 * Adds two columns:
 *   - sheets_row_number integer   — first row in the month tab for this sale
 *   - sheets_tab_name   text      — e.g. "April 2026"
 *
 * Enables in-place updates of the existing sheet row when atelier sales
 * have their actual costs updated post-creation.
 *
 * Idempotent. Usage: npx tsx scripts/add-sheet-tracking-columns.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[sheet-tracking] Adding sheets_row_number and sheets_tab_name to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sheets_row_number integer`
  );
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sheets_tab_name text`
  );

  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name IN ('sheets_row_number', 'sheets_tab_name')
    ORDER BY column_name
  `);
  console.table(result);

  if ((result as unknown as unknown[]).length !== 2) {
    console.error("[sheet-tracking] FAIL — expected 2 rows");
    process.exit(1);
  }

  console.log("[sheet-tracking] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[sheet-tracking] Error:", e.message);
  process.exit(1);
});
