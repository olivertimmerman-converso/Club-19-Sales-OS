/**
 * Club 19 Sales OS - Adopt Invoice API
 *
 * POST /api/sales/adopt
 * Creates a Sale record from an existing Xero invoice
 * Used to convert unallocated invoices into proper Sales records
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";
import { getValidTokens } from "@/lib/xero-auth";
import { getUserRole } from "@/lib/getUserRole";
import { calculateMargins } from "@/lib/economics";
import { roundCurrency } from "@/lib/utils/currency";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const xata = getXataClient();

/**
 * Generate next sale_reference in format C19-XXXX
 */
async function generateSaleReference(): Promise<string> {
  const latestSale = await xata.db.Sales
    .select(["sale_reference"])
    .sort("xata.createdAt", "desc")
    .getFirst();

  if (!latestSale || !latestSale.sale_reference) {
    return "C19-0001";
  }

  const match = latestSale.sale_reference.match(/C19-(\d+)/);
  if (!match) {
    return "C19-0001";
  }

  const nextNumber = parseInt(match[1], 10) + 1;
  return `C19-${nextNumber.toString().padStart(4, "0")}`;
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      xeroInvoiceId,
      xeroInvoiceNumber,
      shopperId,
      supplierId,
      buyPrice,
      brand,
      category,
      description,
    } = body;

    // Validate required fields
    if (!xeroInvoiceId || !shopperId || !supplierId || buyPrice === undefined || !brand || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    logger.info("ADOPT", "Starting invoice adoption", {
      xeroInvoiceId,
      xeroInvoiceNumber,
      shopperId,
      supplierId,
      buyPrice,
    });

    // Check if this invoice has already been adopted (exclude deleted records and unallocated imports)
    // Note: Xata's filter on null datetime fields is unreliable, so we filter in JS
    const existingSaleRaw = await xata.db.Sales
      .filter({ xero_invoice_id: xeroInvoiceId })
      .select(['id', 'deleted_at', 'needs_allocation', 'source'])
      .getFirst();

    // Only block if we find a NON-deleted record that has ALREADY been adopted
    // Allow if: deleted, OR needs_allocation is true (it's an unallocated import waiting to be adopted)
    const isDeleted = existingSaleRaw?.deleted_at;
    const isUnallocatedImport = existingSaleRaw?.needs_allocation === true;
    const existingSale = existingSaleRaw && !isDeleted && !isUnallocatedImport ? existingSaleRaw : null;

    if (existingSale) {
      logger.warn("ADOPT", "Invoice already adopted", {
        xeroInvoiceId,
        existingSaleId: existingSale.id,
      });
      return NextResponse.json(
        { error: "This invoice has already been adopted", saleId: existingSale.id },
        { status: 409 }
      );
    }

    // Track if we need to delete an existing unallocated record after creating the new one
    const existingUnallocatedId = existingSaleRaw && !isDeleted && isUnallocatedImport ? existingSaleRaw.id : null;
    if (existingUnallocatedId) {
      logger.info("ADOPT", "Found existing unallocated record to replace", {
        existingId: existingUnallocatedId,
        xeroInvoiceId,
      });
    }

    // Get Xero tokens to fetch full invoice details
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
    if (!integrationUserId) {
      logger.error("ADOPT", "XERO_INTEGRATION_CLERK_USER_ID not configured");
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

    // Fetch full invoice from Xero
    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${xeroInvoiceId}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Xero-Tenant-Id": tokens.tenantId,
          Accept: "application/json",
        },
      }
    );

    if (!xeroResponse.ok) {
      logger.error("ADOPT", "Failed to fetch Xero invoice", {
        xeroInvoiceId,
        status: xeroResponse.status,
      });
      return NextResponse.json(
        { error: "Failed to fetch invoice from Xero" },
        { status: 400 }
      );
    }

    const xeroData = await xeroResponse.json();
    const invoice = xeroData.Invoices?.[0];

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found in Xero" },
        { status: 404 }
      );
    }

    logger.info("ADOPT", "Xero invoice fetched", {
      invoiceNumber: invoice.InvoiceNumber,
      total: invoice.Total,
      status: invoice.Status,
    });

    // Find or create buyer record based on Xero contact
    let buyerId: string | undefined;
    if (invoice.Contact?.ContactID) {
      // Check if buyer exists with this Xero contact ID
      let buyer = await xata.db.Buyers
        .filter({ xero_contact_id: invoice.Contact.ContactID })
        .getFirst();

      if (!buyer) {
        // Create new buyer
        buyer = await xata.db.Buyers.create({
          name: invoice.Contact.Name || "Unknown Client",
          email: invoice.Contact.EmailAddress || null,
          xero_contact_id: invoice.Contact.ContactID,
        });
        logger.info("ADOPT", "Created new buyer", { buyerId: buyer.id, name: buyer.name });
      }
      buyerId = buyer.id;
    }

    // Calculate financials
    const saleAmountIncVat = roundCurrency(invoice.Total);
    const saleAmountExVat = roundCurrency(invoice.SubTotal);
    const roundedBuyPrice = roundCurrency(buyPrice);

    // Calculate margins
    const marginResult = calculateMargins({
      saleAmountExVat: saleAmountExVat,
      buyPrice: roundedBuyPrice,
      shippingCost: 0,
      cardFees: 0,
      directCosts: 0,
      introducerCommission: 0,
    });

    // Generate sale reference
    const saleReference = await generateSaleReference();
    logger.info("ADOPT", "Generated sale reference", { saleReference });

    // Parse invoice date
    let saleDate: Date;
    if (invoice.DateString) {
      saleDate = new Date(invoice.DateString);
    } else if (invoice.Date) {
      // Xero sometimes returns /Date(timestamp)/ format
      const match = invoice.Date.match(/\/Date\((\d+)\)/);
      saleDate = match ? new Date(parseInt(match[1])) : new Date();
    } else {
      saleDate = new Date();
    }

    // Determine invoice status
    const invoiceStatus = invoice.Status || "DRAFT";
    const isPaid = invoiceStatus === "PAID";

    // Create the Sale record
    const saleRecord = await xata.db.Sales.create({
      // Metadata
      sale_reference: saleReference,
      sale_date: saleDate,
      status: "active",
      source: "adopted", // Mark as adopted from Xero

      // Relationships
      buyer: buyerId,
      shopper: shopperId,
      supplier: supplierId,

      // Item details
      brand,
      category,
      item_title: description || invoice.LineItems?.[0]?.Description || `${brand} ${category}`,
      quantity: 1,

      // Pricing
      buy_price: roundedBuyPrice,
      sale_amount_ex_vat: saleAmountExVat,
      sale_amount_inc_vat: saleAmountIncVat,
      currency: invoice.CurrencyCode || "GBP",

      // Margins
      gross_margin: marginResult.grossMargin,
      commissionable_margin: marginResult.commissionableMargin,

      // Xero integration
      xero_invoice_number: invoice.InvoiceNumber,
      xero_invoice_id: invoice.InvoiceID,
      xero_invoice_url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.InvoiceID}`,
      invoice_status: invoiceStatus,

      // Payment tracking
      invoice_paid_date: isPaid ? new Date() : undefined,
      xero_payment_date: isPaid ? new Date() : undefined,

      // Commission tracking (defaults)
      commission_locked: false,
      commission_paid: false,
      error_flag: false,

      // Allocation - mark as NOT needing allocation (it's being adopted with full details)
      needs_allocation: false,
    });

    logger.info("ADOPT", "Sale record created", {
      saleId: saleRecord.id,
      saleReference,
      xeroInvoiceNumber: invoice.InvoiceNumber,
    });

    // If there was a previous unallocated Sales record for this invoice, delete it
    // We tracked this at the start of the request
    if (existingUnallocatedId) {
      logger.info("ADOPT", "Cleaning up old unallocated record", {
        oldId: existingUnallocatedId,
        newId: saleRecord.id,
      });
      await xata.db.Sales.delete(existingUnallocatedId);
    }

    return NextResponse.json({
      success: true,
      saleId: saleRecord.id,
      saleReference,
      message: `Invoice ${invoice.InvoiceNumber} adopted successfully`,
    });
  } catch (error: any) {
    logger.error("ADOPT", "Error adopting invoice", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to adopt invoice", details: error.message },
      { status: 500 }
    );
  }
}
