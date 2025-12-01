/**
 * Xero Contacts Cache with Pagination
 *
 * This module fetches ALL contacts from Xero using pagination,
 * then caches them in memory for 10 minutes to avoid repeated API calls.
 *
 * This enables fast local fuzzy searching without hitting Xero API limits.
 */

import { getValidTokens } from "./xero-auth";
import { ExtendedContact, ContactPerson } from "./search";

interface XeroContactPerson {
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
}

interface XeroContactFromAPI {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  AccountNumber?: string;
  ContactNumber?: string;
  IsCustomer: boolean;
  IsSupplier: boolean;
  Purchases?: {
    DefaultAccountCode?: string;
  };
  Sales?: {
    DefaultAccountCode?: string;
  };
  ContactPersons?: XeroContactPerson[];
}

interface XeroContactsResponse {
  Contacts: XeroContactFromAPI[];
}

interface CacheEntry {
  contacts: ExtendedContact[];
  fetchedAt: number;
  userId: string;
}

// In-memory cache: userId -> CacheEntry
const contactsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Normalize Xero API contact to ExtendedContact format
 */
function normalizeContact(xeroContact: XeroContactFromAPI): ExtendedContact {
  const contactPersons: ContactPerson[] =
    xeroContact.ContactPersons?.map((person) => ({
      firstName: person.FirstName,
      lastName: person.LastName,
      email: person.EmailAddress,
    })) || [];

  return {
    contactId: xeroContact.ContactID,
    name: xeroContact.Name,
    email: xeroContact.EmailAddress,
    accountNumber: xeroContact.AccountNumber,
    reference: xeroContact.ContactNumber,
    isCustomer: xeroContact.IsCustomer,
    isSupplier: xeroContact.IsSupplier,
    defaultPurchaseCode: xeroContact.Purchases?.DefaultAccountCode,
    defaultSalesCode: xeroContact.Sales?.DefaultAccountCode,
    contactPersons: contactPersons.length > 0 ? contactPersons : undefined,
  };
}

/**
 * Fetch all contacts from Xero with pagination
 *
 * Iterates through all pages until no more contacts are returned.
 * This is the foundation for Make-style local searching.
 */
async function fetchAllContactsFromXero(userId: string): Promise<ExtendedContact[]> {
  const startTime = Date.now();
  console.log("[XERO CACHE] === Fetching ALL contacts from Xero ===");

  // Get valid OAuth tokens
  let accessToken: string;
  let tenantId: string;

  try {
    const tokens = await getValidTokens(userId);
    accessToken = tokens.accessToken;
    tenantId = tokens.tenantId;
    console.log(`[XERO CACHE] ✓ Valid tokens obtained for tenant: ${tenantId}`);
  } catch (error: any) {
    console.error("[XERO CACHE] ❌ Failed to get tokens:", error.message);
    throw error;
  }

  const allContacts: ExtendedContact[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Contacts?page=${page}`;
    console.log(`[XERO CACHE] Fetching page ${page}...`);

    const response = await fetch(xeroUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-tenant-id": tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[XERO CACHE] ❌ Xero API error on page ${page}:`, {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Xero API error: ${response.status} - ${errorText}`);
    }

    const data: XeroContactsResponse = await response.json();
    const contacts = data.Contacts || [];

    console.log(`[XERO CACHE] Page ${page}: ${contacts.length} contacts`);

    if (contacts.length === 0) {
      hasMorePages = false;
    } else {
      // Normalize and add to collection
      const normalized = contacts.map(normalizeContact);
      allContacts.push(...normalized);
      page++;
    }

    // Safety limit: max 100 pages (10,000 contacts)
    if (page > 100) {
      console.warn("[XERO CACHE] ⚠️ Reached page limit (100), stopping pagination");
      hasMorePages = false;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[XERO CACHE] ✓✓✓ Fetched ${allContacts.length} total contacts in ${duration}ms`);

  return allContacts;
}

/**
 * Get all Xero contacts (cached)
 *
 * Returns cached contacts if available and fresh (< 10 minutes old).
 * Otherwise, fetches fresh data from Xero API with pagination.
 *
 * @param userId - Clerk user ID for authentication
 * @returns Array of all Xero contacts
 */
export async function getAllXeroContacts(userId: string): Promise<ExtendedContact[]> {
  const now = Date.now();

  // Check cache
  const cached = contactsCache.get(userId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const age = Math.round((now - cached.fetchedAt) / 1000);
    console.log(`[XERO CACHE] ✓ Using cached contacts (${cached.contacts.length} contacts, ${age}s old)`);
    return cached.contacts;
  }

  // Cache miss or expired - fetch fresh data
  console.log("[XERO CACHE] Cache miss or expired, fetching fresh data...");
  const contacts = await fetchAllContactsFromXero(userId);

  // Store in cache
  contactsCache.set(userId, {
    contacts,
    fetchedAt: now,
    userId,
  });

  return contacts;
}

/**
 * Clear cache for a specific user (useful for testing or manual refresh)
 */
export function clearContactsCache(userId: string): void {
  contactsCache.delete(userId);
  console.log(`[XERO CACHE] Cleared cache for user: ${userId}`);
}

/**
 * Clear all caches (useful for testing)
 */
export function clearAllContactsCaches(): void {
  contactsCache.clear();
  console.log("[XERO CACHE] Cleared all caches");
}
