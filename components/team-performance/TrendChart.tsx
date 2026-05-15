"use client";

/**
 * Monthly trend chart — Jan 2026 → current month, one line per shopper.
 *
 * Three visual cues per shopper (per Brief 3 § B.4): colour + dash pattern
 * + point shape. Three lines means three colours hand-picked for the
 * cream `#f5f0eb` page background:
 *   Line 1 — navy   #1c2331 — solid     — filled circle
 *   Line 2 — burgundy #7a2e3a — dashed  — filled square
 *   Line 3 — forest #2f5d50 — dotted    — filled triangle
 *
 * Always shows the full Jan-2026-to-now range regardless of the page's
 * period filter. The metric selector switches between gross margin
 * (default), revenue and commissionable margin without re-fetching.
 */

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type {
  MonthlyShopperPoint,
  SellingShopper,
} from "@/lib/queries/team-performance";

type Metric = "margin" | "revenue" | "commissionableMargin";

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "margin", label: "Gross margin" },
  { value: "revenue", label: "Revenue" },
  { value: "commissionableMargin", label: "Commissionable margin" },
];

type Shape = "circle" | "square" | "triangle" | "diamond";

const LINE_STYLES: { stroke: string; strokeDasharray: string | undefined; shape: Shape }[] = [
  { stroke: "#1c2331", strokeDasharray: undefined, shape: "circle" },
  { stroke: "#7a2e3a", strokeDasharray: "5 5", shape: "square" },
  { stroke: "#2f5d50", strokeDasharray: "2 4", shape: "triangle" },
  // Extra fallbacks if a 4th/5th selling shopper ever appears
  { stroke: "#a89984", strokeDasharray: "8 3 2 3", shape: "diamond" },
  { stroke: "#1c2331", strokeDasharray: "2 6", shape: "circle" },
];

// Recharts `dot` accepts a function returning SVG elements. We hand-render
// circle / square / triangle / diamond per shopper so the chart carries
// three independent visual cues (colour + dash + shape) — readable in
// monochrome printouts and for colour-vision differences.
function makeDotRenderer(shape: Shape, color: string) {
  // Recharts passes a broader prop set; we narrow to the two we need.
  const Dot = (props: unknown) => {
    const { cx, cy } = (props as { cx?: number; cy?: number }) ?? {};
    if (cx == null || cy == null) return null;
    const size = 4;
    if (shape === "square") {
      return (
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          fill={color}
        />
      );
    }
    if (shape === "triangle") {
      return (
        <polygon
          points={`${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`}
          fill={color}
        />
      );
    }
    if (shape === "diamond") {
      return (
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
          fill={color}
        />
      );
    }
    return <circle cx={cx} cy={cy} r={size} fill={color} />;
  };
  Dot.displayName = `Dot${shape}`;
  return Dot;
}

interface Props {
  sellingShoppers: SellingShopper[];
  monthlyTrend: MonthlyShopperPoint[];
  /** Range start (Jan 2026 always, but receive from server to stay in sync). */
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string; // YYYY-MM-DD
}

interface ChartRow {
  yearMonth: string;
  monthLabel: string;
  [shopperKey: string]: string | number;
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

export function TrendChart({
  sellingShoppers,
  monthlyTrend,
  rangeStart,
  rangeEnd,
}: Props) {
  const [metric, setMetric] = useState<Metric>("margin");

  const data: ChartRow[] = useMemo(() => {
    const months = buildMonthList(new Date(rangeStart), new Date(rangeEnd));
    const byMonthShopper = new Map<string, MonthlyShopperPoint>();
    for (const p of monthlyTrend) {
      byMonthShopper.set(`${p.yearMonth}::${p.shopperId}`, p);
    }
    return months.map((ym) => {
      const row: ChartRow = { yearMonth: ym, monthLabel: formatMonthLabel(ym) };
      for (const s of sellingShoppers) {
        const p = byMonthShopper.get(`${ym}::${s.id}`);
        row[s.id] = p ? p[metric] : 0;
      }
      return row;
    });
  }, [sellingShoppers, monthlyTrend, rangeStart, rangeEnd, metric]);

  // Y-axis tick formatter: convert £ to £k
  const yTick = (v: number) =>
    v >= 1000 ? `£${(v / 1000).toFixed(0)}k` : `£${v}`;

  const tooltipFormatter = (value: number, name: string) => [
    `£${Math.round(value).toLocaleString("en-GB")}`,
    sellingShoppers.find((s) => s.id === name)?.name ?? name,
  ];

  return (
    <div className="rounded-xl border border-club19-warmgrey bg-white p-5 shadow-subtle">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-club19-navy">Monthly trend</h2>
          <p className="text-xs text-club19-taupe">
            Jan 2026 to current month, all selling shoppers
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-club19-warmgrey bg-club19-cream p-1">
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
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) =>
                sellingShoppers.find((s) => s.id === value)?.name ?? value
              }
            />
            {sellingShoppers.map((s, idx) => {
              const style = LINE_STYLES[idx % LINE_STYLES.length];
              const DotRenderer = makeDotRenderer(style.shape, style.stroke);
              return (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={s.id}
                  stroke={style.stroke}
                  strokeWidth={2}
                  strokeDasharray={style.strokeDasharray}
                  dot={DotRenderer}
                  activeDot={{ r: 6, fill: style.stroke }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
