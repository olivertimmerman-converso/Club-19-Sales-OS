/**
 * Top-level layout for the Introducer Performance page. Server-rendered;
 * only the period picker, trend chart, and leaderboard need client-side
 * interactivity (each its own "use client" island).
 */

import type {
  ChannelHeadlineTotals,
  ChannelMonthlyPoint,
  ChannelComparison,
  IntroducerRow,
} from "@/lib/queries/introducer-performance";
import type { PeriodKey } from "@/lib/dateUtils";
import { PeriodPicker } from "@/components/team-performance/PeriodPicker";
import { HeadlineTiles } from "./HeadlineTiles";
import { TrendChart } from "./TrendChart";
import { LeaderboardTable } from "./LeaderboardTable";
import { ChannelComparisonPanel } from "./ChannelComparison";

interface Props {
  period: PeriodKey;
  periodLabel: string;
  customStart: string | null;
  customEnd: string | null;
  noPriorData: boolean;
  headlineCurrent: ChannelHeadlineTotals;
  headlinePrevious: ChannelHeadlineTotals;
  monthlyTrend: ChannelMonthlyPoint[];
  leaderboard: IntroducerRow[];
  comparison: ChannelComparison;
}

export function IntroducerPerformanceView({
  period,
  periodLabel,
  customStart,
  customEnd,
  noPriorData,
  headlineCurrent,
  headlinePrevious,
  monthlyTrend,
  leaderboard,
  comparison,
}: Props) {
  const now = new Date();
  const trendStart = "2026-01-01";
  const trendEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-8 p-6 bg-club19-offwhite min-h-screen">
      <header className="space-y-3">
        <div>
          <h1 className="font-serif text-3xl text-club19-navy">Introducers</h1>
          <p className="text-sm text-club19-taupe">
            Channel performance: who drives what business, what we pay them,
            and whether the introducer channel is more or less profitable per
            sale than direct sales. Showing{" "}
            <span className="font-medium">{periodLabel.toLowerCase()}</span>.
          </p>
        </div>
        <PeriodPicker
          period={period}
          customStart={customStart}
          customEnd={customEnd}
        />
      </header>

      <section>
        <HeadlineTiles
          current={headlineCurrent}
          previous={headlinePrevious}
          periodLabel={periodLabel}
          noPriorData={noPriorData}
        />
      </section>

      <section>
        <TrendChart
          monthlyTrend={monthlyTrend}
          rangeStart={trendStart}
          rangeEnd={trendEnd}
        />
      </section>

      <section>
        <LeaderboardTable rows={leaderboard} />
      </section>

      <section>
        <ChannelComparisonPanel comparison={comparison} />
      </section>
    </div>
  );
}
