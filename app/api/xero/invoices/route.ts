import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getValidTokens } from "@/lib/xero-auth";
import { createXeroInvoice } from "@/lib/xero";
import { getBrandingThemeId } from "@/lib/xero-branding-themes";
import { syncSaleToMake, buildSalePayload } from "@/lib/make-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Invoice creation payload from frontend
 */
interface CreateInvoicePayload {
  buyerContactId: string;
  description: string;
  finalPrice: number;
  accountCode: string;
  taxType: string;
  brandingThemeId?: string;
  currency: string;
  lineAmountType: string; // "Inclusive" | "Exclusive" | "NoTax"
  // Additional fields for Make.com sync
  supplierName?: string;
  buyPrice?: number;
  cardFees?: number;
  shippingCost?: number;
  notes?: string;
}

/**
 * Invoice response to frontend
 */
interface InvoiceResponse {
  invoiceId: string;
  invoiceNumber: string;
  contactName: string;
  total: number;
  amountDue: number;
  invoiceUrl: string;
}

/**
 * POST /api/xero/invoices
 *
 * Create a sales invoice in Xero using the native API
 *
 * Features:
 * - Auto-generated invoice numbers (Xero handles numbering)
 * - Single line item representing final client price
 * - Automatic token refresh
 * - Comprehensive error handling
 * - Detailed logging
 *
 * Payload:
 * {
 *   buyerContactId: string,
 *   description: string,
 *   finalPrice: number,
 *   accountCode: string,
 *   taxType: string,
 *   brandingThemeId?: string,
 *   currency: string,
 *   lineAmountType: string
 * }
 *
 * Response:
 * {
 *   invoiceId: string,
 *   invoiceNumber: string,
 *   contactName: string,
 *   total: number,
 *   amountDue: number,
 *   invoiceUrl: string
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("[XERO INVOICE] === Create Invoice API Started ===");

  try {
    // 1. Authenticate user
    const { userId } = await auth();
    console.log(`[XERO INVOICE] User ID: ${userId || "NOT AUTHENTICATED"}`);

    if (!userId) {
      console.error("[XERO INVOICE] ❌ Unauthorized request");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let payload: CreateInvoicePayload;
    try {
      payload = await request.json();
      console.log("[XERO INVOICE] Payload received:", {
        buyerContactId: payload.buyerContactId,
        description: payload.description?.substring(0, 50) + "...",
        finalPrice: payload.finalPrice,
        accountCode: payload.accountCode,
        taxType: payload.taxType,
        currency: payload.currency,
        lineAmountType: payload.lineAmountType,
      });
    } catch (error) {
      console.error("[XERO INVOICE] ❌ Invalid JSON payload");
      return NextResponse.json(
        { error: "Invalid request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 3. Validate required fields
    const requiredFields = [
      "buyerContactId",
      "description",
      "finalPrice",
      "accountCode",
      "taxType",
      "currency",
      "lineAmountType",
    ];

    for (const field of requiredFields) {
      if (!payload[field as keyof CreateInvoicePayload]) {
        console.error(`[XERO INVOICE] ❌ Missing required field: ${field}`);
        return NextResponse.json(
          { error: "Validation error", message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate finalPrice is positive
    if (payload.finalPrice <= 0) {
      console.error(`[XERO INVOICE] ❌ Invalid finalPrice: ${payload.finalPrice}`);
      return NextResponse.json(
        { error: "Validation error", message: "finalPrice must be greater than 0" },
        { status: 400 }
      );
    }

    // 4. Get valid Xero OAuth tokens (auto-refreshes if needed)
    let accessToken: string;
    let tenantId: string;

    try {
      console.log("[XERO INVOICE] Fetching valid tokens...");
      const tokens = await getValidTokens(userId);
      accessToken = tokens.accessToken;
      tenantId = tokens.tenantId;
      console.log(`[XERO INVOICE] ✓ Valid tokens obtained for tenant: ${tenantId}`);
    } catch (error: any) {
      console.error("[XERO INVOICE] ❌ Failed to get Xero tokens:", error.message);
      return NextResponse.json(
        {
          error: "Xero not connected",
          message: error.message || "Please reconnect your Xero account",
          action: "connect_xero",
        },
        { status: 401 }
      );
    }

    // 5. Resolve branding theme name to GUID (if provided)
    let resolvedBrandingThemeId: string | undefined = payload.brandingThemeId;

    if (payload.brandingThemeId) {
      try {
        console.log(`[XERO INVOICE] Resolving branding theme: "${payload.brandingThemeId}"`);

        // Check if it's already a GUID (contains dashes) or a name
        const isGuid = payload.brandingThemeId.includes("-");

        if (!isGuid) {
          // It's a name, need to resolve to GUID
          console.log(`[XERO INVOICE] Branding theme appears to be a name, fetching GUID...`);
          resolvedBrandingThemeId = await getBrandingThemeId(userId, payload.brandingThemeId);

          if (resolvedBrandingThemeId) {
            console.log(`[XERO INVOICE] ✓ Resolved "${payload.brandingThemeId}" → ${resolvedBrandingThemeId}`);
          } else {
            console.warn(`[XERO INVOICE] ⚠️ Branding theme "${payload.brandingThemeId}" not found, will omit from invoice`);
            resolvedBrandingThemeId = undefined;
          }
        } else {
          console.log(`[XERO INVOICE] ✓ Branding theme is already a GUID: ${payload.brandingThemeId}`);
        }
      } catch (error: any) {
        console.warn(`[XERO INVOICE] ⚠️ Failed to resolve branding theme, will omit: ${error.message}`);
        resolvedBrandingThemeId = undefined;
      }
    }

    // Update payload with resolved GUID
    const resolvedPayload = {
      ...payload,
      brandingThemeId: resolvedBrandingThemeId,
    };

    // 6. Create invoice in Xero
    console.log("[XERO INVOICE] Creating invoice in Xero...");
    let invoice;
    try {
      invoice = await createXeroInvoice(tenantId, accessToken, resolvedPayload);
      console.log(`[XERO INVOICE] ✓ Invoice created successfully`);
      console.log(`[XERO INVOICE] Invoice ID: ${invoice.InvoiceID}`);
      console.log(`[XERO INVOICE] Invoice Number: ${invoice.InvoiceNumber}`);
      console.log(`[XERO INVOICE] Total: ${invoice.Total} ${invoice.CurrencyCode}`);
    } catch (error: any) {
      console.error("[XERO INVOICE] ❌ Failed to create invoice:", error.message);

      // Check if it's an auth error
      if (error.message.includes("401") || error.message.includes("403")) {
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
        {
          error: "Invoice creation failed",
          message: error.message,
          details: error.details || null,
        },
        { status: 500 }
      );
    }

    // 7. Build response for frontend
    const response: InvoiceResponse = {
      invoiceId: invoice.InvoiceID,
      invoiceNumber: invoice.InvoiceNumber,
      contactName: invoice.Contact?.Name || "Unknown",
      total: invoice.Total,
      amountDue: invoice.AmountDue,
      invoiceUrl: `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoice.InvoiceID}`,
    };

    const duration = Date.now() - startTime;
    console.log(`[XERO INVOICE] ✓✓✓ Invoice creation completed in ${duration}ms`);
    console.log(`[XERO INVOICE] Response:`, response);

    // 8. Sync sale to Make.com/Airtable (non-blocking)
    // Get user details for shopper name
    let shopperName = "Unknown";
    try {
      const user = await clerkClient().users.getUser(userId);
      shopperName = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress || "Unknown";
    } catch (error) {
      console.warn("[XERO INVOICE] Could not fetch user details for shopper name:", error);
    }

    // Build and send sale payload - ALWAYS sync to Make.com
    const salePayload = buildSalePayload({
      invoiceNumber: invoice.InvoiceNumber,
      invoiceDate: new Date(),
      shopperName: shopperName,
      buyerName: response.contactName,
      supplierName: payload.supplierName || "",
      saleAmount: response.total,
      buyPrice: payload.buyPrice ?? 0,
      cardFees: payload.cardFees ?? 0,
      shippingCost: payload.shippingCost ?? 0,
      notes: payload.notes || "",
    });

    // Sync to Make.com (await ensures delivery)
    await syncSaleToMake(salePayload);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[XERO INVOICE] ❌ Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
