/**
 * Club 19 Sales OS - Team Performance Dashboard (Brief 3, May 2026).
 *
 * Cross-shopper trends and comparison view for management roles
 * (superadmin / admin / founder / operations). Sits alongside the three
 * role-specific dashboards rather than replacing them.
 */

import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/getUserRole";
import { canAccessRoute } from "@/lib/permissions";
import {
  getPeriodDateRange,
  parsePeriodParam,
  type PeriodKey,
} from "@/lib/dateUtils";
import {
  getSellingShoppers,
  getHeadlineTotals,
  getShopperHeadlines,
  getMonthlyTrendByShopper,
  getTopClientsByShopper,
  getNewVsRepeatByShopper,
  getPendingCompletionByShopper,
} from "@/lib/queries/team-performance";
import { TeamPerformanceView } from "@/components/team-performance/TeamPerformanceView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    period?: string;
    start?: string;
    end?: string;
  }>;
}

export default async function TeamPerformancePage({ searchParams }: PageProps) {
  const role = await getUserRole();

  if (!canAccessRoute(role, "/team-performance")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const period: PeriodKey = parsePeriodParam(params.period);
  const { current, previous, label } = getPeriodDateRange(
    period,
    params.start,
    params.end
  );

  // Trend chart range: Jan 2026 → end of current month, fixed regardless
  // of the page's period filter (it's a trend view, not a period view).
  const now = new Date();
  const trendRange = {
    start: new Date(2026, 0, 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };

  // Resolve selling shoppers first — every subsequent query is scoped to
  // their IDs. Five DB shoppers in practice; three pass the role filter.
  const sellingShoppers = await getSellingShoppers();
  const shopperIds = sellingShoppers.map((s) => s.id);

  // Run remaining aggregations in parallel.
  const [
    headlineCurrent,
    headlinePrevious,
    shopperHeadlinesCurrent,
    shopperHeadlinesPrevious,
    monthlyTrend,
    newVsRepeat,
    pendingCompletion,
    ...topClientsPerShopper
  ] = await Promise.all([
    getHeadlineTotals(current),
    getHeadlineTotals(previous),
    getShopperHeadlines(current, shopperIds),
    getShopperHeadlines(previous, shopperIds),
    getMonthlyTrendByShopper(trendRange, shopperIds),
    getNewVsRepeatByShopper(current, shopperIds),
    getPendingCompletionByShopper(shopperIds),
    ...shopperIds.map((id) => getTopClientsByShopper(current, id, 5)),
  ]);

  return (
    <TeamPerformanceView
      role={role}
      period={period}
      periodLabel={label}
      customStart={params.start ?? null}
      customEnd={params.end ?? null}
      sellingShoppers={sellingShoppers}
      headlineCurrent={headlineCurrent}
      headlinePrevious={headlinePrevious}
      shopperHeadlinesCurrent={shopperHeadlinesCurrent}
      shopperHeadlinesPrevious={shopperHeadlinesPrevious}
      monthlyTrend={monthlyTrend}
      newVsRepeat={newVsRepeat}
      pendingCompletion={pendingCompletion}
      topClientsByShopper={shopperIds.map((id, i) => ({
        shopperId: id,
        rows: topClientsPerShopper[i],
      }))}
    />
  );
}
