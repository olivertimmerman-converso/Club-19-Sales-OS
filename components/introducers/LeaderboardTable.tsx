"use client";

/**
 * Per-introducer leaderboard. Client component so column-header clicks can
 * resort without a round-trip. Default sort: Revenue desc. The synthetic
 * "(Unlinked)" row aggregates every sale with `introducer_id` null but
 * `introducer_name` populated — it always sorts alongside the curated rows
 * (no special last-row pinning) and is rendered italicised so its
 * composite nature is visible.
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { IntroducerRow } from "@/lib/queries/introducer-performance";

type SortKey =
  | "name"
  | "salesCount"
  | "revenue"
  | "avgSaleValue"
  | "grossMargin"
  | "avgMarginPct"
  | "fees"
  | "netMargin"
  | "netMarginPct"
  | "lastSaleDate";

interface Props {
  rows: IntroducerRow[];
}

const fmtCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtCount = (n: number) => n.toLocaleString("en-GB");
const fmtDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export function LeaderboardTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Date → ms; null sorts last regardless of direction.
      const toNumeric = (v: typeof av): number | null => {
        if (v == null) return null;
        if (v instanceof Date) return v.getTime();
        if (typeof v === "number") return v;
        return null;
      };
      if (sortKey === "name") {
        const cmp = (a.name || "").localeCompare(b.name || "");
        return sortDir === "asc" ? cmp : -cmp;
      }
      const an = toNumeric(av);
      const bn = toNumeric(bv);
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(next);
      // Numeric columns default to desc (biggest first); name defaults to asc.
      setSortDir(next === "name" ? "asc" : "desc");
    }
  }

  const headers: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "name", label: "Introducer", align: "left" },
    { key: "salesCount", label: "Sales", align: "right" },
    { key: "revenue", label: "Revenue", align: "right" },
    { key: "avgSaleValue", label: "Avg sale value", align: "right" },
    { key: "grossMargin", label: "Gross margin", align: "right" },
    { key: "avgMarginPct", label: "Avg margin %", align: "right" },
    { key: "fees", label: "Fees paid", align: "right" },
    { key: "netMargin", label: "Net margin", align: "right" },
    { key: "netMarginPct", label: "Net margin %", align: "right" },
    { key: "lastSaleDate", label: "Last sale", align: "right" },
  ];

  return (
    <div className="rounded-xl border border-club19-warmgrey bg-white shadow-subtle">
      <div className="border-b border-club19-warmgrey px-5 py-4">
        <h2 className="font-serif text-xl text-club19-navy">
          Per-introducer leaderboard
        </h2>
        <p className="text-xs text-club19-taupe">
          {sorted.length === 0
            ? "No introducer sales in this period."
            : `${sorted.length} introducer${sorted.length === 1 ? "" : "s"} active in period · click any column to re-sort`}
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-club19-cream text-club19-navy">
              <tr>
                {headers.map((h) => {
                  const active = sortKey === h.key;
                  const Icon =
                    !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={h.key}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${
                        h.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(h.key)}
                        className={`inline-flex items-center gap-1 hover:text-club19-navy-light ${
                          h.align === "right" ? "ml-auto" : ""
                        }`}
                      >
                        <span>{h.label}</span>
                        <Icon
                          className={`h-3 w-3 ${
                            active ? "text-club19-navy" : "text-club19-taupe"
                          }`}
                        />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-club19-warmgrey/40">
              {sorted.map((row) => {
                const rowKey = row.introducerId ?? "unlinked";
                const nameClass = row.isUnlinked
                  ? "italic text-club19-taupe"
                  : "text-club19-navy";
                return (
                  <tr key={rowKey} className="hover:bg-club19-cream/50">
                    <td className={`px-4 py-2.5 whitespace-nowrap ${nameClass}`}>
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtCount(row.salesCount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtCurrency(row.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtCurrency(row.avgSaleValue)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtCurrency(row.grossMargin)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtPct(row.avgMarginPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtCurrency(row.fees)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtCurrency(row.netMargin)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy tabular-nums">
                      {fmtPct(row.netMarginPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-club19-navy whitespace-nowrap">
                      {fmtDate(row.lastSaleDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
