import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getValidTokens } from "@/lib/xero-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Xero Contact from API
 */
interface XeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  IsCustomer: boolean;
  IsSupplier: boolean;
}

/**
 * Normalized contact response
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
 * Search Xero contacts that are SUPPLIERS only
 * Query param: ?query=searchterm
 *
 * Filter: IsSupplier==true OR Purchases.DefaultLineAmountType!=""
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Authenticate user
    const { userId } = await auth();

    if (!userId) {
      console.error("[XERO SUPPLIERS] ❌ Unauthorized request");
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

    console.log(`[XERO SUPPLIERS] Searching for: "${query}" (user: ${userId})`);

    // 3. Get valid Xero OAuth tokens (auto-refreshes if needed)
    let accessToken: string;
    let tenantId: string;

    try {
      const tokens = await getValidTokens(userId);
      accessToken = tokens.accessToken;
      tenantId = tokens.tenantId;
      console.log(`[XERO SUPPLIERS] ✓ Valid tokens obtained for tenant: ${tenantId}`);
    } catch (error: any) {
      console.error("[XERO SUPPLIERS] ❌ Failed to get Xero tokens:", error.message);
      return NextResponse.json(
        {
          error: "Xero not connected",
          message: error.message,
          action: "connect_xero",
        },
        { status: 401 }
      );
    }

    // 4. Build Xero API URL with SUPPLIERS filter
    // Filter for suppliers: IsSupplier==true OR Purchases.DefaultLineAmountType exists
    const sanitizedQuery = query.replace(/"/g, '\\"');
    const nameFilter = `Name.Contains("${sanitizedQuery}")`;
    const supplierFilter = '(IsSupplier==true OR Purchases.DefaultLineAmountType!="")';
    const whereClause = `${nameFilter} AND ${supplierFilter}`;
    const encodedWhere = encodeURIComponent(whereClause);
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Contacts?where=${encodedWhere}`;

    console.log(`[XERO SUPPLIERS] Calling Xero API with filter: ${whereClause}`);

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
      console.error("[XERO SUPPLIERS] ❌ Xero API error:", {
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

    // 6. Transform Xero contacts to normalized format
    const contacts: NormalizedContact[] = (data.Contacts || []).map((contact: XeroContact) => ({
      contactId: contact.ContactID,
      name: contact.Name,
      email: contact.EmailAddress || undefined,
      isCustomer: contact.IsCustomer,
      isSupplier: contact.IsSupplier,
    }));

    const duration = Date.now() - startTime;
    console.log(`[XERO SUPPLIERS] ✓✓✓ Found ${contacts.length} supplier contacts in ${duration}ms`);

    return NextResponse.json({ contacts });
  } catch (error: any) {
    console.error("[XERO SUPPLIERS] ❌ Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
