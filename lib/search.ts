/**
 * Make-Style Fuzzy Search Engine for Xero Contacts
 *
 * This module implements intelligent multi-field search that matches and exceeds
 * the search quality historically provided by Make.com webhooks.
 *
 * Key Features:
 * - Multi-field searching (name, email, account number, contact persons)
 * - Fuzzy matching with Levenshtein distance
 * - Smart scoring with boosts for exact matches, starts-with, word boundaries
 * - Multi-token matching ("car lo" finds "Caroline Looney")
 * - Proper buyer/supplier classification
 */

export interface ContactPerson {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface ExtendedContact {
  contactId: string;
  name: string;
  email?: string;
  accountNumber?: string;
  reference?: string;
  isCustomer: boolean;
  isSupplier: boolean;
  defaultPurchaseCode?: string;
  defaultSalesCode?: string;
  contactPersons?: ContactPerson[];
}

export interface ScoredResult {
  contact: ExtendedContact;
  score: number;
  matchedField: string;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching tolerance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
      }
    }
  }

  return dp[m][n];
}

/**
 * Score a single field against the query
 * Returns 0-100 score based on match quality
 */
function scoreField(query: string, fieldValue: string | undefined): number {
  if (!fieldValue || !query) return 0;

  const normalizedQuery = query.toLowerCase().trim();
  const normalizedField = fieldValue.toLowerCase().trim();

  if (normalizedField.length === 0) return 0;

  // Exact match - highest score
  if (normalizedField === normalizedQuery) {
    return 100;
  }

  // Starts with query - very high score
  if (normalizedField.startsWith(normalizedQuery)) {
    return 90;
  }

  // Contains query as substring - high score
  if (normalizedField.includes(normalizedQuery)) {
    // Bonus if it's a word boundary match
    const wordBoundaryMatch = new RegExp(`\\b${normalizedQuery}`, "i").test(normalizedField);
    return wordBoundaryMatch ? 80 : 70;
  }

  // Multi-token matching: "car lo" matches "Caroline Looney"
  const queryTokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);
  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every((token) => normalizedField.includes(token));
    if (allTokensMatch) {
      return 75;
    }
  }

  // Fuzzy match using Levenshtein distance
  const maxDistance = Math.floor(normalizedQuery.length * 0.3); // Allow 30% error
  const distance = levenshteinDistance(normalizedQuery, normalizedField.substring(0, normalizedQuery.length + 5));

  if (distance <= maxDistance) {
    // Score inversely proportional to distance
    return Math.max(50 - distance * 10, 20);
  }

  return 0;
}

/**
 * Search contacts using Make-style multi-field fuzzy matching
 *
 * Searches across:
 * - name
 * - email
 * - accountNumber
 * - reference
 * - contactPersons (firstName, lastName, email)
 *
 * Returns scored and ranked results
 */
export function searchContacts(query: string, contacts: ExtendedContact[]): ScoredResult[] {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const results: ScoredResult[] = [];

  for (const contact of contacts) {
    let bestScore = 0;
    let matchedField = "";

    // Score against primary fields
    const nameScore = scoreField(query, contact.name);
    if (nameScore > bestScore) {
      bestScore = nameScore;
      matchedField = "name";
    }

    const emailScore = scoreField(query, contact.email);
    if (emailScore > bestScore) {
      bestScore = emailScore;
      matchedField = "email";
    }

    const accountNumberScore = scoreField(query, contact.accountNumber);
    if (accountNumberScore > bestScore) {
      bestScore = accountNumberScore;
      matchedField = "accountNumber";
    }

    const referenceScore = scoreField(query, contact.reference);
    if (referenceScore > bestScore) {
      bestScore = referenceScore;
      matchedField = "reference";
    }

    // Score against contact persons
    if (contact.contactPersons && contact.contactPersons.length > 0) {
      for (const person of contact.contactPersons) {
        const firstNameScore = scoreField(query, person.firstName);
        if (firstNameScore > bestScore) {
          bestScore = firstNameScore;
          matchedField = "contactPerson.firstName";
        }

        const lastNameScore = scoreField(query, person.lastName);
        if (lastNameScore > bestScore) {
          bestScore = lastNameScore;
          matchedField = "contactPerson.lastName";
        }

        const personEmailScore = scoreField(query, person.email);
        if (personEmailScore > bestScore) {
          bestScore = personEmailScore;
          matchedField = "contactPerson.email";
        }

        // Full name matching
        if (person.firstName && person.lastName) {
          const fullName = `${person.firstName} ${person.lastName}`;
          const fullNameScore = scoreField(query, fullName);
          if (fullNameScore > bestScore) {
            bestScore = fullNameScore;
            matchedField = "contactPerson.fullName";
          }
        }
      }
    }

    // Only include results with meaningful scores (threshold: 20)
    if (bestScore >= 20) {
      results.push({
        contact,
        score: bestScore,
        matchedField,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Classify contact as Buyer/Customer
 *
 * A contact is a BUYER if:
 * - isCustomer == true, OR
 * - defaultSalesCode is set (has sales account configured)
 *
 * This is more reliable than relying solely on Xero's IsCustomer flag
 */
export function isBuyer(contact: ExtendedContact): boolean {
  return contact.isCustomer || (contact.defaultSalesCode != null && contact.defaultSalesCode !== "");
}

/**
 * Classify contact as Supplier/Vendor
 *
 * A contact is a SUPPLIER if:
 * - isSupplier == true, OR
 * - defaultPurchaseCode is set (has purchase account configured)
 *
 * This captures genuine suppliers like Harrods with "Spend Money" transactions
 * even if IsSupplier flag is not set
 */
export function isSupplier(contact: ExtendedContact): boolean {
  return contact.isSupplier || (contact.defaultPurchaseCode != null && contact.defaultPurchaseCode !== "");
}

/**
 * Filter and rank buyer contacts
 * Returns top N buyer results
 */
export function searchBuyers(query: string, contacts: ExtendedContact[], limit = 15): ScoredResult[] {
  const allResults = searchContacts(query, contacts);
  const buyerResults = allResults.filter((result) => isBuyer(result.contact));
  return buyerResults.slice(0, limit);
}

/**
 * Filter and rank supplier contacts
 * Returns top N supplier results (strict classification)
 */
export function searchSuppliers(query: string, contacts: ExtendedContact[], limit = 15): ScoredResult[] {
  const allResults = searchContacts(query, contacts);
  const supplierResults = allResults.filter((result) => isSupplier(result.contact));
  return supplierResults.slice(0, limit);
}
