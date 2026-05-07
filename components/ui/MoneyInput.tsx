"use client";

import { ChangeEvent, FocusEvent } from "react";

/**
 * Single source of truth for monetary (and percentage) text inputs.
 *
 * Replaces `<input type="number">` to remove the native browser spinner —
 * miss-clicks on the spinner arrows or stray Up/Down arrow-key presses
 * silently increment/decrement the value, which is the bug that surfaced
 * as "buy price keeps dropping by £0.01 sometimes".
 *
 * Renders `<input type="text" inputMode="decimal">` for the right mobile
 * keyboard and no spinner. Filters keystrokes so only digits, an optional
 * single decimal point, and optionally a leading minus are accepted —
 * arbitrary other characters (letters, multiple dots, etc.) are silently
 * rejected.
 *
 * `min` and `max` clamp on **blur only** so intermediate keystrokes like
 * "1." or "0.0" aren't fought during typing. Caller's `onBlur` (often
 * doing parseFloat) fires after any blur-time clamp.
 *
 * The component owns its own prefix/suffix wrapper. Don't include
 * left/right padding utilities (`pl-X`, `pr-X`, `px-X`) in `className` —
 * the component sets the appropriate side padding to make room for the
 * prefix/suffix.
 */

export type MoneyInputMode = "money" | "percent";

export interface MoneyInputProps {
  /** Controlled string value — the raw text the user has typed. */
  value: string;
  /** Called with the new string on every accepted keystroke. */
  onChange: (value: string) => void;
  /** Called after blur (and after any auto-clamp to min/max). */
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Clamped on blur only — never blocks typing. */
  min?: number;
  /**
   * Clamped on blur only — never blocks typing.
   * Defaults to 100 when `mode === "percent"`, undefined otherwise.
   */
  max?: number;
  /**
   * Tailwind classes for the `<input>`. Don't include `pl-X` / `pr-X` / `px-X`
   * — the component owns padding to make space for prefix / suffix.
   */
  className?: string;
  id?: string;
  required?: boolean;
  /** Accept a leading `-` for credits/refunds. Default false. */
  allowNegative?: boolean;
  /** "money" → £ prefix; "percent" → % suffix, default max=100. Default: money. */
  mode?: MoneyInputMode;
  "aria-label"?: string;
  autoComplete?: string;
}

const POSITIVE_PATTERN = /^\d*\.?\d*$/;
const SIGNED_PATTERN = /^-?\d*\.?\d*$/;

export function MoneyInput({
  value,
  onChange,
  onBlur,
  placeholder = "0.00",
  disabled = false,
  min,
  max,
  className = "",
  id,
  required,
  allowNegative = false,
  mode = "money",
  "aria-label": ariaLabel,
  autoComplete,
}: MoneyInputProps) {
  const effectiveMax = max ?? (mode === "percent" ? 100 : undefined);
  const pattern = allowNegative ? SIGNED_PATTERN : POSITIVE_PATTERN;
  const paddingClass = mode === "percent" ? "pr-7" : "pl-7";

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next === "" || pattern.test(next)) {
      onChange(next);
    }
    // else: silently reject this keystroke — value stays as-is.
  };

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    // Clamp to min/max on blur. Skip empty/partial inputs ('-', '.') so
    // callers' onBlur handlers can interpret them as "no value".
    const trimmed = value.trim();
    const isPartial =
      trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.";
    if (!isPartial) {
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed)) {
        let clamped = parsed;
        if (min !== undefined && clamped < min) clamped = min;
        if (effectiveMax !== undefined && clamped > effectiveMax) clamped = effectiveMax;
        if (clamped !== parsed) onChange(String(clamped));
      }
    }
    onBlur?.();
  };

  return (
    <div className="relative">
      {mode === "money" && (
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
          £
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        id={id}
        required={required}
        autoComplete={autoComplete ?? "off"}
        aria-label={ariaLabel}
        className={`${paddingClass} ${className}`.trim()}
      />
      {mode === "percent" && (
        <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 pointer-events-none">
          %
        </span>
      )}
    </div>
  );
}
