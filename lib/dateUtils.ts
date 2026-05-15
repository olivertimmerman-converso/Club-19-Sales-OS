/**
 * Club 19 Sales OS - Date Utility Functions
 *
 * Helper functions for month filtering and date ranges
 */

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get date range for a month filter value
 * @param monthParam - URL param value ("current", "last", "2025-01", or null for all time)
 * @returns DateRange or null for all time
 */
export function getMonthDateRange(monthParam: string | null): DateRange | null {
  if (!monthParam || monthParam === "all") {
    return null; // No filter - all time
  }

  const now = new Date();
  let year: number;
  let month: number;

  if (monthParam === "current") {
    year = now.getFullYear();
    month = now.getMonth();
  } else if (monthParam === "last") {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    year = lastMonth.getFullYear();
    month = lastMonth.getMonth();
  } else {
    // Format: "2025-01"
    const [yearStr, monthStr] = monthParam.split("-");
    year = parseInt(yearStr, 10);
    month = parseInt(monthStr, 10) - 1; // JavaScript months are 0-indexed
  }

  // Start of month: first day at 00:00:00
  const start = new Date(year, month, 1, 0, 0, 0, 0);

  // End of month: last day at 23:59:59
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Format a month param into a human-readable label
 * @param monthParam - URL param value
 * @returns Formatted label
 */
export function formatMonthLabel(monthParam: string | null): string {
  if (!monthParam || monthParam === "all") {
    return "All Time";
  }

  if (monthParam === "current") {
    return "This Month";
  }

  if (monthParam === "last") {
    return "Last Month";
  }

  // Format: "2025-01"
  const [yearStr, monthStr] = monthParam.split("-");
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);

  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Check if a date falls within a date range
 * @param date - Date to check
 * @param range - DateRange or null for no filter
 * @returns boolean
 */
export function isDateInRange(
  date: Date | string | null | undefined,
  range: DateRange | null
): boolean {
  if (!date) return false;
  if (!range) return true; // No filter - include all

  const checkDate = typeof date === "string" ? new Date(date) : date;

  return checkDate >= range.start && checkDate <= range.end;
}

// ============================================================================
// Period scoping (Team Performance dashboard — Brief 3, May 2026)
// ============================================================================

/** Period identifiers used by the Team Performance period picker. */
export type PeriodKey =
  | "this_month"
  | "last_month"
  | "qtd"
  | "ytd"
  | "last_12"
  | "custom";

/**
 * Resolve a period key (and optional custom range) into a concrete
 * {start, end} pair plus the equivalent prior period for delta comparison.
 *
 * Prior-period rule:
 *   - this_month  → last full calendar month
 *   - last_month  → the month before last_month
 *   - qtd         → same-length window immediately preceding the QTD start
 *   - ytd         → same-length window immediately preceding 1 Jan
 *   - last_12     → the 12 months before that (i.e. 24 → 12 months ago)
 *   - custom      → same-length window immediately preceding the custom start
 *
 * `customStart`/`customEnd` are ISO date strings (YYYY-MM-DD) — only used
 * when `period === "custom"`. Invalid input falls back to "this_month".
 */
export function getPeriodDateRange(
  period: PeriodKey,
  customStart?: string | null,
  customEnd?: string | null
): { current: DateRange; previous: DateRange; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const spanMs = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - spanMs);
      return {
        current: { start, end },
        previous: { start: prevStart, end: prevEnd },
        label: `${start.toLocaleDateString("en-GB")} – ${end.toLocaleDateString("en-GB")}`,
      };
    }
    // Bad input — fall through to this_month
  }

  if (period === "last_month") {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const prevStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
    const prevEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);
    return {
      current: { start, end },
      previous: { start: prevStart, end: prevEnd },
      label: "Last month",
    };
  }

  if (period === "qtd") {
    const quarterStartMonth = month - (month % 3);
    const start = new Date(year, quarterStartMonth, 1, 0, 0, 0, 0);
    const end = new Date(year, month, now.getDate(), 23, 59, 59, 999);
    const spanMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - spanMs);
    return {
      current: { start, end },
      previous: { start: prevStart, end: prevEnd },
      label: "Quarter to date",
    };
  }

  if (period === "ytd") {
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, month, now.getDate(), 23, 59, 59, 999);
    const spanMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - spanMs);
    return {
      current: { start, end },
      previous: { start: prevStart, end: prevEnd },
      label: "Year to date",
    };
  }

  if (period === "last_12") {
    // 12 calendar months ending at end of current month.
    const start = new Date(year, month - 11, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const prevStart = new Date(year, month - 23, 1, 0, 0, 0, 0);
    const prevEnd = new Date(year, month - 11, 0, 23, 59, 59, 999);
    return {
      current: { start, end },
      previous: { start: prevStart, end: prevEnd },
      label: "Last 12 months",
    };
  }

  // Default: this_month
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const prevStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const prevEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return {
    current: { start, end },
    previous: { start: prevStart, end: prevEnd },
    label: "This month",
  };
}

/**
 * Parse `period` URL param, normalising unknown strings to "this_month".
 */
export function parsePeriodParam(raw: string | null | undefined): PeriodKey {
  switch (raw) {
    case "this_month":
    case "last_month":
    case "qtd":
    case "ytd":
    case "last_12":
    case "custom":
      return raw;
    default:
      return "this_month";
  }
}
