/**
 * Club 19 Sales OS - Introducer Performance Dashboard (May 2026).
 *
 * Management-visible analytics for the introducer channel. Same visibility
 * pattern as `/team-performance` — superadmin / admin / founder / operations.
 *
 * Page defaults to YTD (vs Team Performance which defaults to This Month) —
 * the channel doesn't move month-to-month enough to be interesting on the
 * monthly framing; YTD gives enough volume to read trends.
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
  getChannelHeadlineTotals,
  getIntroducerLeaderboard,
  getChannelMonthlyTrend,
  getChannelComparison,
} from "@/lib/queries/introducer-performance";
import { IntroducerPerformanceView } from "@/components/introducers/IntroducerPerformanceView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    period?: string;
    start?: string;
    end?: string;
  }>;
}

export default async function IntroducersPage({ searchParams }: PageProps) {
  const role = await getUserRole();

  if (!canAccessRoute(role, "/introducers")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  // Default to YTD when no period param. parsePeriodParam normalises unknown
  // strings to "this_month", so passing "ytd" through the fallback path keeps
  // explicit selections honoured.
  const period: PeriodKey = parsePeriodParam(params.period ?? "ytd");
  const { current, previous, label } = getPeriodDateRange(
    period,
    params.start,
    params.end
  );

  // Same data floor as Team Performance — earliest "real sale" in the DB
  // is Dec 2025 but everything before Jan 2026 is excluded by the canonical
  // filter. When the prior window ends before this floor, DeltaPills render
  // "no prior data" rather than misreading absence as a fresh-channel signal.
  const DATA_FLOOR = new Date(2026, 0, 1, 0, 0, 0, 0);
  const noPriorData = previous.end < DATA_FLOOR;

  // Trend chart range: fixed Jan 2026 → end of current month, independent
  // of the page period (it's a trend view, not a period view).
  const now = new Date();
  const trendRange = {
    start: new Date(2026, 0, 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };

  const [
    headlineCurrent,
    headlinePrevious,
    monthlyTrend,
    leaderboard,
    comparison,
  ] = await Promise.all([
    getChannelHeadlineTotals(current),
    getChannelHeadlineTotals(previous),
    getChannelMonthlyTrend(trendRange),
    getIntroducerLeaderboard(current),
    getChannelComparison(current),
  ]);

  return (
    <IntroducerPerformanceView
      period={period}
      periodLabel={label}
      customStart={params.start ?? null}
      customEnd={params.end ?? null}
      noPriorData={noPriorData}
      headlineCurrent={headlineCurrent}
      headlinePrevious={headlinePrevious}
      monthlyTrend={monthlyTrend}
      leaderboard={leaderboard}
      comparison={comparison}
    />
  );
}
