/**
 * One-off merge: legacy "Mary Clair" → canonical "Mary Clair Bromfield".
 *
 * Background: MC's Clerk profile shows fullName="Mary Clair", so the wizard's
 * old `getOrCreateShopperByName` lookup kept attaching new sales to a stale,
 * inactive duplicate row that had no clerkUserId. This blocked the
 * Approve & Download flow because the route's owner check requires a
 * clerkUserId match. Discovered via INV-3505 (2026-04-29).
 *
 * The lookup itself has been hardened in lib/xata-sales.ts to prefer
 * clerkUserId, so this script just drains the stranded sales/buyers off the
 * legacy row and removes it.
 *
 * Usage:
 *   npx tsx scripts/merge-mary-clair-2026-04.ts            # Dry run
 *   npx tsx scripts/merge-mary-clair-2026-04.ts --execute  # Apply
 */

import { db } from "../db";
import { shoppers, sales, buyers } from "../db/schema";
import { eq } from "drizzle-orm";

const LEGACY_NAME = "Mary Clair";
const CANONICAL_NAME = "Mary Clair Bromfield";

async function main() {
  const isApply = process.argv.includes("--execute");
  console.log(`\n=== Merge "${LEGACY_NAME}" → "${CANONICAL_NAME}" ===`);
  console.log(`Mode: ${isApply ? "APPLY" : "DRY RUN"}\n`);

  const legacyRows = await db
    .select()
    .from(shoppers)
    .where(eq(shoppers.name, LEGACY_NAME));

  const canonicalRows = await db
    .select()
    .from(shoppers)
    .where(eq(shoppers.name, CANONICAL_NAME));

  if (canonicalRows.length !== 1) {
    console.error(
      `Expected exactly one canonical row named "${CANONICAL_NAME}", found ${canonicalRows.length}. Aborting.`
    );
    process.exit(1);
  }
  const canonical = canonicalRows[0];

  if (!canonical.clerkUserId) {
    console.error(
      `Canonical row "${CANONICAL_NAME}" (${canonical.id}) has no clerkUserId set. Refusing to merge into a row that won't satisfy the owner check.`
    );
    process.exit(1);
  }

  if (legacyRows.length === 0) {
    console.log("No legacy rows found — already clean.\n");
    process.exit(0);
  }

  console.log(`Canonical: ${canonical.id} (clerkUserId=${canonical.clerkUserId}, active=${canonical.active})`);
  console.log(`Legacy rows to merge: ${legacyRows.length}\n`);

  for (const legacy of legacyRows) {
    if (legacy.id === canonical.id) continue;

    const salesByShopper = await db.select({ id: sales.id }).from(sales).where(eq(sales.shopperId, legacy.id));
    const salesByOwner = await db.select({ id: sales.id }).from(sales).where(eq(sales.ownerId, legacy.id));
    const buyersOwned = await db.select({ id: buyers.id }).from(buyers).where(eq(buyers.ownerId, legacy.id));

    console.log(
      `Legacy ${legacy.id} (active=${legacy.active}, clerkUserId=${legacy.clerkUserId ?? "(none)"})\n` +
      `  sales.shopperId references: ${salesByShopper.length}\n` +
      `  sales.ownerId references:   ${salesByOwner.length}\n` +
      `  buyers.ownerId references:  ${buyersOwned.length}`
    );

    if (!isApply) continue;

    if (salesByShopper.length > 0) {
      await db.update(sales).set({ shopperId: canonical.id }).where(eq(sales.shopperId, legacy.id));
      console.log(`  ✓ Reassigned ${salesByShopper.length} sales.shopperId`);
    }
    if (salesByOwner.length > 0) {
      await db.update(sales).set({ ownerId: canonical.id }).where(eq(sales.ownerId, legacy.id));
      console.log(`  ✓ Reassigned ${salesByOwner.length} sales.ownerId`);
    }
    if (buyersOwned.length > 0) {
      await db.update(buyers).set({ ownerId: canonical.id }).where(eq(buyers.ownerId, legacy.id));
      console.log(`  ✓ Reassigned ${buyersOwned.length} buyers.ownerId`);
    }

    await db.delete(shoppers).where(eq(shoppers.id, legacy.id));
    console.log(`  ✓ Deleted legacy shopper ${legacy.id}\n`);
  }

  if (!isApply) {
    console.log("\nDry run complete. Re-run with --execute to apply.");
  } else {
    const finalCount = await db.select({ id: sales.id }).from(sales).where(eq(sales.shopperId, canonical.id));
    console.log(`\nDone. Canonical "${CANONICAL_NAME}" now has ${finalCount.length} sales.shopperId references.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
