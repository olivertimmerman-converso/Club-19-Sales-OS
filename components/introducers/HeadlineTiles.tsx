/**
 * Seven headline tiles for the Introducer Performance page. Each renders a
 * big number plus a DeltaPill vs the prior period of equal length. Layout
 * matches Team Performance's HeadlineTiles (label above big number, card
 * shadow, navy on cream) so the visual language stays consistent across
 * management dashboards.
 */

import { DeltaPill } from "@/lib/trend";
import type { ChannelHeadlineTotals } from "@/lib/queries/introducer-performance";

interface Props {
  current: ChannelHeadlineTotals;
  previous: ChannelHeadlineTotals;
  periodLabel: string;
  noPriorData: boolean;
}

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;
const fmtCount = (n: number) => n.toLocaleString("en-GB");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function HeadlineTiles({
  current,
  previous,
  periodLabel,
  noPriorData,
}: Props) {
  const tiles = [
    {
      label: "Active introducers",
      value: fmtCount(current.activeIntroducers),
      delta: (
        <DeltaPill
          current={current.activeIntroducers}
          previous={previous.activeIntroducers}
          format="integer"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Sales introduced",
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
      label: "Revenue introduced",
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
      label: "Introducer fees paid",
      value: fmtCurrency(current.fees),
      delta: (
        <DeltaPill
          current={current.fees}
          previous={previous.fees}
          format="currency"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Gross margin",
      value: fmtCurrency(current.grossMargin),
      delta: (
        <DeltaPill
          current={current.grossMargin}
          previous={previous.grossMargin}
          format="currency"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Net margin after fees",
      value: fmtCurrency(current.netMargin),
      delta: (
        <DeltaPill
          current={current.netMargin}
          previous={previous.netMargin}
          format="currency"
          noPriorData={noPriorData}
        />
      ),
    },
    {
      label: "Channel share",
      value: fmtPct(current.channelShare),
      delta: (
        <DeltaPill
          current={current.channelShare}
          previous={previous.channelShare}
          format="percentPoints"
          noPriorData={noPriorData}
        />
      ),
    },
  ];

  const trailingText = noPriorData
    ? null
    : `vs ${periodLabel.toLowerCase()} prior`;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle"
        >
          <p className="text-xs uppercase tracking-wide text-club19-taupe">
            {t.label}
          </p>
          <p className="mt-2 font-serif text-3xl text-club19-navy">{t.value}</p>
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
