import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllXeroContacts } from "@/lib/xero-contacts-cache";
import { searchBuyers } from "@/lib/search";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
 * GET /api/xero/contacts/buyers
 *
 * Make-Style Fuzzy Search for Buyer/Customer Contacts
 *
 * This endpoint:
 * 1. Fetches ALL Xero contacts (cached for 10 min)
 * 2. Performs local multi-field fuzzy search
 * 3. Classifies contacts as buyers using intelligent rules
 * 4. Returns top 15 ranked results
 *
 * NO Xero API filtering - all matching happens locally.
 * This matches and exceeds Make.com search quality.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.info("XERO_CONTACTS", "Buyer search API route started");

  // 0. Rate limiting
  const rateLimitResponse = withRateLimit(request, RATE_LIMITS.contacts);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // 1. Authenticate user
    const { userId } = await auth();
    logger.info("XERO_CONTACTS", "Buyer search request", {
      userId: userId || "NOT AUTHENTICATED",
    });

    if (!userId) {
      logger.error("XERO_CONTACTS", "Unauthorized buyer search request");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    // 2. Get search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    logger.info("XERO_CONTACTS", "Buyer search query received", { query });

    if (!query || query.length < 2) {
      logger.info("XERO_CONTACTS", "Query too short, returning empty", {
        queryLength: query?.length || 0,
      });
      return NextResponse.json({ contacts: [] });
    }

    logger.info("XERO_CONTACTS", "Searching for buyers", { query, userId });

    // 3. Get all contacts from cache (or fetch if needed)
    let allContacts;
    try {
      allContacts = await getAllXeroContacts(userId);
      logger.info("XERO_CONTACTS", "Loaded contacts from cache", {
        count: allContacts.length,
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : undefined;

      logger.error("XERO_CONTACTS", "Failed to fetch contacts", {
        message: errorMessage,
        stack: errorStack,
        name: errorName,
        type: typeof error,
      });

      // Check if it's an auth error
      if (errorMessage && (errorMessage.includes("Xero") || errorMessage.includes("token") || errorMessage.includes("not connected"))) {
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
        { error: "Failed to fetch contacts", details: errorMessage },
        { status: 500 }
      );
    }

    // 4. Perform Make-style fuzzy search with buyer classification
    const searchStartTime = Date.now();
    const results = searchBuyers(query, allContacts, 15);
    const searchDuration = Date.now() - searchStartTime;

    logger.info("XERO_CONTACTS", "Fuzzy search completed", {
      duration: searchDuration,
      resultCount: results.length,
    });

    // 5. Log detailed match information
    if (results.length > 0) {
      logger.info("XERO_CONTACTS", "Top buyer matches found", {
        topMatches: results.slice(0, 5).map((result, idx) => ({
          rank: idx + 1,
          name: result.contact.name,
          score: result.score,
          field: result.matchedField,
        })),
      });
    } else {
      logger.info("XERO_CONTACTS", "No buyer matches found", { query });
    }

    // 6. Convert to UI format
    const contacts: NormalizedContact[] = results.map((result) => ({
      contactId: result.contact.contactId,
      name: result.contact.name,
      email: result.contact.email,
      isCustomer: result.contact.isCustomer,
      isSupplier: result.contact.isSupplier,
    }));

    const totalDuration = Date.now() - startTime;
    logger.info("XERO_CONTACTS", "Returning buyer contacts", {
      count: contacts.length,
      duration: totalDuration,
    });

    return NextResponse.json({ contacts });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : undefined;

    logger.error("XERO_CONTACTS", "Fatal error in buyer search", {
      message: errorMessage,
      stack: errorStack,
      name: errorName,
      type: typeof error,
    });

    return NextResponse.json(
      { error: "Internal server error", details: errorMessage },
      { status: 500 }
    );
  }
}
