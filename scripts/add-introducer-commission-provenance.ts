/**
 * Brief 2 (May 2026): Introducer Commission Provenance + Audit.
 *
 * Atomic migration:
 *   1. Add `sales.introducer_commission_at_sale` (write-once snapshot of the
 *      fee originally set at sale creation).
 *   2. Create `introducer_commission_edits` audit table (one row per change
 *      made via the Save Introducer handler).
 *   3. Backfill `introducer_commission_at_sale = introducer_commission` for
 *      every existing sale that has a non-null fee and a null snapshot.
 *
 * All three run inside a single transaction so the column, the table and
 * the backfill ship together — partial state is impossible.
 *
 * The backfill anchors existing rows to "matches current" (panel collapses).
 * For INV-3471 specifically, Oliver will run the Save Introducer flow AFTER
 * this script (£725 → £595), so the audit log captures the genuine transition
 * and `_at_sale` stays at £725 (Hope's original entry, even though wrong).
 *
 * Idempotent. Usage: npx tsx scripts/add-introducer-commission-provenance.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[introducer-provenance] Running atomic migration...");

  await db.transaction(async (tx) => {
    // 1. Column
    await tx.execute(sql`
      ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS introducer_commission_at_sale double precision
    `);
    console.log("[introducer-provenance] (1/3) column ensured");

    // 2. Audit table. `id` and `sale_id` are `text` to match the Xata-managed
    // convention used across the rest of the schema (sales.id is text-typed
    // with a `'rec_' || xata_private.xid()` default). FK constraints reject
    // a uuid sale_id column against a text sales.id column.
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS introducer_commission_edits (
        id text PRIMARY KEY DEFAULT ('rec_'::text || (xata_private.xid())::text),
        sale_id text NOT NULL REFERENCES sales(id),
        previous_value double precision,
        new_value double precision,
        edited_by text NOT NULL,
        edited_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS introducer_commission_edits_sale_id_idx
      ON introducer_commission_edits(sale_id)
    `);
    await tx.execute(sql`
      CREATE INDEX IF NOT EXISTS introducer_commission_edits_edited_at_idx
      ON introducer_commission_edits(edited_at)
    `);
    console.log("[introducer-provenance] (2/3) audit table + indexes ensured");

    // 3. Backfill
    const backfill = await tx.execute(sql`
      UPDATE sales
      SET introducer_commission_at_sale = introducer_commission
      WHERE introducer_commission IS NOT NULL
        AND introducer_commission_at_sale IS NULL
    `);
    console.log("[introducer-provenance] (3/3) backfill rows:", backfill);
  });

  // Verify shape
  const col = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'introducer_commission_at_sale'
  `);
  const tbl = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'introducer_commission_edits'
    ORDER BY ordinal_position
  `);
  console.log("[introducer-provenance] Column:");
  console.table(col);
  console.log("[introducer-provenance] Audit table:");
  console.table(tbl);

  // Quick sanity counts
  const counts = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE introducer_commission IS NOT NULL)
        AS sales_with_fee,
      COUNT(*) FILTER (WHERE introducer_commission_at_sale IS NOT NULL)
        AS sales_with_snapshot,
      COUNT(*) FILTER (
        WHERE introducer_commission IS NOT NULL
          AND introducer_commission_at_sale IS NULL
      ) AS unbackfilled
    FROM sales
  `);
  console.log("[introducer-provenance] Sanity counts:");
  console.table(counts);

  console.log("[introducer-provenance] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[introducer-provenance] Error:", e.message);
  process.exit(1);
});
