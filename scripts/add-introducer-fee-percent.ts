/**
 * Add introducer_fee_percent column to sales table.
 *
 * Wizard captures introducer fee as a percentage of gross profit.
 * The existing introducer_commission column stores the calculated £ amount
 * and remains the source of truth for sheets + commission engine.
 *
 * Idempotent. Usage: npx tsx scripts/add-introducer-fee-percent.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[introducer-percent] Adding introducer_fee_percent to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS introducer_fee_percent double precision`
  );

  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'introducer_fee_percent'
  `);
  console.table(result);

  if ((result as unknown as unknown[]).length !== 1) {
    console.error("[introducer-percent] FAIL");
    process.exit(1);
  }

  console.log("[introducer-percent] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[introducer-percent] Error:", e.message);
  process.exit(1);
});
