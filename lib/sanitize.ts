/**
 * Club 19 Sales OS - Input Sanitization
 *
 * Sanitizes all user input to prevent XSS, injection attacks, and data corruption.
 * All text fields from forms should pass through these functions before database storage.
 */

/**
 * HTML entities that must be escaped
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Zero-width and invisible characters to remove
 */
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;

/**
 * Dangerous control characters to remove
 */
const CONTROL_CHARS = /[\r\n\t]/g;

/**
 * Escape HTML special characters to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"'\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize a standard string field (brand, category, item_title, etc.)
 *
 * Steps:
 * 1. Trim whitespace
 * 2. Remove zero-width characters
 * 3. Remove control characters (\r \n \t)
 * 4. Collapse multiple spaces to single space
 * 5. Escape HTML entities
 * 6. Return null if empty after sanitization
 *
 * @param input - Raw user input
 * @returns Sanitized string or empty string
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input
    .trim()                           // Remove leading/trailing whitespace
    .replace(ZERO_WIDTH_CHARS, '')    // Remove zero-width characters
    .replace(CONTROL_CHARS, ' ')      // Replace control chars with spaces
    .replace(/\s+/g, ' ')             // Collapse multiple spaces
    .trim();                          // Trim again after collapsing

  // Escape HTML entities
  sanitized = escapeHtml(sanitized);

  return sanitized;
}

/**
 * Sanitize notes/description fields (allows more formatting)
 *
 * Similar to sanitizeString but preserves newlines for readability.
 * Newlines are kept but normalized to \n.
 *
 * @param input - Raw user input for notes
 * @returns Sanitized notes string
 */
export function sanitizeNotes(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input
    .trim()                           // Remove leading/trailing whitespace
    .replace(ZERO_WIDTH_CHARS, '')    // Remove zero-width characters
    .replace(/\r\n/g, '\n')           // Normalize Windows line endings
    .replace(/\r/g, '\n')             // Normalize Mac line endings
    .replace(/\t/g, '  ')             // Replace tabs with 2 spaces
    .replace(/ +/g, ' ')              // Collapse multiple spaces (but not newlines)
    .replace(/\n{3,}/g, '\n\n')       // Max 2 consecutive newlines
    .trim();                          // Trim again

  // Escape HTML entities
  sanitized = escapeHtml(sanitized);

  return sanitized;
}

/**
 * Sanitize optional string fields
 *
 * Returns null if input is empty/whitespace after sanitization.
 * Useful for optional fields that should be null rather than empty string.
 *
 * @param input - Raw user input (may be undefined or null)
 * @returns Sanitized string or null
 */
export function sanitizeOptional(input?: string | null): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const sanitized = sanitizeString(input);
  return sanitized === '' ? null : sanitized;
}

/**
 * Sanitize a contact name (buyer/supplier)
 *
 * More strict than standard string - removes leading/trailing punctuation
 * and ensures it looks like a valid name.
 *
 * @param input - Raw contact name
 * @returns Sanitized contact name
 */
export function sanitizeContactName(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = sanitizeString(input);

  // Remove leading/trailing punctuation (but keep internal punctuation for names like "O'Brien")
  sanitized = sanitized.replace(/^[^\w\s]+|[^\w\s]+$/g, '');

  return sanitized;
}

/**
 * Sanitize a number input (ensures it's a valid number)
 *
 * @param input - Raw number input
 * @returns Parsed number or 0 if invalid
 */
export function sanitizeNumber(input: unknown): number {
  if (typeof input === 'number' && !isNaN(input)) {
    return input;
  }

  if (typeof input === 'string') {
    const parsed = parseFloat(input);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/**
 * Batch sanitize an object's string fields
 *
 * Useful for sanitizing entire payloads.
 *
 * @param obj - Object with string fields
 * @param fields - Array of field names to sanitize
 * @returns New object with sanitized fields
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  obj: T,
  fields: Array<keyof T>
): T {
  const sanitized = { ...obj };

  for (const field of fields) {
    const value = obj[field];
    if (typeof value === 'string') {
      sanitized[field] = sanitizeString(value) as T[keyof T];
    }
  }

  return sanitized;
}
