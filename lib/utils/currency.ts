/**
 * Currency Utility Functions
 *
 * CRITICAL: Use these functions for ALL money calculations to prevent
 * JavaScript floating point precision errors.
 *
 * Without rounding, calculations like 25000 * 0.99999... produce
 * values like 24999.96 instead of 25000.00.
 *
 * These utilities ensure all currency values are properly rounded
 * to 2 decimal places.
 */

/**
 * Round a number to 2 decimal places for currency.
 * Use this for ALL money calculations to prevent floating point errors.
 *
 * @param value - The number to round
 * @returns Number rounded to 2 decimal places
 */
export function roundCurrency(value: number | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

/**
 * Safely multiply currency values
 *
 * @param a - First number
 * @param b - Second number
 * @returns Product rounded to 2 decimal places
 */
export function multiplyCurrency(a: number, b: number): number {
  return Math.round(a * b * 100) / 100;
}

/**
 * Safely divide currency values
 *
 * @param a - Dividend
 * @param b - Divisor
 * @returns Quotient rounded to 2 decimal places, or 0 if divisor is 0
 */
export function divideCurrency(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.round((a / b) * 100) / 100;
}

/**
 * Safely add currency values
 *
 * @param values - Numbers to add
 * @returns Sum rounded to 2 decimal places
 */
export function addCurrency(...values: (number | null | undefined)[]): number {
  const sum = values.reduce<number>((acc, val) => acc + (val || 0), 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Safely subtract currency values
 *
 * @param a - Number to subtract from
 * @param b - Number to subtract
 * @returns Difference rounded to 2 decimal places
 */
export function subtractCurrency(a: number, b: number): number {
  return Math.round((a - b) * 100) / 100;
}

/**
 * Calculate percentage of a currency value
 *
 * @param amount - The base amount
 * @param percentage - The percentage (e.g., 20 for 20%)
 * @returns The percentage amount rounded to 2 decimal places
 */
export function percentOfCurrency(amount: number, percentage: number): number {
  return Math.round(amount * (percentage / 100) * 100) / 100;
}
