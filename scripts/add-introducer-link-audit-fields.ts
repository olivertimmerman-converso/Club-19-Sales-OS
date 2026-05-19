/**
 * Phase B introducer auto-link audit extension (May 2026).
 *
 * Extends `introducer_commission_edits` to log link-change events alongside
 * the existing fee-change rows:
 *   - `event_type` text: 'fee_change' (legacy/default for £-edit rows),
 *     'auto_link' (wizard auto-linked at sale creation),
 *     'manual_link' (operator attached/swapped a curated record via the
 *     sale detail page), 'unlink' (operator cleared the FK).
 *   - `linked_introducer_id` text: the resolved curated introducer ID for
 *     link-event rows. Null for fee-change rows.
 *
 * Idempotent. Usage: npx tsx scripts/add-introducer-link-audit-fields.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[introducer-link-audit] Running migration...");

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      ALTER TABLE introducer_commission_edits
      ADD COLUMN IF NOT EXISTS event_type text
    `);
    await tx.execute(sql`
      ALTER TABLE introducer_commission_edits
      ADD COLUMN IF NOT EXISTS linked_introducer_id text
    `);
    console.log("[introducer-link-audit] columns ensured");

    // Backfill: every existing row is a fee_change row (previous behaviour).
    const back = await tx.execute(sql`
      UPDATE introducer_commission_edits
      SET event_type = 'fee_change'
      WHERE event_type IS NULL
    `);
    console.log("[introducer-link-audit] backfilled rows:", back);
  });

  // Verify
  const cols = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'introducer_commission_edits'
    ORDER BY ordinal_position
  `);
  console.log("[introducer-link-audit] Audit table shape:");
  console.table(cols);

  const counts = await db.execute(sql`
    SELECT event_type, COUNT(*) AS n
    FROM introducer_commission_edits
    GROUP BY event_type
  `);
  console.log("[introducer-link-audit] Event-type distribution:");
  console.table(counts);

  console.log("[introducer-link-audit] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[introducer-link-audit] Error:", e.message);
  process.exit(1);
});
