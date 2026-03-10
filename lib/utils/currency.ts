/**
 * Currency Utility Functions
 *
 * CRITICAL: Use these functions for ALL money calculations to prevent
 * JavaScript floating point precision errors.
 *
 * Uses exponential notation (e.g., parseFloat(value + 'e2')) to shift
 * decimal places as STRINGS before rounding, avoiding the classic
 * Math.round(1.005 * 100) = 100 (wrong) floating point bug.
 */

/**
 * Round a number to 2 decimal places for currency using string-based
 * decimal shifting to avoid floating point multiplication errors.
 *
 * Math.round(4999.995 * 100) = 499999 (WRONG - loses a penny)
 * Math.round(parseFloat('4999.995e2')) = 500000 (CORRECT)
 *
 * @param value - The number to round
 * @returns Number rounded to 2 decimal places
 */
export function roundCurrency(value: number | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  return Number(Math.round(parseFloat(value + 'e2')) + 'e-2');
}

/**
 * Safely multiply currency values
 *
 * @param a - First number
 * @param b - Second number
 * @returns Product rounded to 2 decimal places
 */
export function multiplyCurrency(a: number, b: number): number {
  return roundCurrency(a * b);
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
  return roundCurrency(a / b);
}

/**
 * Safely add currency values
 *
 * @param values - Numbers to add
 * @returns Sum rounded to 2 decimal places
 */
export function addCurrency(...values: (number | null | undefined)[]): number {
  const sum = values.reduce<number>((acc, val) => acc + (val || 0), 0);
  return roundCurrency(sum);
}

/**
 * Safely subtract currency values
 *
 * @param a - Number to subtract from
 * @param b - Number to subtract
 * @returns Difference rounded to 2 decimal places
 */
export function subtractCurrency(a: number, b: number): number {
  return roundCurrency(a - b);
}

/**
 * Calculate percentage of a currency value
 *
 * @param amount - The base amount
 * @param percentage - The percentage (e.g., 20 for 20%)
 * @returns The percentage amount rounded to 2 decimal places
 */
export function percentOfCurrency(amount: number, percentage: number): number {
  return roundCurrency(amount * (percentage / 100));
}
