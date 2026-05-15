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
  format: DeltaFormat
): { sign: "up" | "down" | "flat" | "new"; label: string } {
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
}

/**
 * Inline delta indicator: arrow + tinted text, green when current > previous,
 * red when current < previous, neutral grey on flat/no-prior data.
 *
 * Tiny by design — meant to sit next to a hero number, not below it.
 */
export function DeltaPill({
  current,
  previous,
  format = "currency",
  className = "",
}: DeltaPillProps) {
  const { sign, label } = describeDelta(current, previous, format);

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
