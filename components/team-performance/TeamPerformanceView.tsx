/**
 * Top-level layout for the Team Performance page. Stays a server-rendered
 * component — only the period picker and chart need client interactivity,
 * and they're each their own "use client" island.
 */

import type {
  HeadlineTotals,
  MonthlyShopperPoint,
  NewVsRepeatRow,
  PendingCompletionRow,
  SellingShopper,
  ShopperHeadline,
  TopClientRow,
} from "@/lib/queries/team-performance";
import type { PeriodKey } from "@/lib/dateUtils";
import type { StaffRole } from "@/lib/permissions";
import { PeriodPicker } from "./PeriodPicker";
import { HeadlineTiles } from "./HeadlineTiles";
import { TrendChart } from "./TrendChart";
import { ShopperPerformanceCard } from "./ShopperPerformanceCard";
import { TopClientsSection } from "./TopClientsSection";
import { NewVsRepeatSection } from "./NewVsRepeatSection";

interface Props {
  role: StaffRole | null;
  period: PeriodKey;
  periodLabel: string;
  customStart: string | null;
  customEnd: string | null;
  sellingShoppers: SellingShopper[];
  headlineCurrent: HeadlineTotals;
  headlinePrevious: HeadlineTotals;
  shopperHeadlinesCurrent: ShopperHeadline[];
  shopperHeadlinesPrevious: ShopperHeadline[];
  monthlyTrend: MonthlyShopperPoint[];
  newVsRepeat: NewVsRepeatRow[];
  pendingCompletion: PendingCompletionRow[];
  topClientsByShopper: { shopperId: string; rows: TopClientRow[] }[];
}

export function TeamPerformanceView({
  period,
  periodLabel,
  customStart,
  customEnd,
  sellingShoppers,
  headlineCurrent,
  headlinePrevious,
  shopperHeadlinesCurrent,
  shopperHeadlinesPrevious,
  monthlyTrend,
  newVsRepeat,
  pendingCompletion,
  topClientsByShopper,
}: Props) {
  // Index per-shopper aggregates by ID for fast lookup at render time.
  const currentBy = new Map(
    shopperHeadlinesCurrent.map((r) => [r.shopperId, r])
  );
  const previousBy = new Map(
    shopperHeadlinesPrevious.map((r) => [r.shopperId, r])
  );
  const pendingBy = new Map(pendingCompletion.map((r) => [r.shopperId, r]));

  const now = new Date();
  const trendStart = "2026-01-01";
  const trendEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-8 p-6 bg-club19-offwhite min-h-screen">
      {/* ---- Header ---- */}
      <header className="space-y-3">
        <div>
          <h1 className="font-serif text-3xl text-club19-navy">
            Team performance
          </h1>
          <p className="text-sm text-club19-taupe">
            Comparative trends across the people who sell. Showing{" "}
            <span className="font-medium">{periodLabel.toLowerCase()}</span>.
          </p>
        </div>
        <PeriodPicker
          period={period}
          customStart={customStart}
          customEnd={customEnd}
        />
      </header>

      {/* ---- Headline tiles ---- */}
      <section>
        <HeadlineTiles
          current={headlineCurrent}
          previous={headlinePrevious}
          periodLabel={periodLabel}
        />
      </section>

      {/* ---- Trend chart (Jan 2026 → current month) ---- */}
      <section>
        <TrendChart
          sellingShoppers={sellingShoppers}
          monthlyTrend={monthlyTrend}
          rangeStart={trendStart}
          rangeEnd={trendEnd}
        />
      </section>

      {/* ---- Side-by-side shopper cards ---- */}
      <section>
        <h2 className="font-serif text-xl text-club19-navy mb-4">
          By shopper
        </h2>
        {sellingShoppers.length === 0 ? (
          <div className="rounded-xl border border-club19-warmgrey bg-white p-6 text-sm text-club19-taupe">
            No active shoppers with the &ldquo;shopper&rdquo; or
            &ldquo;founder&rdquo; role found.
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              sellingShoppers.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
            }`}
          >
            {sellingShoppers.map((s) => (
              <ShopperPerformanceCard
                key={s.id}
                shopper={s}
                current={
                  currentBy.get(s.id) ?? {
                    shopperId: s.id,
                    revenue: 0,
                    margin: 0,
                    salesCount: 0,
                    marginPct: 0,
                    avgSaleValue: 0,
                  }
                }
                previous={
                  previousBy.get(s.id) ?? {
                    shopperId: s.id,
                    revenue: 0,
                    margin: 0,
                    salesCount: 0,
                    marginPct: 0,
                    avgSaleValue: 0,
                  }
                }
                pending={pendingBy.get(s.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---- Top clients per shopper ---- */}
      {sellingShoppers.length > 0 && (
        <section>
          <TopClientsSection
            sellingShoppers={sellingShoppers}
            topClientsByShopper={topClientsByShopper}
          />
        </section>
      )}

      {/* ---- New vs repeat split ---- */}
      {sellingShoppers.length > 0 && (
        <section>
          <NewVsRepeatSection
            sellingShoppers={sellingShoppers}
            newVsRepeat={newVsRepeat}
          />
        </section>
      )}
    </div>
  );
}
