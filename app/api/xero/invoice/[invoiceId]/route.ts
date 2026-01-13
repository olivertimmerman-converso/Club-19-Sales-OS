/**
 * Club 19 Sales OS - Fetch Single Xero Invoice
 *
 * GET /api/xero/invoice/[invoiceId]
 * Returns full invoice details from Xero for the adopt flow
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getValidTokens } from "@/lib/xero-auth";
import { getUserRole } from "@/lib/getUserRole";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;

  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check role permissions
    const role = await getUserRole();
    if (!["superadmin", "operations", "founder", "admin"].includes(role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.info("XERO_INVOICE", "Fetching invoice", { invoiceId });

    // Get Xero tokens
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
    if (!integrationUserId) {
      logger.error("XERO_INVOICE", "XERO_INTEGRATION_CLERK_USER_ID not configured");
      return NextResponse.json(
        { error: "Xero integration not configured" },
        { status: 500 }
      );
    }

    const tokens = await getValidTokens(integrationUserId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Xero not connected" },
        { status: 400 }
      );
    }

    // Fetch invoice from Xero
    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Xero-Tenant-Id": tokens.tenantId,
          Accept: "application/json",
        },
      }
    );

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      logger.error("XERO_INVOICE", "Failed to fetch invoice", {
        invoiceId,
        status: xeroResponse.status,
        error: errorText,
      });
      return NextResponse.json(
        { error: "Invoice not found in Xero" },
        { status: 404 }
      );
    }

    const data = await xeroResponse.json();
    const invoice = data.Invoices?.[0];

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    logger.info("XERO_INVOICE", "Invoice fetched successfully", {
      invoiceId,
      invoiceNumber: invoice.InvoiceNumber,
      status: invoice.Status,
    });

    // Return formatted invoice data
    return NextResponse.json({
      invoiceId: invoice.InvoiceID,
      invoiceNumber: invoice.InvoiceNumber,
      reference: invoice.Reference || null,
      clientName: invoice.Contact?.Name || "Unknown",
      clientEmail: invoice.Contact?.EmailAddress || null,
      clientXeroId: invoice.Contact?.ContactID || null,
      total: invoice.Total,
      subTotal: invoice.SubTotal,
      totalTax: invoice.TotalTax,
      currencyCode: invoice.CurrencyCode || "GBP",
      date: invoice.DateString || invoice.Date,
      dueDate: invoice.DueDateString || invoice.DueDate,
      status: invoice.Status,
      brandingThemeID: invoice.BrandingThemeID || null,
      lineItems: (invoice.LineItems || []).map((item: any) => ({
        description: item.Description || "",
        quantity: item.Quantity || 1,
        unitAmount: item.UnitAmount || 0,
        lineAmount: item.LineAmount || 0,
        accountCode: item.AccountCode || null,
        taxType: item.TaxType || null,
      })),
    });
  } catch (error: any) {
    logger.error("XERO_INVOICE", "Error fetching invoice", {
      invoiceId,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch invoice" },
      { status: 500 }
    );
  }
}
