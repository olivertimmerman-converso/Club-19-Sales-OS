/**
 * Backfill delivery_confirmed on historical completed + paid sales.
 *
 * Sets delivery_confirmed = true AND delivery_date = completed_at WHERE:
 *   - deleted_at IS NULL
 *   - completed_at IS NOT NULL
 *   - (xero_payment_date IS NOT NULL  OR  invoice_status = 'PAID')
 *
 * Idempotent — already-true rows are included in the UPDATE (no-op for them)
 * and the count reflects net changes.
 *
 * Usage: npx tsx scripts/backfill-delivery-confirmed.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  // =========================================================================
  // DRY RUN — report before touching anything
  // =========================================================================

  console.log("[backfill] Phase 1: Dry run\n");

  // 1. Sales that match the update criteria (completed + paid)
  const willUpdate = (await db.execute(sql`
    SELECT
      sh.name AS shopper_name,
      COUNT(*)::int AS count
    FROM sales s
    LEFT JOIN shoppers sh ON sh.id = s.shopper_id
    WHERE s.deleted_at IS NULL
      AND s.completed_at IS NOT NULL
      AND (s.xero_payment_date IS NOT NULL OR s.invoice_status = 'PAID')
    GROUP BY sh.name
    ORDER BY sh.name
  `)) as unknown as { shopper_name: string; count: number }[];

  const totalWillUpdate = willUpdate.reduce((s, r) => s + r.count, 0);

  console.log(`Sales matching update criteria (completed + paid): ${totalWillUpdate}`);
  console.table(willUpdate);

  // 2. Completed but NOT paid (will NOT be updated)
  const completedNotPaid = (await db.execute(sql`
    SELECT
      sh.name AS shopper_name,
      COUNT(*)::int AS count
    FROM sales s
    LEFT JOIN shoppers sh ON sh.id = s.shopper_id
    WHERE s.deleted_at IS NULL
      AND s.completed_at IS NOT NULL
      AND s.xero_payment_date IS NULL
      AND (s.invoice_status IS NULL OR s.invoice_status != 'PAID')
    GROUP BY sh.name
    ORDER BY sh.name
  `)) as unknown as { shopper_name: string; count: number }[];

  const totalNotUpdated = completedNotPaid.reduce((s, r) => s + r.count, 0);

  console.log(`\nCompleted but NOT paid (will NOT be updated): ${totalNotUpdated}`);
  console.table(completedNotPaid);

  // 3. Already delivery_confirmed = true (pre-existing)
  const alreadyConfirmed = (await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM sales
    WHERE deleted_at IS NULL
      AND delivery_confirmed = true
  `)) as unknown as { count: number }[];

  console.log(`\nAlready delivery_confirmed = true: ${alreadyConfirmed[0]?.count ?? 0}`);

  // =========================================================================
  // EXECUTE
  // =========================================================================

  console.log("\n[backfill] Phase 2: Executing update...\n");

  const result = await db.execute(sql`
    UPDATE sales
    SET
      delivery_confirmed = true,
      delivery_date = completed_at
    WHERE deleted_at IS NULL
      AND completed_at IS NOT NULL
      AND (xero_payment_date IS NOT NULL OR invoice_status = 'PAID')
  `);

  // postgres.js returns the rows affected in the count property
  const rowCount = (result as unknown as { count: number }).count ?? "unknown";
  console.log(`[backfill] Updated ${rowCount} rows.`);

  // =========================================================================
  // VERIFY
  // =========================================================================

  console.log("\n[backfill] Phase 3: Verification\n");

  const afterCount = (await db.execute(sql`
    SELECT
      sh.name AS shopper_name,
      COUNT(*)::int AS count
    FROM sales s
    LEFT JOIN shoppers sh ON sh.id = s.shopper_id
    WHERE s.deleted_at IS NULL
      AND s.delivery_confirmed = true
    GROUP BY sh.name
    ORDER BY sh.name
  `)) as unknown as { shopper_name: string; count: number }[];

  const totalAfter = afterCount.reduce((s, r) => s + r.count, 0);
  console.log(`Total delivery_confirmed = true after backfill: ${totalAfter}`);
  console.table(afterCount);

  console.log("\n[backfill] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill] Error:", e.message);
  process.exit(1);
});
