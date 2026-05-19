"use client";

/**
 * Channel-wide monthly trend chart for the Introducer Performance page.
 * Single line (the whole channel — not per-introducer; that would crowd
 * the chart). Metric switcher: revenue / net margin after fees / sales
 * count / fees paid. Always anchored at Jan 2026 → current month
 * regardless of the page's period filter (trend view, not period view).
 *
 * Visual conventions mirror Team Performance's TrendChart so the two
 * dashboards read as one family — navy line on cream-grid background.
 */

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { ChannelMonthlyPoint } from "@/lib/queries/introducer-performance";

type Metric = "revenue" | "netMargin" | "salesCount" | "fees";

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "revenue", label: "Revenue introduced" },
  { value: "netMargin", label: "Net margin after fees" },
  { value: "salesCount", label: "Sales count" },
  { value: "fees", label: "Fees paid" },
];

interface Props {
  monthlyTrend: ChannelMonthlyPoint[];
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD
}

interface ChartRow {
  yearMonth: string;
  monthLabel: string;
  value: number;
}

function buildMonthList(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    out.push(ym);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

export function TrendChart({ monthlyTrend, rangeStart, rangeEnd }: Props) {
  const [metric, setMetric] = useState<Metric>("revenue");

  const data: ChartRow[] = useMemo(() => {
    const months = buildMonthList(new Date(rangeStart), new Date(rangeEnd));
    const byMonth = new Map<string, ChannelMonthlyPoint>();
    for (const p of monthlyTrend) byMonth.set(p.yearMonth, p);
    return months.map((ym) => ({
      yearMonth: ym,
      monthLabel: formatMonthLabel(ym),
      value: byMonth.get(ym)?.[metric] ?? 0,
    }));
  }, [monthlyTrend, rangeStart, rangeEnd, metric]);

  // Sales count → integer ticks; otherwise £k formatting.
  const isCurrency = metric !== "salesCount";
  const yTick = (v: number) => {
    if (!isCurrency) return v.toString();
    if (Math.abs(v) >= 1000) return `£${(v / 1000).toFixed(0)}k`;
    return `£${v}`;
  };
  const tooltipFormatter = (value: number): [string, string] => {
    const label = METRIC_OPTIONS.find((o) => o.value === metric)?.label ?? "";
    if (isCurrency) {
      return [`£${Math.round(value).toLocaleString("en-GB")}`, label];
    }
    return [value.toLocaleString("en-GB"), label];
  };

  return (
    <div className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-club19-navy">
            Channel monthly trend
          </h2>
          <p className="text-xs text-club19-taupe">
            Jan 2026 to current month, introducer channel only
          </p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg border border-club19-warmgrey bg-club19-cream p-1">
          {METRIC_OPTIONS.map((o) => {
            const active = metric === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setMetric(o.value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  active
                    ? "bg-club19-navy text-club19-cream"
                    : "text-club19-navy hover:bg-white"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e2db" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 12, fill: "#1c2331" }}
              axisLine={{ stroke: "#a89984" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={yTick}
              tick={{ fontSize: 12, fill: "#1c2331" }}
              axisLine={{ stroke: "#a89984" }}
              tickLine={false}
              width={56}
            />
            <Tooltip
              formatter={tooltipFormatter}
              contentStyle={{
                backgroundColor: "#faf8f5",
                border: "1px solid #e8e2db",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#1c2331", fontWeight: 600 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#1c2331"
              strokeWidth={2}
              dot={{ r: 4, fill: "#1c2331" }}
              activeDot={{ r: 6, fill: "#1c2331" }}
              name="channel"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
