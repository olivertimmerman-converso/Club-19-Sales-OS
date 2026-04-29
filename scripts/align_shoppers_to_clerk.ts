/**
 * Align each shopper row to its Clerk profile.
 *
 * Source of truth: Clerk (authentication identity). For every shopper row
 * that has a clerkUserId set, copy `fullName` → `shoppers.name` and primary
 * email → `shoppers.email`. Logs a diff before writing.
 *
 * Idempotent and safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/align_shoppers_to_clerk.ts            # Dry run
 *   npx tsx scripts/align_shoppers_to_clerk.ts --execute  # Apply
 */

import { createClerkClient } from "@clerk/backend";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { db } from "../db";
import { shoppers } from "../db/schema";
import { isNotNull, eq } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--execute");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY missing");
    process.exit(1);
  }
  const clerk = createClerkClient({ secretKey });

  const rows = await db
    .select({
      id: shoppers.id,
      name: shoppers.name,
      email: shoppers.email,
      clerkUserId: shoppers.clerkUserId,
    })
    .from(shoppers)
    .where(isNotNull(shoppers.clerkUserId));

  let changes = 0;

  for (const r of rows) {
    if (!r.clerkUserId) continue;
    let user;
    try {
      user = await clerk.users.getUser(r.clerkUserId);
    } catch (err) {
      console.warn(
        `! Skipping ${r.name} — Clerk user ${r.clerkUserId} not retrievable: ${(err as Error).message}`
      );
      continue;
    }

    const clerkName = user.fullName ?? "";
    const clerkEmail = user.primaryEmailAddress?.emailAddress ?? "";

    const nameDrift = clerkName && clerkName !== r.name;
    const emailDrift = clerkEmail && clerkEmail !== r.email;

    if (!nameDrift && !emailDrift) {
      console.log(`✓ ${r.name} — in sync`);
      continue;
    }

    changes++;
    console.log(
      `\n→ ${r.name} (${r.id})\n` +
        (nameDrift ? `   name:  "${r.name}" → "${clerkName}"\n` : "") +
        (emailDrift ? `   email: "${r.email}" → "${clerkEmail}"\n` : "")
    );

    if (!apply) continue;

    await db
      .update(shoppers)
      .set({
        ...(nameDrift ? { name: clerkName } : {}),
        ...(emailDrift ? { email: clerkEmail } : {}),
      })
      .where(eq(shoppers.id, r.id));
    console.log(`   ✓ updated`);
  }

  console.log(`\n${changes === 0 ? "All rows in sync." : `${changes} row(s) ${apply ? "updated" : "would change"}.`}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
