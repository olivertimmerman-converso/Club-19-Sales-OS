/**
 * Phase 2 Workstream 3 — Add logistics & delivery columns to sales table.
 *
 * Adds seven additive columns:
 *   - dhl_cost              double precision — actual DHL/shipping cost
 *   - addison_lee_cost      double precision — Addison Lee transport cost
 *   - taxi_cost             double precision — taxi cost
 *   - hand_delivery_cost    double precision — hand delivery cost
 *   - other_logistics_cost  double precision — catch-all logistics cost
 *   - delivery_confirmed    boolean DEFAULT false — gates commission eligibility
 *   - delivery_date         timestamptz — when delivery was confirmed
 *
 * Idempotent (uses IF NOT EXISTS). Safe to re-run.
 *
 * Usage: npx tsx scripts/add-ws3-columns.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const COLUMNS = [
  "dhl_cost",
  "addison_lee_cost",
  "taxi_cost",
  "hand_delivery_cost",
  "other_logistics_cost",
  "delivery_confirmed",
  "delivery_date",
] as const;

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[ws3] Adding logistics cost columns to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS dhl_cost double precision`
  );
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS addison_lee_cost double precision`
  );
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS taxi_cost double precision`
  );
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS hand_delivery_cost double precision`
  );
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS other_logistics_cost double precision`
  );

  console.log("[ws3] Adding delivery tracking columns to sales...");
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_confirmed boolean DEFAULT false`
  );
  await db.execute(
    sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_date timestamp with time zone`
  );

  console.log("[ws3] Verifying via information_schema...");
  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name IN (${sql.join(
        COLUMNS.map((c) => sql`${c}`),
        sql`, `
      )})
    ORDER BY column_name
  `);
  console.log("[ws3] Found columns:");
  console.table(result);

  if ((result as unknown as unknown[]).length !== COLUMNS.length) {
    console.error(
      "[ws3] FAIL — expected",
      COLUMNS.length,
      "rows, got",
      (result as unknown as unknown[]).length
    );
    process.exit(1);
  }

  console.log("[ws3] All seven columns present. Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[ws3] Error:", e.message);
  process.exit(1);
});
