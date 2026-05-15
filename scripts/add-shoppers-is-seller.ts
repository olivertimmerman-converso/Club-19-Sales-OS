/**
 * Brief 3 follow-up (May 2026): decouple "is a seller" from Clerk role.
 *
 * Adds `shoppers.is_seller` (boolean NOT NULL DEFAULT FALSE) and flips it
 * to true for the three current sellers (Hope, MC, Sophie). Atomic — one
 * transaction.
 *
 * IDs hard-coded from the pre-flight audit so the wrong shopper can't
 * silently get flagged. If any of the three rows doesn't update we abort
 * the whole transaction.
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS` and only updates rows currently
 * still set to false (so re-runs don't churn xata.updatedAt).
 *
 * Usage: npx tsx scripts/add-shoppers-is-seller.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SELLER_IDS = [
  "rec_d4u06nkgmio87vvfila0", // Hope Peverell
  "rec_d5dt9i185bnc3iimglfg", // Mary Clair (MC)
  "rec_d5f8ge185bnc3iimhhh0", // Sophie Timmerman
];

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  console.log("[is-seller] Starting atomic migration...");

  await db.transaction(async (tx) => {
    // 1. Add column
    await tx.execute(sql`
      ALTER TABLE shoppers
      ADD COLUMN IF NOT EXISTS is_seller boolean NOT NULL DEFAULT false
    `);
    console.log("[is-seller] (1/2) column ensured");

    // 2. Flip flag for the three sellers. Restrict to rows currently false
    // so a re-run is a no-op for already-flipped rows.
    // Note: not using `ANY($1::text[])` here — Drizzle expands array params
    // positionally, which Postgres treats as a tuple. Hard-coded IN list
    // sidesteps the issue and is safe because these IDs are constants.
    const updated = await tx.execute(sql`
      UPDATE shoppers
      SET is_seller = true
      WHERE id IN (
        ${SELLER_IDS[0]},
        ${SELLER_IDS[1]},
        ${SELLER_IDS[2]}
      )
        AND is_seller = false
      RETURNING id, name
    `);
    console.log("[is-seller] (2/2) flipped rows:");
    console.log(JSON.stringify(updated, null, 2));
  });

  // Verify final state
  const distribution = await db.execute(sql`
    SELECT name, is_seller, active
    FROM shoppers
    WHERE active = true
    ORDER BY is_seller DESC, name
  `);
  console.log("\n[is-seller] Final state:");
  console.table(distribution);

  const sellers = (distribution as unknown as { is_seller: boolean }[]).filter(
    (r) => r.is_seller
  );
  if (sellers.length !== 3) {
    console.error(`[is-seller] FAIL — expected 3 sellers, found ${sellers.length}`);
    process.exit(1);
  }
  console.log("[is-seller] PASS — 3 sellers flagged");
  process.exit(0);
}

main().catch((e) => {
  console.error("[is-seller] Error:", e.message);
  process.exit(1);
});
