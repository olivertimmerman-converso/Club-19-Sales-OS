import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAllXeroContacts } from "@/lib/xero-contacts-cache";
import { searchSuppliers } from "@/lib/search";

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
  console.log("[XERO SUPPLIER SEARCH] === API Route Started ===");

  try {
    // 1. Authenticate user
    const { userId } = await auth();
    console.log(`[XERO SUPPLIER SEARCH] User ID: ${userId || "NOT AUTHENTICATED"}`);

    if (!userId) {
      console.error("[XERO SUPPLIER SEARCH] ❌ Unauthorized request");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    // 2. Get search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    console.log(`[XERO SUPPLIER SEARCH] Query parameter: "${query}"`);

    if (!query || query.length < 2) {
      console.log(`[XERO SUPPLIER SEARCH] Query too short (${query?.length || 0} chars), returning empty`);
      return NextResponse.json({ contacts: [] });
    }

    console.log(`[XERO SUPPLIER SEARCH] Searching for: "${query}" (user: ${userId})`);

    // 3. Get all contacts from cache (or fetch if needed)
    let allContacts;
    try {
      allContacts = await getAllXeroContacts(userId);
      console.log(`[XERO SUPPLIER SEARCH] Loaded ${allContacts.length} total contacts from cache`);
    } catch (error: any) {
      console.error("[XERO SUPPLIER SEARCH] ❌ Failed to fetch contacts:", error.message);

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

    // 4. Perform Make-style fuzzy search with STRICT supplier classification
    const searchStartTime = Date.now();
    const results = searchSuppliers(query, allContacts, 15);
    const searchDuration = Date.now() - searchStartTime;

    console.log(`[XERO SUPPLIER SEARCH] Fuzzy search completed in ${searchDuration}ms`);
    console.log(`[XERO SUPPLIER SEARCH] Supplier-classified results: ${results.length}`);

    // 5. Log detailed match information
    if (results.length > 0) {
      console.log(`[XERO SUPPLIER SEARCH] Top supplier matches:`);
      results.slice(0, 5).forEach((result, idx) => {
        console.log(
          `  ${idx + 1}. "${result.contact.name}" (score: ${result.score}, field: ${result.matchedField})`
        );
      });
    } else {
      console.log(`[XERO SUPPLIER SEARCH] No supplier matches found for query: "${query}"`);
      console.log(`[XERO SUPPLIER SEARCH] Returning empty list (strict mode - no fallback)`);
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
    console.log(`[XERO SUPPLIER SEARCH] ✓✓✓ Returning ${contacts.length} supplier contacts in ${totalDuration}ms`);

    return NextResponse.json({ contacts });
  } catch (error: any) {
    console.error("[XERO SUPPLIER SEARCH] ❌ Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
