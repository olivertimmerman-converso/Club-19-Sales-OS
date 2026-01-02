import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupplierContacts } from "@/lib/xero-contacts-cache";
import { searchSuppliers } from "@/lib/search";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Request-level search cache (2-minute TTL)
const searchCache = new Map<string, { results: any[], timestamp: number }>();
const SEARCH_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Normalized contact response for UI
 */
interface NormalizedContact {
  contactId: string;
  name: string;
  email?: string;
  isCustomer: boolean;
  isSupplier: boolean;
}

/**
 * GET /api/xero/contacts/suppliers
 *
 * Make-Style Fuzzy Search for Supplier/Vendor Contacts (STRICT MODE)
 *
 * This endpoint:
 * 1. Fetches ALL Xero contacts (cached for 10 min)
 * 2. Performs local multi-field fuzzy search
 * 3. Classifies contacts as suppliers using STRICT rules
 * 4. Returns top 15 ranked supplier results ONLY
 *
 * STRICT CLASSIFICATION:
 * - Only returns contacts with IsSupplier==true OR defaultPurchaseCode set
 * - NO fallback to all contacts
 * - NO mixing buyers with suppliers
 * - Prevents data corruption in Xero ledger
 *
 * NO Xero API filtering - all matching happens locally.
 * This matches and exceeds Make.com search quality.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.info("XERO_CONTACTS", "Supplier search API route started");

  // 0. Rate limiting
  const rateLimitResponse = withRateLimit(request, RATE_LIMITS.contacts);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // 1. Authenticate user
    const { userId } = await auth();
    logger.info("XERO_CONTACTS", "Supplier search request", {
      userId: userId || "NOT AUTHENTICATED",
    });

    if (!userId) {
      logger.error("XERO_CONTACTS", "Unauthorized supplier search request");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    // 2. Get search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    logger.info("XERO_CONTACTS", "Supplier search query received", { query });

    if (!query || query.length < 3) {
      logger.info("XERO_CONTACTS", "Query too short, returning empty", {
        queryLength: query?.length || 0,
      });
      return NextResponse.json({ contacts: [] });
    }

    logger.info("XERO_CONTACTS", "Searching for suppliers", { query, userId });

    // 2.5. Check search cache first
    const cacheKey = `${userId}:${query.toLowerCase()}`;
    const cached = searchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
      const age = Math.round((Date.now() - cached.timestamp) / 1000);
      logger.info("XERO_CONTACTS", "Cache hit for supplier search", {
        age,
        resultCount: cached.results.length,
      });
      return NextResponse.json({ contacts: cached.results });
    }

    // 3. Get supplier contacts from cache (or fetch if needed)
    let supplierContacts;
    try {
      supplierContacts = await getSupplierContacts(userId);
      logger.info("XERO_CONTACTS", "Loaded supplier contacts", {
        count: supplierContacts.length,
      });
    } catch (error: any) {
      logger.error("XERO_CONTACTS", "Failed to fetch contacts", { error });

      // Check if it's an auth error
      if (error.message.includes("Xero") || error.message.includes("token")) {
        return NextResponse.json(
          {
            error: "Xero not connected",
            message: "Please reconnect your Xero account",
            action: "reconnect_xero",
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "Failed to fetch contacts", details: error.message },
        { status: 500 }
      );
    }

    // 4. Perform fast simplified supplier search with STRICT classification
    const searchStartTime = Date.now();

    logger.info("XERO_CONTACTS", "Searching pre-filtered suppliers", {
      supplierCount: supplierContacts.length,
    });

    const results = searchSuppliers(query, supplierContacts, 15);
    const searchDuration = Date.now() - searchStartTime;

    logger.info("XERO_CONTACTS", "Supplier search completed", {
      duration: searchDuration,
      resultCount: results.length,
    });

    // 5. Log detailed match information
    if (results.length > 0) {
      logger.info("XERO_CONTACTS", "Top supplier matches found", {
        topMatches: results.slice(0, 5).map((result, idx) => ({
          rank: idx + 1,
          name: result.contact.name,
          score: result.score,
          field: result.matchedField,
        })),
      });
    } else {
      logger.info("XERO_CONTACTS", "No supplier matches found (strict mode)", {
        query,
      });
    }

    // 6. Convert to UI format
    const contacts: NormalizedContact[] = results.map((result) => ({
      contactId: result.contact.contactId,
      name: result.contact.name,
      email: result.contact.email,
      isCustomer: result.contact.isCustomer,
      isSupplier: result.contact.isSupplier,
    }));

    // 6.5. Write to search cache
    searchCache.set(cacheKey, {
      results: contacts,
      timestamp: Date.now()
    });
    logger.info("XERO_CONTACTS", "Cached supplier search results", {
      count: contacts.length,
      query,
    });

    const totalDuration = Date.now() - startTime;
    logger.info("XERO_CONTACTS", "Returning supplier contacts", {
      count: contacts.length,
      duration: totalDuration,
    });

    return NextResponse.json({ contacts });
  } catch (error: any) {
    logger.error("XERO_CONTACTS", "Fatal error in supplier search", { error });
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
