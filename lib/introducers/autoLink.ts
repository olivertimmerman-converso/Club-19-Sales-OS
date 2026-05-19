import { db } from "@/db";
import { introducers, type Introducer } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Try to attach the wizard's free-text introducer name to a curated
 * `introducers` row. Case-insensitive, trimmed, exact-string match against
 * `introducers.name`.
 *
 * Returns the curated row only when there is exactly one match.
 * Returns null on 0 matches (would-be orphan) or 2+ matches (ambiguous —
 * surface for human resolution on the sale detail page).
 *
 * Pure lookup — never inserts. Auto-creation of curated rows is reserved
 * for explicit user action via the sale detail page.
 */
export async function tryLinkIntroducer(
  name: string | null | undefined
): Promise<Introducer | null> {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const matches = await db
    .select()
    .from(introducers)
    .where(sql`lower(trim(${introducers.name})) = lower(${trimmed})`)
    .limit(2);

  return matches.length === 1 ? matches[0] : null;
}
