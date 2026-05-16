/**
 * Shared "delta vs prior period" helper for the Team Performance dashboard
 * (Brief 3, May 2026).
 *
 * Centralises the green-up / red-down rendering that Operations and
 * Superadmin dashboards both inlined as private `getChange()` helpers. Not
 * retrofitted to existing dashboards in this PR — separate cleanup if/when
 * we touch them.
 *
 * Usage:
 *   <DeltaPill current={revenueNow} previous={revenueLast} format="currency" />
 *   <DeltaPill current={countNow} previous={countLast} format="integer" />
 *   <DeltaPill current={pctNow} previous={pctLast} format="percentPoints" />
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type DeltaFormat =
  | "currency"
  | "integer"
  | "percentPoints" // absolute pp difference, e.g. margin %
  | "percentChange"; // signed % change vs prior, e.g. revenue growth

const formatCurrency = (n: number) =>
  `£${Math.round(n).toLocaleString("en-GB")}`;

function describeDelta(
  current: number,
  previous: number | null | undefined,
  format: DeltaFormat,
  noPriorData: boolean
): { sign: "up" | "down" | "flat" | "new" | "no-prior"; label: string } {
  // "no prior data" — the prior period predates the data we have. Distinct
  // from "new" (entity exists, prior was genuinely zero) so the UI doesn't
  // mislabel structural absence as a fresh-arrival signal.
  if (noPriorData) {
    return { sign: "no-prior", label: "no prior data" };
  }

  if (previous == null || previous === 0) {
    if (current === 0) return { sign: "flat", label: "no change" };
    return { sign: "new", label: "new" };
  }

  const absDelta = current - previous;
  const pctDelta = (absDelta / Math.abs(previous)) * 100;

  if (Math.abs(absDelta) < 0.005) return { sign: "flat", label: "no change" };
  const sign: "up" | "down" = absDelta > 0 ? "up" : "down";

  if (format === "currency") {
    return {
      sign,
      label: `${absDelta > 0 ? "+" : "−"}${formatCurrency(Math.abs(absDelta))}`,
    };
  }
  if (format === "integer") {
    return {
      sign,
      label: `${absDelta > 0 ? "+" : "−"}${Math.round(Math.abs(absDelta))}`,
    };
  }
  if (format === "percentPoints") {
    return {
      sign,
      label: `${absDelta > 0 ? "+" : "−"}${Math.abs(absDelta).toFixed(1)}pp`,
    };
  }
  // percentChange
  return {
    sign,
    label: `${pctDelta > 0 ? "+" : "−"}${Math.abs(pctDelta).toFixed(1)}%`,
  };
}

interface DeltaPillProps {
  current: number;
  previous: number | null | undefined;
  format?: DeltaFormat;
  className?: string;
  /**
   * Set true when the prior period predates the data we have (e.g. YTD /
   * Last 12 in a tenant whose data only goes back a few months). The pill
   * renders "no prior data" instead of "new" so the absence reads as
   * structural rather than a fresh-shopper signal.
   */
  noPriorData?: boolean;
}

/**
 * Inline delta indicator: arrow + tinted text, green when current > previous,
 * red when current < previous, neutral grey on flat / "new" / no-prior data.
 *
 * Tiny by design — meant to sit next to a hero number, not below it.
 */
export function DeltaPill({
  current,
  previous,
  format = "currency",
  className = "",
  noPriorData = false,
}: DeltaPillProps) {
  const { sign, label } = describeDelta(current, previous, format, noPriorData);

  const tone =
    sign === "up"
      ? "text-green-700"
      : sign === "down"
        ? "text-red-700"
        : "text-club19-taupe";

  const Icon =
    sign === "up" ? ArrowUpRight : sign === "down" ? ArrowDownRight : Minus;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
