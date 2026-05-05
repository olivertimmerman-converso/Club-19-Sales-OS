/**
 * Add introducer_fee_type column to sales table.
 *
 * The wizard now lets shoppers choose between a % of gross profit or a flat £
 * amount when an introducer is involved. This column records which input was
 * used so the OS can distinguish between the two ("percent" | "flat"). For
 * flat-fee sales, introducer_commission is the user-entered £ directly and
 * introducer_fee_percent is left null.
 *
 * Idempotent. Usage: npx tsx scripts/add-introducer-fee-type.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[introducer-fee-type] Adding introducer_fee_type to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS introducer_fee_type text`
  );

  // Backfill existing rows with a non-null fee_percent so historical sales are
  // unambiguously tagged as "percent" (the only mode the wizard supported pre-
  // May 2026). Rows without an introducer fee are left NULL.
  const backfill = await db.execute(sql`
    UPDATE sales
    SET introducer_fee_type = 'percent'
    WHERE introducer_fee_type IS NULL
      AND introducer_fee_percent IS NOT NULL
      AND introducer_fee_percent > 0
  `);
  console.log("[introducer-fee-type] Backfilled rows:", backfill);

  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'introducer_fee_type'
  `);
  console.table(result);

  if ((result as unknown as unknown[]).length !== 1) {
    console.error("[introducer-fee-type] FAIL");
    process.exit(1);
  }

  console.log("[introducer-fee-type] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[introducer-fee-type] Error:", e.message);
  process.exit(1);
});
