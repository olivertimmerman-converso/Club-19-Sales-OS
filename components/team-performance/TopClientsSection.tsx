/**
 * Side-by-side top-5 clients per shopper, by margin generated in the
 * selected period. Three columns, identical treatment.
 */

import type {
  SellingShopper,
  TopClientRow,
} from "@/lib/queries/team-performance";

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;

interface Props {
  sellingShoppers: SellingShopper[];
  topClientsByShopper: { shopperId: string; rows: TopClientRow[] }[];
}

export function TopClientsSection({
  sellingShoppers,
  topClientsByShopper,
}: Props) {
  const byShopper = new Map(
    topClientsByShopper.map((t) => [t.shopperId, t.rows])
  );

  return (
    <div>
      <h2 className="font-serif text-xl text-club19-navy mb-4">
        Top clients by shopper
      </h2>
      <div
        className={`grid gap-4 ${
          sellingShoppers.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
        }`}
      >
        {sellingShoppers.map((s) => {
          const rows = byShopper.get(s.id) ?? [];
          return (
            <div
              key={s.id}
              className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle"
            >
              <h3 className="font-serif text-lg text-club19-navy">{s.name}</h3>
              {rows.length === 0 ? (
                <p className="mt-3 text-sm text-club19-taupe">
                  No client activity in this period
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-club19-warmgrey">
                  {rows.map((r) => (
                    <li
                      key={r.buyerId}
                      className="flex items-baseline justify-between gap-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-club19-navy">
                          {r.buyerName}
                        </div>
                        <div className="text-xs text-club19-taupe">
                          {r.salesCount} {r.salesCount === 1 ? "sale" : "sales"}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-club19-navy">
                        {fmtCurrency(r.totalMargin)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
