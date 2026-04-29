/**
 * Standing audit — run any time to verify shopper rows and Clerk users are
 * in lockstep. Read-only. Exit code is non-zero when any issue is found, so
 * this can be wired into CI or scheduled as a healthcheck.
 *
 * Checks:
 *   1. Every shopper row's clerkUserId resolves to a real Clerk user, with
 *      matching fullName + primary email.
 *   2. No duplicate clerkUserIds in shoppers (also enforced by the unique
 *      index on shoppers.clerk_user_id, but a defensive double-check).
 *   3. No duplicate Clerk users by primary email.
 *   4. No duplicate Clerk users sharing a fullName + staffRole.
 */

import { createClerkClient } from "@clerk/backend";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { db } from "../db";
import { shoppers } from "../db/schema";
import { isNotNull } from "drizzle-orm";

async function main() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  let issues = 0;

  // 1. Every shopper.clerkUserId resolves & names match
  console.log("=== Shopper ↔ Clerk linkage ===");
  const rows = await db.select().from(shoppers).where(isNotNull(shoppers.clerkUserId));
  for (const r of rows) {
    try {
      const u = await clerk.users.getUser(r.clerkUserId!);
      const nameMatch = u.fullName === r.name;
      const emailMatch = u.primaryEmailAddress?.emailAddress === r.email;
      const status = nameMatch && emailMatch ? "✓" : "✗";
      if (!nameMatch || !emailMatch) issues++;
      console.log(
        `${status} ${r.name}` +
          (nameMatch ? "" : ` — name drift (Clerk: ${u.fullName})`) +
          (emailMatch ? "" : ` — email drift (Clerk: ${u.primaryEmailAddress?.emailAddress})`)
      );
    } catch {
      issues++;
      console.log(`✗ ${r.name} — clerkUserId ${r.clerkUserId} does NOT resolve`);
    }
  }

  // 2. Duplicate clerkUserIds in shoppers (unique index should prevent)
  console.log("\n=== Duplicate clerkUserIds in shoppers ===");
  const dupeIds: { clerkUserId: string; n: number }[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.clerkUserId) continue;
    seen.set(r.clerkUserId, (seen.get(r.clerkUserId) ?? 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) dupeIds.push({ clerkUserId: id, n });
  if (dupeIds.length === 0) console.log("✓ none");
  else {
    issues += dupeIds.length;
    console.table(dupeIds);
  }

  // 3 + 4. Clerk-side duplicates
  console.log("\n=== Clerk-side duplicates ===");
  const { data: users } = await clerk.users.getUserList({ limit: 100 });
  const byEmail = new Map<string, number>();
  const byNameRole = new Map<string, number>();
  for (const u of users) {
    const e = u.primaryEmailAddress?.emailAddress?.toLowerCase();
    if (e) byEmail.set(e, (byEmail.get(e) ?? 0) + 1);
    const role = (u.publicMetadata as Record<string, unknown>)?.staffRole as string | undefined;
    if (role && u.fullName) {
      const k = `${u.fullName.toLowerCase()}|${role}`;
      byNameRole.set(k, (byNameRole.get(k) ?? 0) + 1);
    }
  }
  const dupeEmails = [...byEmail.entries()].filter(([, n]) => n > 1);
  const dupeNamesRole = [...byNameRole.entries()].filter(([, n]) => n > 1);
  if (dupeEmails.length === 0) console.log("✓ no duplicate emails");
  else {
    issues += dupeEmails.length;
    console.log("✗ duplicate emails:", dupeEmails);
  }
  if (dupeNamesRole.length === 0) console.log("✓ no duplicate name+role pairs");
  else {
    issues += dupeNamesRole.length;
    console.log("✗ duplicate name+role:", dupeNamesRole);
  }

  console.log(`\n${issues === 0 ? "✓ All clean." : `✗ ${issues} issue(s).`}`);
  process.exit(issues === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
