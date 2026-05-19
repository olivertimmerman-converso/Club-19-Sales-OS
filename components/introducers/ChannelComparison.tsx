/**
 * Channel-vs-direct comparison panel. Two columns side-by-side: the
 * introducer channel (with extra fee/net rows) and direct sales. The
 * point of the panel is to answer "is the introducer channel more or
 * less profitable per sale than direct sales" — same rows on both sides
 * for the metrics that apply, extra rows on the introducer side for the
 * fee economics.
 */

import type { ChannelComparison } from "@/lib/queries/introducer-performance";

interface Props {
  comparison: ChannelComparison;
}

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtCount = (n: number) => n.toLocaleString("en-GB");

function ChannelColumn({
  title,
  subtitle,
  stats,
  accent,
}: {
  title: string;
  subtitle: string;
  stats: ChannelComparison["introducer"];
  accent: "navy" | "taupe";
}) {
  const accentClass =
    accent === "navy" ? "border-club19-navy" : "border-club19-taupe";
  const rows: { label: string; value: string }[] = [
    { label: "Total revenue", value: fmtCurrency(stats.totalRevenue) },
    { label: "Sales count", value: fmtCount(stats.salesCount) },
    { label: "Avg sale value", value: fmtCurrency(stats.avgSaleValue) },
    {
      label: "Avg gross margin per sale",
      value: fmtCurrency(stats.avgGrossMarginPerSale),
    },
    {
      label: "Avg gross margin % per sale",
      value: fmtPct(stats.avgGrossMarginPctPerSale),
    },
  ];
  if (stats.avgFeePerSale != null) {
    rows.push({
      label: "Avg fee paid per sale",
      value: fmtCurrency(stats.avgFeePerSale),
    });
  }
  if (stats.avgNetMarginPerSale != null) {
    rows.push({
      label: "Avg net margin per sale (after fees)",
      value: fmtCurrency(stats.avgNetMarginPerSale),
    });
  }

  return (
    <div
      className={`rounded-xl border-2 ${accentClass} bg-white p-5 shadow-subtle`}
    >
      <div className="mb-3 border-b border-club19-warmgrey/60 pb-3">
        <h3 className="font-serif text-lg text-club19-navy">{title}</h3>
        <p className="text-xs text-club19-taupe">{subtitle}</p>
      </div>
      <dl className="space-y-2.5 text-sm">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-club19-taupe">{r.label}</dt>
            <dd className="font-medium text-club19-navy tabular-nums">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ChannelComparisonPanel({ comparison }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-serif text-xl text-club19-navy">
          Channel vs direct sales
        </h2>
        <p className="text-xs text-club19-taupe">
          Same period, real sales only. Direct = sales with the introducer
          checkbox unticked.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChannelColumn
          title="Introducer channel"
          subtitle="Sales where the wizard introducer checkbox was ticked"
          stats={comparison.introducer}
          accent="navy"
        />
        <ChannelColumn
          title="Direct sales"
          subtitle="Sales with no introducer attached"
          stats={comparison.direct}
          accent="taupe"
        />
      </div>
    </div>
  );
}
