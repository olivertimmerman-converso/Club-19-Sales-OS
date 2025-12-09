/**
 * Club 19 Sales OS - Money Display Component
 *
 * Consistent currency formatting across the application
 */

import { formatCurrency } from "@/lib/utils/format";

interface MoneyProps {
  /**
   * Amount to display (can be null/undefined)
   */
  amount: number | null | undefined;

  /**
   * Currency code (default: 'GBP')
   */
  currency?: string;

  /**
   * Text color variant
   */
  color?: "default" | "green" | "red" | "gray" | "muted";

  /**
   * Text size
   */
  size?: "sm" | "base" | "lg" | "xl" | "2xl";

  /**
   * Font weight
   */
  weight?: "normal" | "medium" | "semibold" | "bold";

  /**
   * Additional CSS classes
   */
  className?: string;
}

const colorClasses = {
  default: "text-gray-900",
  green: "text-green-600",
  red: "text-red-600",
  gray: "text-gray-600",
  muted: "text-gray-500",
};

const sizeClasses = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

const weightClasses = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

/**
 * Money component for consistent currency display
 *
 * @example
 * <Money amount={1234.56} />
 * <Money amount={1234.56} color="green" size="lg" weight="semibold" />
 * <Money amount={null} /> // Shows £0.00
 */
export function Money({
  amount,
  currency = "GBP",
  color = "default",
  size = "base",
  weight = "normal",
  className = "",
}: MoneyProps) {
  const colorClass = colorClasses[color];
  const sizeClass = sizeClasses[size];
  const weightClass = weightClasses[weight];

  return (
    <span className={`${colorClass} ${sizeClass} ${weightClass} ${className}`.trim()}>
      {formatCurrency(amount, currency)}
    </span>
  );
}

/**
 * Money with positive/negative color coding
 *
 * @example
 * <SignedMoney amount={1234.56} /> // Green positive
 * <SignedMoney amount={-500} /> // Red negative
 */
export function SignedMoney({
  amount,
  currency = "GBP",
  size = "base",
  weight = "normal",
  className = "",
}: Omit<MoneyProps, "color">) {
  const safeAmount = amount ?? 0;
  const color = safeAmount >= 0 ? "green" : "red";

  return (
    <Money
      amount={amount}
      currency={currency}
      color={color}
      size={size}
      weight={weight}
      className={className}
    />
  );
}

/**
 * Money with change indicator (arrow up/down)
 *
 * @example
 * <MoneyWithChange amount={1234.56} change={5.2} /> // +5.2% with up arrow
 */
export function MoneyWithChange({
  amount,
  change,
  currency = "GBP",
  size = "base",
}: {
  amount: number | null | undefined;
  change: number | null | undefined;
  currency?: string;
  size?: "sm" | "base" | "lg";
}) {
  const safeChange = change ?? 0;
  const isPositive = safeChange >= 0;

  return (
    <div className="flex items-baseline gap-2">
      <Money amount={amount} currency={currency} size={size} weight="semibold" />
      <span
        className={`text-sm ${
          isPositive ? "text-green-600" : "text-red-600"
        } flex items-center gap-1`}
      >
        <span>{isPositive ? "↑" : "↓"}</span>
        <span>{Math.abs(safeChange).toFixed(1)}%</span>
      </span>
    </div>
  );
}
