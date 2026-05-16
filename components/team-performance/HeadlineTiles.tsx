/**
 * Four headline tiles for the Team Performance page: revenue / margin /
 * sales count / avg margin %. Each with Δ vs the prior period.
 *
 * Stays consistent with the existing dashboards' tile language (label
 * above big number; navy on white card) without adopting MetricCard
 * verbatim, since MetricCard doesn't have a delta slot.
 */

import { DeltaPill } from "@/lib/trend";
import type { HeadlineTotals } from "@/lib/queries/team-performance";

interface Props {
  current: HeadlineTotals;
  previous: HeadlineTotals;
  periodLabel: string;
  noPriorData: boolean;
}

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;

const fmtCount = (n: number) => n.toLocaleString("en-GB");

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function HeadlineTiles({ current, previous, periodLabel, noPriorData }: Props) {
  const tiles = [
    {
      label: "Total revenue",
      value: fmtCurrency(current.revenue),
      delta: (
        <DeltaPill
          current={current.revenue}
          previous={previous.revenue}
          format="currency"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Total margin",
      value: fmtCurrency(current.margin),
      delta: (
        <DeltaPill
          current={current.margin}
          previous={previous.margin}
          format="currency"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Sales count",
      value: fmtCount(current.salesCount),
      delta: (
        <DeltaPill
          current={current.salesCount}
          previous={previous.salesCount}
          format="integer"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Average margin",
      value: fmtPct(current.avgMarginPct),
      delta: (
        <DeltaPill
          current={current.avgMarginPct}
          previous={previous.avgMarginPct}
          format="percentPoints"
          noPriorData={noPriorData}
        />
      ),
    },
  ];

  // When prior is N/A, the "vs ... prior" trailing text would read oddly
  // alongside "no prior data" — drop it for this case.
  const trailingText = noPriorData
    ? null
    : `vs ${periodLabel.toLowerCase()} prior`;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle"
        >
          <p className="text-xs uppercase tracking-wide text-club19-taupe">
            {t.label}
          </p>
          <p className="mt-2 font-serif text-3xl text-club19-navy">
            {t.value}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {t.delta}
            {trailingText && (
              <span className="text-xs text-club19-taupe">{trailingText}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
