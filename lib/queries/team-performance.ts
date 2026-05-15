/**
 * Team Performance dashboard queries (Brief 3, May 2026).
 *
 * Each aggregation is its own exported async function. Keep them
 * self-contained — no shared mega-loader — so each can be reused or
 * tested independently. Cost is one DB roundtrip per call; the team page
 * orchestrates them via Promise.all().
 *
 * Canonical "real sale" filter is duplicated here verbatim from
 * FounderDashboard.tsx / SuperadminDashboard.tsx so headline totals tie
 * exactly. If this becomes the 4th duplication, extract to a helper.
 */

import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sales, shoppers, buyers } from "@/db/schema";
import { and, eq, gte, lte, isNull, inArray, sql, desc } from "drizzle-orm";
import type { DateRange } from "@/lib/dateUtils";
import type { StaffRole } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Shared SQL fragments
// ---------------------------------------------------------------------------

/**
 * Canonical "what counts as a real sale" predicate, mirrored from the
 * inline `headlineFilter` in FounderDashboard / SuperadminDashboard. Using
 * `IS DISTINCT FROM` so NULL values pass (Postgres `!=` returns NULL for
 * NULL operands, which Postgres treats as "false" in a WHERE clause —
 * different from the JS `sale.source !== 'xero_import'` semantics).
 *
 * Date scoping is left to the caller — we filter by sale_date in the
 * per-query date-range conditions below.
 */
function realSalePredicate() {
  return and(
    isNull(sales.deletedAt),
    sql`${sales.source} IS DISTINCT FROM 'xero_import'`,
    sql`${sales.status} IS DISTINCT FROM 'ongoing'`,
    sql`${sales.invoiceStatus} IS DISTINCT FROM 'CREDITED'`,
    sql`${sales.invoiceStatus} IS DISTINCT FROM 'DRAFT'`,
    sql`${sales.invoiceStatus} IS DISTINCT FROM 'VOIDED'`
  );
}

/**
 * SQL equivalent of `effectiveInvoiceValue()` from lib/economics.ts —
 * AmountPaid + AmountDue when both present (post credit-note migration),
 * else fall back to saleAmountIncVat. NUMERIC columns come back as text;
 * cast to numeric for SUM. NULL coalesced to 0 so the SUM is well-defined.
 */
const effectiveInvoiceValueSql = sql<number>`
  CASE
    WHEN ${sales.xeroAmountPaid} IS NOT NULL AND ${sales.xeroAmountDue} IS NOT NULL
      THEN ${sales.xeroAmountPaid}::numeric + ${sales.xeroAmountDue}::numeric
    ELSE COALESCE(${sales.saleAmountIncVat}, 0)
  END
`;

const dateInRange = (range: DateRange) =>
  and(gte(sales.saleDate, range.start), lte(sales.saleDate, range.end));

// ---------------------------------------------------------------------------
// 1. Selling shoppers (role IN ('shopper', 'founder'))
// ---------------------------------------------------------------------------

export interface SellingShopper {
  id: string;
  name: string;
  clerkUserId: string;
  role: StaffRole;
}

/**
 * Active shoppers whose Clerk role is "shopper" OR "founder" — the people
 * who sell professionally. Resolved on every page load (small N, Clerk is
 * cheap, no caching needed). Order: by name, ascending.
 *
 * Inactive shoppers and admin/operations/superadmin sellers are excluded,
 * per Brief 3 ambiguity (A) resolution.
 */
export async function getSellingShoppers(): Promise<SellingShopper[]> {
  // Ensure we have an authenticated context — Clerk's getUserList requires it.
  await auth();

  const activeShoppers = await db
    .select({
      id: shoppers.id,
      name: shoppers.name,
      clerkUserId: shoppers.clerkUserId,
    })
    .from(shoppers)
    .where(eq(shoppers.active, true));

  const sellingRoles: StaffRole[] = ["shopper", "founder"];
  const results: SellingShopper[] = [];

  // Small N (<10 in practice) — per-user fetch is fine. Could switch to
  // getUserList({ userId: [...] }) if this grows past ~20.
  const client = await clerkClient();
  for (const row of activeShoppers) {
    if (!row.clerkUserId || !row.name) continue;
    try {
      const u = await client.users.getUser(row.clerkUserId);
      const role = u.publicMetadata?.staffRole as StaffRole | undefined;
      if (role && sellingRoles.includes(role)) {
        results.push({
          id: row.id,
          name: row.name,
          clerkUserId: row.clerkUserId,
          role,
        });
      }
    } catch {
      // Clerk user missing/deleted — skip silently. Shopper row stays in DB
      // but won't appear in the team view until the Clerk side is fixed.
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// 2. Headline totals (whole team) for a single period
// ---------------------------------------------------------------------------

export interface HeadlineTotals {
  revenue: number;
  margin: number;
  salesCount: number;
  avgMarginPct: number;
}

/**
 * Team-wide headline totals over `range`. Uses the canonical "real sale"
 * filter so numbers tie to the existing OperationsDashboard / FounderDashboard
 * headline tiles.
 */
export async function getHeadlineTotals(range: DateRange): Promise<HeadlineTotals> {
  const [row] = await db
    .select({
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      margin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      salesCount: sql<string>`COUNT(${sales.id})`,
    })
    .from(sales)
    .where(and(realSalePredicate(), dateInRange(range)));

  const revenue = Number(row?.revenue ?? 0);
  const margin = Number(row?.margin ?? 0);
  const salesCount = Number(row?.salesCount ?? 0);
  const avgMarginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

  return { revenue, margin, salesCount, avgMarginPct };
}

// ---------------------------------------------------------------------------
// 3. Per-shopper headline (one row per selling shopper)
// ---------------------------------------------------------------------------

export interface ShopperHeadline {
  shopperId: string;
  revenue: number;
  margin: number;
  salesCount: number;
  marginPct: number;
  avgSaleValue: number;
}

/**
 * Headline aggregates for each of the supplied shopper IDs, over the given
 * date range. Returns one row per shopperId, including rows with zero
 * sales (so the UI doesn't have to guard against missing shoppers).
 */
export async function getShopperHeadlines(
  range: DateRange,
  shopperIds: string[]
): Promise<ShopperHeadline[]> {
  if (shopperIds.length === 0) return [];

  const rows = await db
    .select({
      shopperId: sales.shopperId,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      margin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      salesCount: sql<string>`COUNT(${sales.id})`,
    })
    .from(sales)
    .where(
      and(
        realSalePredicate(),
        dateInRange(range),
        inArray(sales.shopperId, shopperIds)
      )
    )
    .groupBy(sales.shopperId);

  const byId = new Map<string, { revenue: number; margin: number; salesCount: number }>();
  for (const r of rows) {
    if (!r.shopperId) continue;
    byId.set(r.shopperId, {
      revenue: Number(r.revenue),
      margin: Number(r.margin),
      salesCount: Number(r.salesCount),
    });
  }

  return shopperIds.map((id) => {
    const r = byId.get(id) ?? { revenue: 0, margin: 0, salesCount: 0 };
    const marginPct = r.revenue > 0 ? (r.margin / r.revenue) * 100 : 0;
    const avgSaleValue = r.salesCount > 0 ? r.revenue / r.salesCount : 0;
    return {
      shopperId: id,
      revenue: r.revenue,
      margin: r.margin,
      salesCount: r.salesCount,
      marginPct,
      avgSaleValue,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Monthly trend per shopper (Jan 2026 → current, fixed range)
// ---------------------------------------------------------------------------

export interface MonthlyShopperPoint {
  shopperId: string;
  yearMonth: string; // "YYYY-MM"
  revenue: number;
  margin: number;
  commissionableMargin: number;
  salesCount: number;
}

/**
 * Monthly aggregates per shopper, over a fixed [start, end] range. Brief 3
 * always asks for Jan 2026 → current month regardless of the rest-of-page
 * period filter — the chart is a trend view, not a period view.
 *
 * Empty months/shoppers are NOT inserted here — the caller fills gaps so
 * the chart renders a continuous x-axis.
 */
export async function getMonthlyTrendByShopper(
  range: DateRange,
  shopperIds: string[]
): Promise<MonthlyShopperPoint[]> {
  if (shopperIds.length === 0) return [];

  const rows = await db
    .select({
      shopperId: sales.shopperId,
      yearMonth: sql<string>`TO_CHAR(DATE_TRUNC('month', ${sales.saleDate}), 'YYYY-MM')`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      margin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      commissionableMargin: sql<string>`COALESCE(SUM(${sales.commissionableMargin}), 0)`,
      salesCount: sql<string>`COUNT(${sales.id})`,
    })
    .from(sales)
    .where(
      and(
        realSalePredicate(),
        dateInRange(range),
        inArray(sales.shopperId, shopperIds)
      )
    )
    .groupBy(
      sales.shopperId,
      sql`DATE_TRUNC('month', ${sales.saleDate})`
    )
    .orderBy(sql`DATE_TRUNC('month', ${sales.saleDate})`);

  return rows
    .filter((r) => r.shopperId)
    .map((r) => ({
      shopperId: r.shopperId as string,
      yearMonth: r.yearMonth,
      revenue: Number(r.revenue),
      margin: Number(r.margin),
      commissionableMargin: Number(r.commissionableMargin),
      salesCount: Number(r.salesCount),
    }));
}

// ---------------------------------------------------------------------------
// 5. Top clients per shopper
// ---------------------------------------------------------------------------

export interface TopClientRow {
  buyerId: string;
  buyerName: string;
  totalMargin: number;
  salesCount: number;
}

/**
 * Top-N clients for a single shopper by total gross margin generated in
 * the period. Excludes sales with no buyer FK (shouldn't happen often,
 * but guards against the Xero-import edge case).
 */
export async function getTopClientsByShopper(
  range: DateRange,
  shopperId: string,
  limit = 5
): Promise<TopClientRow[]> {
  const rows = await db
    .select({
      buyerId: sales.buyerId,
      buyerName: buyers.name,
      totalMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      salesCount: sql<string>`COUNT(${sales.id})`,
    })
    .from(sales)
    .innerJoin(buyers, eq(sales.buyerId, buyers.id))
    .where(
      and(
        realSalePredicate(),
        dateInRange(range),
        eq(sales.shopperId, shopperId)
      )
    )
    .groupBy(sales.buyerId, buyers.name)
    .orderBy(desc(sql`SUM(${sales.grossMargin})`))
    .limit(limit);

  return rows
    .filter((r) => r.buyerId && r.buyerName)
    .map((r) => ({
      buyerId: r.buyerId as string,
      buyerName: r.buyerName as string,
      totalMargin: Number(r.totalMargin),
      salesCount: Number(r.salesCount),
    }));
}

// ---------------------------------------------------------------------------
// 6. New vs repeat client split per shopper
// ---------------------------------------------------------------------------

export interface NewVsRepeatRow {
  shopperId: string;
  newCount: number;
  newMargin: number;
  repeatCount: number;
  repeatMargin: number;
}

/**
 * New-vs-repeat client split per shopper. Definition (per brief):
 *   A sale counts as "new" if no earlier sale (any shopper) exists for
 *   the same buyer with sale_date strictly before this sale's sale_date.
 *
 * Implementation: window function `MIN(sale_date) OVER (PARTITION BY buyer_id)`
 * over the full (real, non-deleted) sales population. A sale is "new" iff
 * its sale_date equals the buyer's earliest sale_date.
 *
 * Edge case: two sales to the same buyer on the same date both count as
 * "new" (neither is strictly before the other). Acceptable — rare in
 * practice and the brief doesn't disambiguate.
 *
 * The `is_new_client` column on sales is NOT used — only 16 of 1,173 rows
 * carry `true` and the default is `false`, so it's unreliable for
 * historical data. Separate backlog item to backfill or remove.
 */
export async function getNewVsRepeatByShopper(
  range: DateRange,
  shopperIds: string[]
): Promise<NewVsRepeatRow[]> {
  if (shopperIds.length === 0) return [];

  // CTE: tag every sale with the buyer's earliest sale_date across the
  // whole "real sale" population. Then within the period + shopper scope,
  // count those whose sale_date = buyer_first.
  const tagged = db.$with("tagged_sales").as(
    db
      .select({
        id: sales.id,
        shopperId: sales.shopperId,
        buyerId: sales.buyerId,
        saleDate: sales.saleDate,
        grossMargin: sales.grossMargin,
        firstSaleDate: sql<Date>`MIN(${sales.saleDate}) OVER (PARTITION BY ${sales.buyerId})`.as("first_sale_date"),
      })
      .from(sales)
      .where(realSalePredicate())
  );

  const rows = await db
    .with(tagged)
    .select({
      shopperId: tagged.shopperId,
      newCount: sql<string>`COUNT(*) FILTER (WHERE ${tagged.saleDate} = ${tagged.firstSaleDate})`,
      newMargin: sql<string>`COALESCE(SUM(${tagged.grossMargin}) FILTER (WHERE ${tagged.saleDate} = ${tagged.firstSaleDate}), 0)`,
      repeatCount: sql<string>`COUNT(*) FILTER (WHERE ${tagged.saleDate} > ${tagged.firstSaleDate})`,
      repeatMargin: sql<string>`COALESCE(SUM(${tagged.grossMargin}) FILTER (WHERE ${tagged.saleDate} > ${tagged.firstSaleDate}), 0)`,
    })
    .from(tagged)
    .where(
      and(
        gte(tagged.saleDate, range.start),
        lte(tagged.saleDate, range.end),
        inArray(tagged.shopperId, shopperIds)
      )
    )
    .groupBy(tagged.shopperId);

  const byId = new Map<string, NewVsRepeatRow>();
  for (const r of rows) {
    if (!r.shopperId) continue;
    byId.set(r.shopperId, {
      shopperId: r.shopperId,
      newCount: Number(r.newCount),
      newMargin: Number(r.newMargin),
      repeatCount: Number(r.repeatCount),
      repeatMargin: Number(r.repeatMargin),
    });
  }

  return shopperIds.map(
    (id) =>
      byId.get(id) ?? {
        shopperId: id,
        newCount: 0,
        newMargin: 0,
        repeatCount: 0,
        repeatMargin: 0,
      }
  );
}

// ---------------------------------------------------------------------------
// 7. Pending-completion count + oldest age per shopper
// ---------------------------------------------------------------------------

export interface PendingCompletionRow {
  shopperId: string;
  count: number;
  oldestAllocatedAt: Date | null;
}

/**
 * Per-shopper count of allocated-but-incomplete sales, with the
 * allocation timestamp of the oldest one. Definition matches the existing
 * ShopperDashboard filter — source='allocated', completedAt null, not
 * deleted, not VOIDED, and any of (buyPrice = 0, buyPrice null, supplierId
 * null).
 */
export async function getPendingCompletionByShopper(
  shopperIds: string[]
): Promise<PendingCompletionRow[]> {
  if (shopperIds.length === 0) return [];

  const rows = await db
    .select({
      shopperId: sales.shopperId,
      count: sql<string>`COUNT(${sales.id})`,
      oldestAllocatedAt: sql<Date | null>`MIN(${sales.allocatedAt})`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.source, "allocated"),
        isNull(sales.completedAt),
        isNull(sales.deletedAt),
        sql`${sales.invoiceStatus} IS DISTINCT FROM 'VOIDED'`,
        sql`(${sales.buyPrice} = 0 OR ${sales.buyPrice} IS NULL OR ${sales.supplierId} IS NULL)`,
        inArray(sales.shopperId, shopperIds)
      )
    )
    .groupBy(sales.shopperId);

  const byId = new Map<string, PendingCompletionRow>();
  for (const r of rows) {
    if (!r.shopperId) continue;
    byId.set(r.shopperId, {
      shopperId: r.shopperId,
      count: Number(r.count),
      oldestAllocatedAt: r.oldestAllocatedAt
        ? new Date(r.oldestAllocatedAt as unknown as string)
        : null,
    });
  }

  return shopperIds.map(
    (id) =>
      byId.get(id) ?? { shopperId: id, count: 0, oldestAllocatedAt: null }
  );
}
