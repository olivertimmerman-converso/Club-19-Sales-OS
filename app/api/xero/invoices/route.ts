import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getValidTokens } from "@/lib/xero-auth";
import { createXeroInvoice } from "@/lib/xero";
import { getBrandingThemeId } from "@/lib/xero-branding-themes";
import { syncSaleToMake, buildSalePayload } from "@/lib/make-sync";
import { syncInvoiceAndAppDataToXata, saveLineItems } from "@/lib/xata-sales";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Line item for multi-line invoices
 */
interface LineItemPayload {
  lineNumber: number;
  brand: string;
  category: string;
  description: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  lineTotal: number;
  lineMargin: number;
  supplierName?: string;
}

/**
 * Invoice creation payload from frontend
 * Supports both single-line (legacy) and multi-line invoices
 */
interface CreateInvoicePayload {
  buyerContactId: string;
  // Single-line (legacy) fields
  description?: string;
  finalPrice?: number;
  // Multi-line fields
  lineItems?: LineItemPayload[];
  // Common fields
  accountCode: string;
  taxType: string;
  brandingThemeId?: string;
  currency: string;
  lineAmountType: string; // "Inclusive" | "Exclusive" | "NoTax"

  // Summary fields (for multi-line)
  totalSellPrice?: number;
  totalBuyPrice?: number;

  // Additional fields for Make.com sync (19-field payload)
  supplierName?: string;
  brand?: string;
  category?: string;
  itemTitle?: string;
  quantity?: number;
  buyPrice?: number;
  cardFees?: number;
  shippingCost?: number;
  impliedShipping?: number;
  grossMargin?: number;
  commissionableMargin?: number;
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
  logger.info("XERO_INVOICES", "Create Invoice API Started");

  try {
    // 1. Authenticate user
    const { userId } = await auth();
    logger.info("XERO_INVOICES", "User ID", { userId: userId || "NOT AUTHENTICATED" });

    if (!userId) {
      logger.error("XERO_INVOICES", "Unauthorized request");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let payload: CreateInvoicePayload;
    try {
      payload = await request.json();
      const isMultiLine = payload.lineItems && payload.lineItems.length > 0;
      logger.info("XERO_INVOICES", "Payload received", {
        buyerContactId: payload.buyerContactId,
        isMultiLine,
        lineItemCount: payload.lineItems?.length || 0,
        description: payload.description?.substring(0, 50),
        finalPrice: payload.finalPrice,
        totalSellPrice: payload.totalSellPrice,
        accountCode: payload.accountCode,
        taxType: payload.taxType,
        currency: payload.currency,
        lineAmountType: payload.lineAmountType,
      });
    } catch (error) {
      logger.error("XERO_INVOICES", "Invalid JSON payload");
      return NextResponse.json(
        { error: "Invalid request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 3. Validate required fields
    // For multi-line invoices, we need lineItems instead of description/finalPrice
    const isMultiLine = payload.lineItems && payload.lineItems.length > 0;

    const commonRequiredFields = [
      "buyerContactId",
      "accountCode",
      "taxType",
      "currency",
      "lineAmountType",
    ];

    for (const field of commonRequiredFields) {
      if (!payload[field as keyof CreateInvoicePayload]) {
        logger.error("XERO_INVOICES", "Missing required field", { field });
        return NextResponse.json(
          { error: "Validation error", message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate multi-line OR single-line fields
    if (isMultiLine) {
      // Multi-line: validate each line item
      for (const [index, item] of payload.lineItems!.entries()) {
        if (!item.description || item.quantity <= 0 || item.sellPrice <= 0) {
          logger.error("XERO_INVOICES", "Invalid line item", { index, lineNumber: item.lineNumber });
          return NextResponse.json(
            { error: "Validation error", message: `Line item ${index + 1} is invalid` },
            { status: 400 }
          );
        }
      }
    } else {
      // Single-line (legacy): require description and finalPrice
      if (!payload.description || !payload.finalPrice || payload.finalPrice <= 0) {
        logger.error("XERO_INVOICES", "Invalid single-line payload", {
          hasDescription: !!payload.description,
          finalPrice: payload.finalPrice,
        });
        return NextResponse.json(
          { error: "Validation error", message: "Either lineItems or description+finalPrice required" },
          { status: 400 }
        );
      }
    }

    // 4. Get valid Xero OAuth tokens (auto-refreshes if needed)
    let accessToken: string;
    let tenantId: string;

    try {
      logger.info("XERO_INVOICES", "Fetching valid tokens...");
      const tokens = await getValidTokens(userId);
      accessToken = tokens.accessToken;
      tenantId = tokens.tenantId;
      logger.info("XERO_INVOICES", "Valid tokens obtained", { tenantId });
    } catch (error: any) {
      logger.error("XERO_INVOICES", "Failed to get Xero tokens", { error: error as any });
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
        logger.info("XERO_INVOICES", "Resolving branding theme", { brandingThemeId: payload.brandingThemeId });

        // Check if it's already a GUID (contains dashes) or a name
        const isGuid = payload.brandingThemeId.includes("-");

        if (!isGuid) {
          // It's a name, need to resolve to GUID
          logger.info("XERO_INVOICES", "Branding theme appears to be a name, fetching GUID...");
          resolvedBrandingThemeId = await getBrandingThemeId(userId, payload.brandingThemeId);

          if (resolvedBrandingThemeId) {
            logger.info("XERO_INVOICES", "Resolved branding theme", {
              name: payload.brandingThemeId,
              guid: resolvedBrandingThemeId
            });
          } else {
            logger.warn("XERO_INVOICES", "Branding theme not found, will omit from invoice", {
              brandingThemeId: payload.brandingThemeId
            });
            resolvedBrandingThemeId = undefined;
          }
        } else {
          logger.info("XERO_INVOICES", "Branding theme is already a GUID", {
            brandingThemeId: payload.brandingThemeId
          });
        }
      } catch (error: any) {
        logger.warn("XERO_INVOICES", "Failed to resolve branding theme, will omit", {
          error: error as any
        } as any);
        resolvedBrandingThemeId = undefined;
      }
    }

    // Update payload with resolved GUID
    const resolvedPayload = {
      ...payload,
      brandingThemeId: resolvedBrandingThemeId,
    };

    // 6. Create invoice in Xero
    logger.info("XERO_INVOICES", "Creating invoice in Xero...");
    let invoice;
    try {
      invoice = await createXeroInvoice(tenantId, accessToken, resolvedPayload);
      logger.info("XERO_INVOICES", "Invoice created successfully", {
        invoiceId: invoice.InvoiceID,
        invoiceNumber: invoice.InvoiceNumber,
        total: invoice.Total,
        currency: invoice.CurrencyCode
      });
    } catch (error: any) {
      logger.error("XERO_INVOICES", "Failed to create invoice", { error: error as any });

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
    logger.info("XERO_INVOICES", "Invoice creation completed", { duration_ms: duration, response: response as any });

    // 8. Sync sale to Make.com/Airtable (non-blocking)
    // Get user details for shopper name
    let shopperName = "Unknown";
    try {
      const user = await clerkClient().users.getUser(userId);
      shopperName = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress || "Unknown";
    } catch (error) {
      logger.warn("XERO_INVOICES", "Could not fetch user details for shopper name", { error: error as any });
    }

    // Build and send sale payload - ALWAYS sync to Make.com (19 fields)
    const salePayload = buildSalePayload({
      invoiceNumber: invoice.InvoiceNumber,
      invoiceDate: new Date(),
      shopperName: shopperName,
      buyerName: response.contactName,
      supplierName: payload.supplierName || "",

      // Item metadata
      brand: payload.brand || "",
      category: payload.category || "",
      itemTitle: payload.itemTitle || payload.description || "",
      quantity: payload.quantity ?? 1,

      // Financials
      saleAmount: response.total,
      buyPrice: payload.buyPrice ?? 0,
      cardFees: payload.cardFees ?? 0,
      shippingCost: payload.shippingCost ?? 0,

      // Economics
      impliedShipping: payload.impliedShipping ?? 0,
      grossMargin: payload.grossMargin ?? 0,
      commissionableMargin: payload.commissionableMargin ?? 0,

      // Misc
      currency: payload.currency || "GBP",
      brandingTheme: payload.brandingThemeId || "Standard",
      notes: payload.notes || "",
    });

    // Sync to Make.com (await ensures delivery)
    await syncSaleToMake(salePayload);

    // Sync to Xata database (non-fatal)
    try {
      // Get user email for shopper
      const user = await clerkClient().users.getUser(userId);
      const shopperEmail = user.primaryEmailAddress?.emailAddress || undefined;

      // Use multi-line values if available, otherwise fall back to legacy
      const totalBuyPrice = isMultiLine && payload.lineItems
        ? payload.lineItems.reduce((sum, item) => sum + (item.buyPrice * item.quantity), 0)
        : (payload.buyPrice || 0);

      const sale = await syncInvoiceAndAppDataToXata({
        xeroInvoice: {
          InvoiceNumber: invoice.InvoiceNumber,
          Date: invoice.DateString || new Date().toISOString().split("T")[0],
          InvoiceID: invoice.InvoiceID,
          Status: invoice.Status,
          Total: invoice.Total,
          BrandingThemeID: resolvedBrandingThemeId,
          CurrencyCode: invoice.CurrencyCode,
          Contact: {
            Name: invoice.Contact?.Name || response.contactName,
            ContactID: invoice.Contact?.ContactID || payload.buyerContactId,
            EmailAddress: undefined, // Not available in XeroInvoice type
          },
        },

        formData: {
          // Absolutely required
          shopperName,
          shopperEmail,

          // Supplier
          supplierName: payload.supplierName || "",
          supplierXeroId: undefined, // Not available in current payload

          // Introducer (optional)
          introducerName: undefined, // Not available in current payload
          introducerCommission: undefined,

          // Item metadata (use first item for legacy compatibility)
          brand: payload.brand,
          category: payload.category,
          itemTitle: payload.itemTitle || payload.description,
          quantity: payload.quantity,

          // Financials
          buyPrice: totalBuyPrice,
          cardFees: payload.cardFees || 0,
          shippingCost: payload.shippingCost || 0,

          // Notes
          internalNotes: payload.notes || "",
        },
      });

      logger.info("XATA", "Sale synced to Xata database", { saleId: sale?.id });

      // Save line items if multi-line invoice
      if (sale && isMultiLine && payload.lineItems && payload.lineItems.length > 0) {
        await saveLineItems(sale.id, payload.lineItems);
        logger.info("XATA", "Line items saved", {
          saleId: sale.id,
          lineItemCount: payload.lineItems.length,
        });
      }
    } catch (err) {
      logger.error("XATA", "Sync failed (non-critical)", { error: err as any } as any);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    logger.error("XERO_INVOICES", "Fatal error", { error: error as any } as any);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
