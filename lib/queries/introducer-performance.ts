/**
 * Introducer Performance dashboard queries (May 2026).
 *
 * Aggregations for the management-visible `/introducers` page. Mirrors the
 * shape of `lib/queries/team-performance.ts` so the page can stay a thin
 * server component that orchestrates parallel reads.
 *
 * "Introducer sale" predicate is `has_introducer = TRUE` (the wizard
 * checkbox flag) — most reliable signal across the source mix. A small
 * number of those rows have `introducer_id` null (orphans surfaced in the
 * sale-detail orphan-state UI); they're attributed to a synthetic
 * "(Unlinked)" bucket in the leaderboard.
 *
 * Canonical "real sale" filter is duplicated verbatim from
 * `lib/queries/team-performance.ts` so headline numbers tie exactly.
 */

import { db } from "@/db";
import { sales, introducers } from "@/db/schema";
import { and, eq, gte, lte, isNull, isNotNull, sql, desc } from "drizzle-orm";
import type { DateRange } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Shared SQL fragments
// ---------------------------------------------------------------------------

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

/** SQL equivalent of `effectiveInvoiceValue()` — mirrors Team Performance. */
const effectiveInvoiceValueSql = sql<number>`
  CASE
    WHEN ${sales.xeroAmountPaid} IS NOT NULL AND ${sales.xeroAmountDue} IS NOT NULL
      THEN ${sales.xeroAmountPaid}::numeric + ${sales.xeroAmountDue}::numeric
    ELSE COALESCE(${sales.saleAmountIncVat}, 0)
  END
`;

const dateInRange = (range: DateRange) =>
  and(gte(sales.saleDate, range.start), lte(sales.saleDate, range.end));

// Introducer-channel predicate: any sale where the shopper checked the
// "this sale has an introducer" box, regardless of whether the curated FK
// resolved. Unlinked rows still belong to the channel; they show in the
// leaderboard's "(Unlinked)" bucket.
const introChannel = sql`${sales.hasIntroducer} = TRUE`;

// ---------------------------------------------------------------------------
// 1. Channel headline totals
// ---------------------------------------------------------------------------

export interface ChannelHeadlineTotals {
  /** Distinct introducers with ≥1 sale in the period — curated FKs plus
   *  one synthetic entity per distinct unlinked introducer name. */
  activeIntroducers: number;
  salesCount: number;
  /** Sum of effective invoice value across introducer sales. */
  revenue: number;
  /** Sum of `introducer_commission`. */
  fees: number;
  /** Sum of `gross_margin` (ex-VAT, source of truth from sale creation). */
  grossMargin: number;
  /** `grossMargin − fees`. */
  netMargin: number;
  /** introducer revenue / total real-sale revenue, percentage. */
  channelShare: number;
}

/**
 * Headline totals across the introducer channel for `range`. Channel share
 * is computed against the period's total real-sale revenue (introducer +
 * direct combined) so the percentage moves with both numerator and
 * denominator.
 */
export async function getChannelHeadlineTotals(
  range: DateRange
): Promise<ChannelHeadlineTotals> {
  // Active-introducer count collapses linked-FK and unlinked-text rows on
  // the same canonical name. The LEFT JOIN brings the curated name into
  // scope; we then count distinct lower(trim(canonical name)) so a sale
  // FK-linked to "Caroline Stanbury" + a sale typed "Caroline Stanbury"
  // with no FK both contribute to the same entity. Counting raw FK + raw
  // text separately would double-count partially-linked introducers.
  const [channelRow] = await db
    .select({
      salesCount: sql<string>`COUNT(${sales.id})`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      fees: sql<string>`COALESCE(SUM(${sales.introducerCommission}), 0)`,
      grossMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      activeIntroducers: sql<string>`COUNT(DISTINCT
        LOWER(TRIM(COALESCE(${introducers.name}, ${sales.introducerName})))
      )`,
    })
    .from(sales)
    .leftJoin(introducers, eq(sales.introducerId, introducers.id))
    .where(and(realSalePredicate(), dateInRange(range), introChannel));

  const [totalRow] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
    })
    .from(sales)
    .where(and(realSalePredicate(), dateInRange(range)));

  const revenue = Number(channelRow?.revenue ?? 0);
  const fees = Number(channelRow?.fees ?? 0);
  const grossMargin = Number(channelRow?.grossMargin ?? 0);
  const totalRevenue = Number(totalRow?.totalRevenue ?? 0);

  return {
    activeIntroducers: Number(channelRow?.activeIntroducers ?? 0),
    salesCount: Number(channelRow?.salesCount ?? 0),
    revenue,
    fees,
    grossMargin,
    netMargin: grossMargin - fees,
    channelShare: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// 2. Per-introducer leaderboard
// ---------------------------------------------------------------------------

export interface IntroducerRow {
  /** Curated introducer ID, or null for the "(Unlinked)" aggregate row. */
  introducerId: string | null;
  /** Display name — curated name, or "(Unlinked)" for the aggregate row. */
  name: string;
  /** True for the synthetic "(Unlinked)" aggregate row. */
  isUnlinked: boolean;
  salesCount: number;
  revenue: number;
  avgSaleValue: number;
  grossMargin: number;
  /** grossMargin / revenue × 100. Channel-level avg (not mean of per-sale %). */
  avgMarginPct: number;
  fees: number;
  netMargin: number;
  netMarginPct: number;
  lastSaleDate: Date | null;
}

/**
 * One row per linked introducer plus a single aggregated "(Unlinked)" row
 * collapsing every introducer sale where `introducer_id IS NULL AND
 * introducer_name IS NOT NULL AND trim(introducer_name) <> ''`.
 *
 * Ordering is intentionally simple here (revenue desc) — the leaderboard
 * table component handles re-sort client-side on any column.
 */
export async function getIntroducerLeaderboard(
  range: DateRange
): Promise<IntroducerRow[]> {
  // Linked rows — group by introducer FK, join curated name.
  const linked = await db
    .select({
      introducerId: sales.introducerId,
      name: introducers.name,
      salesCount: sql<string>`COUNT(${sales.id})`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      grossMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      fees: sql<string>`COALESCE(SUM(${sales.introducerCommission}), 0)`,
      lastSaleDate: sql<Date | null>`MAX(${sales.saleDate})`,
    })
    .from(sales)
    .innerJoin(introducers, eq(sales.introducerId, introducers.id))
    .where(
      and(
        realSalePredicate(),
        dateInRange(range),
        introChannel,
        isNotNull(sales.introducerId)
      )
    )
    .groupBy(sales.introducerId, introducers.name);

  // Unlinked rows — single aggregate row spanning every sale with an
  // introducer name typed but no FK. Trimmed-empty names don't count.
  const [unlinkedRow] = await db
    .select({
      salesCount: sql<string>`COUNT(${sales.id})`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      grossMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      fees: sql<string>`COALESCE(SUM(${sales.introducerCommission}), 0)`,
      lastSaleDate: sql<Date | null>`MAX(${sales.saleDate})`,
    })
    .from(sales)
    .where(
      and(
        realSalePredicate(),
        dateInRange(range),
        introChannel,
        isNull(sales.introducerId),
        sql`NULLIF(TRIM(${sales.introducerName}), '') IS NOT NULL`
      )
    );

  const linkedRows: IntroducerRow[] = linked
    .filter((r) => r.introducerId && r.name)
    .map((r) => {
      const salesCount = Number(r.salesCount);
      const revenue = Number(r.revenue);
      const grossMargin = Number(r.grossMargin);
      const fees = Number(r.fees);
      const netMargin = grossMargin - fees;
      return {
        introducerId: r.introducerId as string,
        name: r.name as string,
        isUnlinked: false,
        salesCount,
        revenue,
        avgSaleValue: salesCount > 0 ? revenue / salesCount : 0,
        grossMargin,
        avgMarginPct: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
        fees,
        netMargin,
        netMarginPct: revenue > 0 ? (netMargin / revenue) * 100 : 0,
        lastSaleDate: r.lastSaleDate
          ? new Date(r.lastSaleDate as unknown as string)
          : null,
      };
    });

  const unlinkedCount = Number(unlinkedRow?.salesCount ?? 0);
  const result = [...linkedRows];
  if (unlinkedCount > 0) {
    const revenue = Number(unlinkedRow!.revenue);
    const grossMargin = Number(unlinkedRow!.grossMargin);
    const fees = Number(unlinkedRow!.fees);
    const netMargin = grossMargin - fees;
    result.push({
      introducerId: null,
      name: "(Unlinked)",
      isUnlinked: true,
      salesCount: unlinkedCount,
      revenue,
      avgSaleValue: unlinkedCount > 0 ? revenue / unlinkedCount : 0,
      grossMargin,
      avgMarginPct: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
      fees,
      netMargin,
      netMarginPct: revenue > 0 ? (netMargin / revenue) * 100 : 0,
      lastSaleDate: unlinkedRow!.lastSaleDate
        ? new Date(unlinkedRow!.lastSaleDate as unknown as string)
        : null,
    });
  }

  // Default sort: revenue desc. Client component re-sorts on column click.
  return result.sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// 3. Monthly channel trend (Jan 2026 → current month, fixed range)
// ---------------------------------------------------------------------------

export interface ChannelMonthlyPoint {
  yearMonth: string; // "YYYY-MM"
  revenue: number;
  netMargin: number;
  salesCount: number;
  fees: number;
}

/**
 * Channel-wide monthly aggregates over a fixed range (the page passes Jan
 * 2026 → current month regardless of the period filter — it's a trend view).
 * Empty months are NOT inserted here; the client component fills gaps so
 * the x-axis stays continuous.
 */
export async function getChannelMonthlyTrend(
  range: DateRange
): Promise<ChannelMonthlyPoint[]> {
  const rows = await db
    .select({
      yearMonth: sql<string>`TO_CHAR(DATE_TRUNC('month', ${sales.saleDate}), 'YYYY-MM')`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      grossMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      fees: sql<string>`COALESCE(SUM(${sales.introducerCommission}), 0)`,
      salesCount: sql<string>`COUNT(${sales.id})`,
    })
    .from(sales)
    .where(and(realSalePredicate(), dateInRange(range), introChannel))
    .groupBy(sql`DATE_TRUNC('month', ${sales.saleDate})`)
    .orderBy(sql`DATE_TRUNC('month', ${sales.saleDate})`);

  return rows.map((r) => {
    const grossMargin = Number(r.grossMargin);
    const fees = Number(r.fees);
    return {
      yearMonth: r.yearMonth,
      revenue: Number(r.revenue),
      netMargin: grossMargin - fees,
      salesCount: Number(r.salesCount),
      fees,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Channel vs direct comparison
// ---------------------------------------------------------------------------

export interface ChannelComparisonStats {
  totalRevenue: number;
  salesCount: number;
  avgSaleValue: number;
  /** Avg £ gross margin per sale. */
  avgGrossMarginPerSale: number;
  /** Channel-level gross margin % (total grossMargin / total revenue × 100). */
  avgGrossMarginPctPerSale: number;
  /** Introducer-channel only: avg £ fee per sale. */
  avgFeePerSale: number | null;
  /** Introducer-channel only: avg £ net margin (after fees) per sale. */
  avgNetMarginPerSale: number | null;
}

export interface ChannelComparison {
  introducer: ChannelComparisonStats;
  direct: ChannelComparisonStats;
}

/**
 * Side-by-side aggregates for introducer vs direct sales in `range`.
 * Direct = real sale with `has_introducer` false or null.
 */
export async function getChannelComparison(
  range: DateRange
): Promise<ChannelComparison> {
  const [introRow] = await db
    .select({
      salesCount: sql<string>`COUNT(${sales.id})`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      grossMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
      fees: sql<string>`COALESCE(SUM(${sales.introducerCommission}), 0)`,
    })
    .from(sales)
    .where(and(realSalePredicate(), dateInRange(range), introChannel));

  const [directRow] = await db
    .select({
      salesCount: sql<string>`COUNT(${sales.id})`,
      revenue: sql<string>`COALESCE(SUM(${effectiveInvoiceValueSql}), 0)`,
      grossMargin: sql<string>`COALESCE(SUM(${sales.grossMargin}), 0)`,
    })
    .from(sales)
    .where(
      and(
        realSalePredicate(),
        dateInRange(range),
        sql`COALESCE(${sales.hasIntroducer}, FALSE) = FALSE`
      )
    );

  const makeStats = (
    salesCount: number,
    revenue: number,
    grossMargin: number,
    fees: number | null
  ): ChannelComparisonStats => {
    const netMargin = fees != null ? grossMargin - fees : grossMargin;
    return {
      totalRevenue: revenue,
      salesCount,
      avgSaleValue: salesCount > 0 ? revenue / salesCount : 0,
      avgGrossMarginPerSale: salesCount > 0 ? grossMargin / salesCount : 0,
      avgGrossMarginPctPerSale: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
      avgFeePerSale:
        fees != null && salesCount > 0 ? fees / salesCount : fees != null ? 0 : null,
      avgNetMarginPerSale:
        fees != null && salesCount > 0 ? netMargin / salesCount : fees != null ? 0 : null,
    };
  };

  return {
    introducer: makeStats(
      Number(introRow?.salesCount ?? 0),
      Number(introRow?.revenue ?? 0),
      Number(introRow?.grossMargin ?? 0),
      Number(introRow?.fees ?? 0)
    ),
    direct: makeStats(
      Number(directRow?.salesCount ?? 0),
      Number(directRow?.revenue ?? 0),
      Number(directRow?.grossMargin ?? 0),
      null
    ),
  };
}
