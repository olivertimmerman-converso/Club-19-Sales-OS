/**
 * Consolidate Alys to a single profile across Clerk + DB.
 *
 * Two issues to fix:
 *   1. shoppers.clerk_user_id has a typo'd Clerk ID (case + 0/O confusion)
 *      that doesn't resolve to any Clerk user. Repointing to the active
 *      Clerk user makes permission checks succeed directly instead of
 *      falling through to the name fallback.
 *   2. Two Alys McMahon users exist in Clerk:
 *        - user_36cDXaPklE4boUh3wq42egO5kfJ — alys@sketch24ltd.com
 *          (active, last sign-in 2026-04-27, password set)
 *        - user_36cB6yZQFv4SlnsTpmerQgglIpv — alysmcmahon@googlemail.com
 *          (Google OAuth, last sign-in = createdAt, never used since)
 *      The Gmail user has zero DB references and zero login activity, so
 *      deleting it doesn't break anything.
 *
 * Pre-flight asserts both expectations before writing.
 *
 * Usage:
 *   npx tsx scripts/consolidate_alys.ts            # Dry run
 *   npx tsx scripts/consolidate_alys.ts --execute  # Apply
 */

import { createClerkClient } from "@clerk/backend";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { db } from "../db";
import { shoppers } from "../db/schema";
import { eq } from "drizzle-orm";

const CORRUPTED_DB_ID = "user_36cDXApKlE4boUh3wq42eg05kfJ";
const CANONICAL_CLERK_ID = "user_36cDXaPklE4boUh3wq42egO5kfJ";
const DUPLICATE_CLERK_ID = "user_36cB6yZQFv4SlnsTpmerQgglIpv";

async function main() {
  const apply = process.argv.includes("--execute");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  // Pre-flight 1: canonical Clerk user exists and is the work-email Alys.
  const canonical = await clerk.users.getUser(CANONICAL_CLERK_ID);
  if (canonical.fullName !== "Alys McMahon") {
    throw new Error(`Canonical Clerk user is not Alys McMahon: ${canonical.fullName}`);
  }
  console.log(`✓ Canonical Clerk: ${canonical.fullName} <${canonical.primaryEmailAddress?.emailAddress}>`);

  // Pre-flight 2: duplicate Clerk user exists, has never signed in beyond
  // creation, and has zero DB references (confirmed separately by
  // check_alys_db_refs.ts before running this script).
  let duplicate;
  try {
    duplicate = await clerk.users.getUser(DUPLICATE_CLERK_ID);
  } catch {
    duplicate = null;
  }
  if (duplicate) {
    const created = duplicate.createdAt ? new Date(duplicate.createdAt).getTime() : 0;
    const lastSignIn = duplicate.lastSignInAt ? new Date(duplicate.lastSignInAt).getTime() : 0;
    const everSignedInSinceCreation = lastSignIn > created + 60_000;
    console.log(
      `✓ Duplicate Clerk: ${duplicate.fullName} <${duplicate.primaryEmailAddress?.emailAddress}>` +
        (everSignedInSinceCreation ? " — WARNING: has signed in since creation" : " — never used")
    );
    if (everSignedInSinceCreation) {
      throw new Error("Duplicate Clerk user has been used since creation. Refusing to delete without manual review.");
    }
  } else {
    console.log("✓ Duplicate Clerk: already gone");
  }

  // Pre-flight 3: exactly one DB shoppers row points at the corrupted id,
  // and no row already points at the canonical id.
  const corruptedRows = await db.select().from(shoppers).where(eq(shoppers.clerkUserId, CORRUPTED_DB_ID));
  const canonicalRows = await db.select().from(shoppers).where(eq(shoppers.clerkUserId, CANONICAL_CLERK_ID));

  if (corruptedRows.length > 1) {
    throw new Error(`Expected at most 1 row with corrupted id, found ${corruptedRows.length}`);
  }
  if (canonicalRows.length > 0 && corruptedRows.length > 0 && canonicalRows[0].id !== corruptedRows[0].id) {
    throw new Error(`Another shopper row already uses the canonical Clerk id — manual review needed.`);
  }
  console.log(
    `✓ DB rows: corrupted=${corruptedRows.length}, canonical=${canonicalRows.length}`
  );

  console.log("\n--- Plan ---");
  if (corruptedRows.length === 1) {
    console.log(`  UPDATE shoppers SET clerk_user_id = '${CANONICAL_CLERK_ID}' WHERE id = '${corruptedRows[0].id}'`);
  } else {
    console.log(`  (no DB update needed — already pointing at canonical id)`);
  }
  if (duplicate) {
    console.log(`  DELETE Clerk user ${DUPLICATE_CLERK_ID} (alysmcmahon@googlemail.com)`);
  } else {
    console.log(`  (no Clerk delete needed — duplicate already gone)`);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --execute to apply.");
    process.exit(0);
  }

  console.log("\n--- Applying ---");

  if (corruptedRows.length === 1) {
    await db
      .update(shoppers)
      .set({ clerkUserId: CANONICAL_CLERK_ID })
      .where(eq(shoppers.id, corruptedRows[0].id));
    console.log(`✓ DB updated`);
  }

  if (duplicate) {
    await clerk.users.deleteUser(DUPLICATE_CLERK_ID);
    console.log(`✓ Clerk user deleted`);
  }

  // Verify
  const after = await db.select().from(shoppers).where(eq(shoppers.clerkUserId, CANONICAL_CLERK_ID));
  console.log(`\nFinal: ${after.length} shoppers row(s) point at canonical Clerk user.`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
