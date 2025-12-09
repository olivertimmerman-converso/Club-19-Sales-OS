/**
 * Club 19 Sales OS - Formatting Utilities
 *
 * Standardized formatting functions for consistent display across the application
 */

/**
 * Format a number as currency
 *
 * @param amount - The amount to format (can be null/undefined)
 * @param currency - Currency code (default: 'GBP')
 * @returns Formatted currency string (e.g., "£1,234.56")
 *
 * @example
 * formatCurrency(1234.56) // "£1,234.56"
 * formatCurrency(1234.567) // "£1,234.57" (rounds to 2 decimals)
 * formatCurrency(null) // "£0.00"
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "GBP"
): string {
  const safeAmount = amount ?? 0;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

/**
 * Format a date with various format options
 *
 * @param date - Date to format (Date object, ISO string, or timestamp)
 * @param format - Format style: 'short', 'long', 'time', 'datetime', 'iso'
 * @returns Formatted date string
 *
 * @example
 * formatDate(new Date('2025-12-09'), 'short') // "09 Dec 2025"
 * formatDate(new Date('2025-12-09'), 'long') // "9 December 2025"
 * formatDate(new Date('2025-12-09'), 'iso') // "2025-12-09"
 */
export function formatDate(
  date: Date | string | null | undefined,
  format: "short" | "long" | "time" | "datetime" | "iso" = "short"
): string {
  if (!date) return "-";

  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return "-";

  switch (format) {
    case "short":
      // "09 Dec 2025"
      return dateObj.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    case "long":
      // "9 December 2025"
      return dateObj.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    case "time":
      // "14:30"
      return dateObj.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

    case "datetime":
      // "09 Dec 2025, 14:30"
      return `${formatDate(dateObj, "short")}, ${formatDate(dateObj, "time")}`;

    case "iso":
      // "2025-12-09"
      return dateObj.toISOString().split("T")[0];

    default:
      return formatDate(dateObj, "short");
  }
}

/**
 * Format a number as a percentage
 *
 * @param value - The value to format (0-100 scale or 0-1 scale, auto-detected)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "29.5%")
 *
 * @example
 * formatPercentage(29.5) // "29.5%"
 * formatPercentage(0.295) // "29.5%" (auto-detects 0-1 scale)
 * formatPercentage(29.567, 2) // "29.57%"
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined) return "0.0%";

  // Auto-detect scale: if value is between 0-1, assume it's a decimal percentage
  const scaledValue = value > 0 && value < 1 ? value * 100 : value;

  return `${scaledValue.toFixed(decimals)}%`;
}

/**
 * Format a number with thousands separator
 *
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string (e.g., "1,234")
 *
 * @example
 * formatNumber(1234) // "1,234"
 * formatNumber(1234.56, 2) // "1,234.56"
 * formatNumber(null) // "0"
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 0
): string {
  const safeValue = value ?? 0;

  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeValue);
}

/**
 * Format a number compactly (K, M, B suffixes)
 *
 * @param value - The number to format
 * @returns Compact formatted number (e.g., "1.2K", "5.3M")
 *
 * @example
 * formatCompactNumber(1234) // "1.2K"
 * formatCompactNumber(1234567) // "1.2M"
 * formatCompactNumber(1234567890) // "1.2B"
 */
export function formatCompactNumber(value: number | null | undefined): string {
  const safeValue = value ?? 0;

  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(safeValue);
}

/**
 * Format a relative time (e.g., "2 days ago", "in 3 hours")
 *
 * @param date - Date to compare to now
 * @returns Relative time string
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 86400000)) // "1 day ago"
 * formatRelativeTime(new Date(Date.now() + 3600000)) // "in 1 hour"
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (Math.abs(diffDay) > 7) {
    // More than a week: show formatted date
    return formatDate(dateObj, "short");
  }

  if (diffDay !== 0) {
    return diffDay > 0 ? `in ${diffDay} day${diffDay > 1 ? "s" : ""}` : `${Math.abs(diffDay)} day${Math.abs(diffDay) > 1 ? "s" : ""} ago`;
  }

  if (diffHour !== 0) {
    return diffHour > 0 ? `in ${diffHour} hour${diffHour > 1 ? "s" : ""}` : `${Math.abs(diffHour)} hour${Math.abs(diffHour) > 1 ? "s" : ""} ago`;
  }

  if (diffMin !== 0) {
    return diffMin > 0 ? `in ${diffMin} minute${diffMin > 1 ? "s" : ""}` : `${Math.abs(diffMin)} minute${Math.abs(diffMin) > 1 ? "s" : ""} ago`;
  }

  return "just now";
}

/**
 * Truncate text with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 *
 * @example
 * truncateText("Long description here", 10) // "Long desc..."
 */
export function truncateText(
  text: string | null | undefined,
  maxLength: number
): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Capitalize first letter of each word
 *
 * @param text - Text to capitalize
 * @returns Capitalized text
 *
 * @example
 * capitalizeWords("hello world") // "Hello World"
 */
export function capitalizeWords(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
