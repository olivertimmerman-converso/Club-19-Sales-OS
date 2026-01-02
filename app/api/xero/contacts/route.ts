import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getValidTokens } from "@/lib/xero-auth";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Xero Contact from API
 */
interface XeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  FirstName?: string;
  LastName?: string;
}

/**
 * GET /api/xero/contacts
 * Search Xero contacts by name
 * Query param: ?query=searchterm
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authenticate user
    const { userId } = await auth();

    if (!userId) {
      logger.error("XERO_CONTACTS", "Unauthorized request");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    // 2. Get search query
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");

    if (!query || query.length < 2) {
      return NextResponse.json({ contacts: [] });
    }

    logger.info("XERO_CONTACTS", "Searching for contacts", { query, userId });

    // 3. Get valid Xero OAuth tokens (auto-refreshes if needed)
    let accessToken: string;
    let tenantId: string;

    try {
      const tokens = await getValidTokens(userId);
      accessToken = tokens.accessToken;
      tenantId = tokens.tenantId;
      logger.info("XERO_CONTACTS", "Valid tokens obtained", { tenantId });
    } catch (error: any) {
      logger.error("XERO_CONTACTS", "Failed to get Xero tokens", { error });
      return NextResponse.json(
        {
          error: "Xero not connected",
          message: error.message,
          action: "connect_xero",
        },
        { status: 401 }
      );
    }

    // 4. Build Xero API URL with where filter
    // Escape double quotes in query to prevent injection
    const sanitizedQuery = query.replace(/"/g, '\\"');
    const whereClause = `Name.Contains("${sanitizedQuery}")`;
    const encodedWhere = encodeURIComponent(whereClause);
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Contacts?where=${encodedWhere}`;

    logger.info("XERO_CONTACTS", "Calling Xero API", { whereClause });

    // 5. Call Xero API
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
      logger.error("XERO_CONTACTS", "Xero API error", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      // Token might be invalid - suggest reconnecting
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            error: "Xero authentication failed",
            message: "Please reconnect your Xero account",
            action: "reconnect_xero",
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "Xero API error", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // 6. Transform Xero contacts to simplified format
    const contacts: XeroContact[] = (data.Contacts || []).map((contact: any) => ({
      Name: contact.Name,
      ContactID: contact.ContactID,
      EmailAddress: contact.EmailAddress || undefined,
    }));

    const duration = Date.now() - startTime;
    logger.info("XERO_CONTACTS", "Found contacts", {
      count: contacts.length,
      duration,
    });

    return NextResponse.json({ contacts });
  } catch (error: any) {
    logger.error("XERO_CONTACTS", "Fatal error", { error });
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
