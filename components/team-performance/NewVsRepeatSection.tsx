/**
 * New vs repeat client split per shopper, count + margin. Computed live
 * via `MIN(sale_date) per buyer_id` — see lib/queries/team-performance.ts
 * for the rationale (the `is_new_client` flag is unreliable historically).
 */

import type {
  SellingShopper,
  NewVsRepeatRow,
} from "@/lib/queries/team-performance";

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;

interface Props {
  sellingShoppers: SellingShopper[];
  newVsRepeat: NewVsRepeatRow[];
}

export function NewVsRepeatSection({ sellingShoppers, newVsRepeat }: Props) {
  const byShopper = new Map(newVsRepeat.map((r) => [r.shopperId, r]));

  return (
    <div>
      <h2 className="font-serif text-xl text-club19-navy mb-4">
        New vs repeat clients
      </h2>
      <div
        className={`grid gap-4 ${
          sellingShoppers.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
        }`}
      >
        {sellingShoppers.map((s) => {
          const r = byShopper.get(s.id);
          const newCount = r?.newCount ?? 0;
          const newMargin = r?.newMargin ?? 0;
          const repeatCount = r?.repeatCount ?? 0;
          const repeatMargin = r?.repeatMargin ?? 0;
          const totalCount = newCount + repeatCount;
          const newPct = totalCount > 0 ? (newCount / totalCount) * 100 : 0;

          return (
            <div
              key={s.id}
              className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle"
            >
              <h3 className="font-serif text-lg text-club19-navy">{s.name}</h3>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-club19-taupe">
                    New
                  </p>
                  <p className="mt-1 font-serif text-2xl text-club19-navy">
                    {newCount}
                  </p>
                  <p className="text-xs text-club19-taupe">
                    {fmtCurrency(newMargin)} margin
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-club19-taupe">
                    Repeat
                  </p>
                  <p className="mt-1 font-serif text-2xl text-club19-navy">
                    {repeatCount}
                  </p>
                  <p className="text-xs text-club19-taupe">
                    {fmtCurrency(repeatMargin)} margin
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-club19-cream">
                  <div
                    className="h-full bg-club19-navy"
                    style={{ width: `${newPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-club19-taupe">
                  {totalCount === 0
                    ? "No sales in this period"
                    : `${newPct.toFixed(0)}% new`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
