/**
 * Add Xero credit-note tracking columns to the sales table.
 *
 * - xero_amount_paid       NUMERIC(10,2) — Xero's AmountPaid
 * - xero_amount_due        NUMERIC(10,2) — Xero's AmountDue
 * - xero_amount_credited   NUMERIC(10,2) — Xero's AmountCredited
 *
 * Effective invoice value = AmountPaid + AmountDue (= Total − AmountCredited).
 * Status flips PAID → CREDITED when AmountCredited >= Total and AmountPaid +
 * AmountDue == 0. See lib/xero-invoice-mapping.ts for the full status logic.
 *
 * NUMERIC(10,2) is stricter than the surrounding `double precision` columns
 * by design — these are Xero's authoritative figures and the dashboard reads
 * them directly via effectiveInvoiceValue(). Drift here would be visible in
 * headline revenue. Existing float columns are flagged for the future
 * "integer pence end-to-end" workstream.
 *
 * Idempotent. Usage: npx tsx scripts/add-credit-note-columns.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[credit-note-columns] Adding columns...");
  await db.execute(sql`
    ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS xero_amount_paid     NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS xero_amount_due      NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS xero_amount_credited NUMERIC(10,2)
  `);

  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name IN ('xero_amount_paid', 'xero_amount_due', 'xero_amount_credited')
    ORDER BY column_name
  `);
  console.table(result);

  if ((result as unknown as unknown[]).length !== 3) {
    console.error("[credit-note-columns] FAIL — expected 3 columns");
    process.exit(1);
  }
  console.log("[credit-note-columns] Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[credit-note-columns] Error:", e.message);
  process.exit(1);
});
