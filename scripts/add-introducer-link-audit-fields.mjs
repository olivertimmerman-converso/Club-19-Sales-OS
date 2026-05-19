/**
 * Phase B introducer auto-link audit extension (May 2026).
 *
 * Adds `event_type` text + `linked_introducer_id` text to
 * `introducer_commission_edits`. Backfills existing rows to 'fee_change'
 * (their semantics under the prior single-purpose schema). Idempotent.
 *
 * Usage: node --env-file=.env.local scripts/add-introducer-link-audit-fields.mjs
 */
import postgres from 'postgres';

const url = process.env.XATA_POSTGRES_URL;
if (!url) { console.error('Missing XATA_POSTGRES_URL'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

try {
  console.log('[introducer-link-audit] Running migration...');

  await sql.begin(async (tx) => {
    await tx`ALTER TABLE introducer_commission_edits ADD COLUMN IF NOT EXISTS event_type text`;
    await tx`ALTER TABLE introducer_commission_edits ADD COLUMN IF NOT EXISTS linked_introducer_id text`;
    console.log('[introducer-link-audit] columns ensured');

    const back = await tx`
      UPDATE introducer_commission_edits
      SET event_type = 'fee_change'
      WHERE event_type IS NULL
    `;
    console.log('[introducer-link-audit] backfilled rows:', back.count);
  });

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'introducer_commission_edits'
    ORDER BY ordinal_position
  `;
  console.log('[introducer-link-audit] Audit table shape:');
  console.table(cols);

  const counts = await sql`
    SELECT event_type, COUNT(*)::int AS n
    FROM introducer_commission_edits
    GROUP BY event_type
  `;
  console.log('[introducer-link-audit] Event-type distribution:');
  console.table(counts);

  console.log('[introducer-link-audit] Done.');
} catch (e) {
  console.error('[introducer-link-audit] Error:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
