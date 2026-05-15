/**
 * Per-shopper rollup card. Identical visual treatment for every shopper
 * — no leaderboard, no rank, no star icons per Brief 3.
 */

import { DeltaPill } from "@/lib/trend";
import type {
  ShopperHeadline,
  PendingCompletionRow,
  SellingShopper,
} from "@/lib/queries/team-performance";

interface Props {
  shopper: SellingShopper;
  current: ShopperHeadline;
  previous: ShopperHeadline;
  pending: PendingCompletionRow | undefined;
}

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function ShopperPerformanceCard({
  shopper,
  current,
  previous,
  pending,
}: Props) {
  const rows: { label: string; value: string; delta: React.ReactNode }[] = [
    {
      label: "Revenue",
      value: fmtCurrency(current.revenue),
      delta: (
        <DeltaPill
          current={current.revenue}
          previous={previous.revenue}
          format="currency"
        />
      ),
    },
    {
      label: "Margin",
      value: fmtCurrency(current.margin),
      delta: (
        <DeltaPill
          current={current.margin}
          previous={previous.margin}
          format="currency"
        />
      ),
    },
    {
      label: "Margin %",
      value: fmtPct(current.marginPct),
      delta: (
        <DeltaPill
          current={current.marginPct}
          previous={previous.marginPct}
          format="percentPoints"
        />
      ),
    },
    {
      label: "Sales",
      value: current.salesCount.toString(),
      delta: (
        <DeltaPill
          current={current.salesCount}
          previous={previous.salesCount}
          format="integer"
        />
      ),
    },
    {
      label: "Avg sale",
      value: fmtCurrency(current.avgSaleValue),
      delta: (
        <DeltaPill
          current={current.avgSaleValue}
          previous={previous.avgSaleValue}
          format="currency"
        />
      ),
    },
  ];

  return (
    <div className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle">
      <h3 className="font-serif text-lg text-club19-navy">{shopper.name}</h3>
      <p className="text-xs uppercase tracking-wide text-club19-taupe">
        {shopper.role}
      </p>

      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs uppercase tracking-wide text-club19-taupe">
              {r.label}
            </dt>
            <dd className="text-right">
              <div className="font-serif text-lg text-club19-navy">{r.value}</div>
              <div>{r.delta}</div>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-club19-warmgrey pt-3 text-xs text-club19-taupe">
        {pending && pending.count > 0
          ? `${pending.count} ${pending.count === 1 ? "sale" : "sales"} pending completion`
          : "No sales pending completion"}
      </div>
    </div>
  );
}
