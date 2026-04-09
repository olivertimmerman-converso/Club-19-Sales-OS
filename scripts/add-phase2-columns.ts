/**
 * Phase 2 Workstream 1 — Add wizard restructure columns to sales table.
 *
 * Adds three additive columns:
 *   - introducer_name   text                — free-text introducer name from wizard
 *   - is_new_client     boolean DEFAULT false — first delivered sale for this buyer
 *   - entrupy_fee       double precision    — optional ancillary cost
 *
 * Idempotent (uses IF NOT EXISTS). Safe to re-run.
 *
 * Usage: npx tsx scripts/add-phase2-columns.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[phase2] Adding introducer_name to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS introducer_name text`
  );

  console.log("[phase2] Adding is_new_client to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_new_client boolean DEFAULT false`
  );

  console.log("[phase2] Adding entrupy_fee to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS entrupy_fee double precision`
  );

  console.log("[phase2] Verifying via information_schema...");
  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name IN ('introducer_name', 'is_new_client', 'entrupy_fee')
    ORDER BY column_name
  `);
  console.log("[phase2] Found columns:");
  console.table(result);

  if ((result as unknown as unknown[]).length !== 3) {
    console.error("[phase2] FAIL — expected 3 rows, got", (result as unknown as unknown[]).length);
    process.exit(1);
  }

  console.log("[phase2] All three columns present. Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[phase2] Error:", e.message);
  process.exit(1);
});
