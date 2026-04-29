/**
 * Replace the non-unique index on shoppers.clerk_user_id with a UNIQUE one.
 *
 * Why: makes "two shopper rows pointing at the same Clerk user" structurally
 * impossible — the cause of MC's duplicate-row saga.
 *
 * NULLs stay allowed (Postgres treats them as distinct), so legacy rows
 * without a Clerk link are unaffected.
 *
 * Usage:
 *   npx tsx scripts/add_shopper_clerk_unique_constraint.ts            # Dry run
 *   npx tsx scripts/add_shopper_clerk_unique_constraint.ts --execute  # Apply
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import postgres from "postgres";

async function main() {
  const apply = process.argv.includes("--execute");
  const url = process.env.XATA_POSTGRES_URL;
  if (!url) {
    console.error("XATA_POSTGRES_URL missing");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  // Pre-flight: confirm no duplicate non-null clerk_user_ids exist
  const dupes = await sql<{ clerk_user_id: string; count: number }[]>`
    SELECT clerk_user_id, COUNT(*)::int AS count
    FROM shoppers
    WHERE clerk_user_id IS NOT NULL
    GROUP BY clerk_user_id
    HAVING COUNT(*) > 1
  `;

  if (dupes.length > 0) {
    console.error("Cannot add unique index — duplicates already exist:");
    console.table(dupes);
    await sql.end();
    process.exit(1);
  }
  console.log("Pre-flight OK — no duplicate clerk_user_ids.\n");

  const existing = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'shoppers'
      AND indexname = 'shoppers_clerk_user_id_idx'
  `;
  console.log("Existing index:", existing[0] ?? "(none)");

  if (existing[0]?.indexdef.includes("UNIQUE")) {
    console.log("\nAlready unique — nothing to do.");
    await sql.end();
    process.exit(0);
  }

  if (!apply) {
    console.log("\nDry run — would:");
    console.log("  DROP INDEX IF EXISTS shoppers_clerk_user_id_idx;");
    console.log("  CREATE UNIQUE INDEX shoppers_clerk_user_id_idx ON shoppers (clerk_user_id);");
    await sql.end();
    process.exit(0);
  }

  await sql.begin(async (tx) => {
    await tx`DROP INDEX IF EXISTS shoppers_clerk_user_id_idx`;
    await tx`CREATE UNIQUE INDEX shoppers_clerk_user_id_idx ON shoppers (clerk_user_id)`;
  });
  console.log("✓ Unique index installed.");

  const after = await sql<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'shoppers'
      AND indexname = 'shoppers_clerk_user_id_idx'
  `;
  console.log("New index:", after[0]?.indexdef);

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
