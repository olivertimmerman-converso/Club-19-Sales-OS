/**
 * Club 19 Sales OS - Xero Payment Sync Cron
 *
 * Fallback cron job for syncing payment status from Xero
 * Runs periodically to catch any missed webhook events
 *
 * This endpoint should be called by:
 * - Vercel Cron (recommended)
 * - External cron service (e.g., cron-job.org)
 * - Manual admin trigger
 *
 * Fetches all sales with status="invoiced" and checks Xero for payment
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sales, errors } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateSalePaymentStatusFromXero } from "@/lib/xata-sales";
import { mapXeroInvoiceToSaleFields } from "@/lib/xero-invoice-mapping";
import { getValidTokens } from "@/lib/xero-auth";
import { ERROR_TYPES, ERROR_TRIGGERED_BY } from "@/lib/error-types";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import * as logger from "@/lib/logger";

// ORIGINAL XATA: import { getXataClient } from "@/src/xata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ============================================================================
// ORIGINAL XATA CLIENT (REMOVED)
// ============================================================================

// ORIGINAL XATA: let _xata: ReturnType<typeof getXataClient> | null = null;
// ORIGINAL XATA: function xata() {
// ORIGINAL XATA:   if (_xata) return _xata;
// ORIGINAL XATA:   _xata = getXataClient();
// ORIGINAL XATA:   return _xata;
// ORIGINAL XATA: }

// ============================================================================
// CRON HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  logger.info("XERO_SYNC", "Starting payment sync cron job");

  // STEP 0: Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.xeroSync);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Fetch all invoiced sales (not paid yet)
    // ORIGINAL XATA: const sales = await xata()
    // ORIGINAL XATA:   .db.Sales.filter({
    // ORIGINAL XATA:     status: "invoiced",
    // ORIGINAL XATA:     error_flag: false,
    // ORIGINAL XATA:   })
    // ORIGINAL XATA:   .getMany();
    const salesRecords = await db
      .select()
      .from(sales)
      .where(
        and(
          eq(sales.status, "invoiced"),
          eq(sales.errorFlag, false)
        )
      );

    logger.info("XERO_SYNC", "Found invoiced sales to check", {
      count: salesRecords.length,
    });

    if (salesRecords.length === 0) {
      return NextResponse.json({
        checked: 0,
        updated: 0,
        errors: 0,
        message: "No invoiced sales to sync",
      });
    }

    // STEP 2: Get Xero tokens
    // Use integration user for token access
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
    if (!integrationUserId) {
      logger.error("XERO_SYNC", "XERO_INTEGRATION_CLERK_USER_ID not configured");
      return NextResponse.json(
        { error: "Integration user not configured" },
        { status: 500 }
      );
    }

    const tokens = await getValidTokens(integrationUserId);
    if (!tokens) {
      logger.error("XERO_SYNC", "No valid Xero tokens available");
      return NextResponse.json(
        { error: "Xero authentication failed" },
        { status: 401 }
      );
    }

    // STEP 3: Process each sale
    let checkedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const sale of salesRecords) {
      try {
        checkedCount++;

        // Skip sales without Xero invoice ID
        if (!sale.xeroInvoiceId) {
          logger.warn("XERO_SYNC", "Sale missing xero_invoice_id - skipping", {
            saleId: sale.id,
          });
          continue;
        }

        logger.info("XERO_SYNC", "Checking invoice", {
          invoiceNumber: sale.xeroInvoiceNumber,
          invoiceId: sale.xeroInvoiceId,
        });

        // Fetch invoice from Xero
        const invoiceResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices/${sale.xeroInvoiceId}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              "xero-tenant-id": tokens.tenantId || "",
              Accept: "application/json",
            },
          }
        );

        if (!invoiceResponse.ok) {
          logger.error("XERO_SYNC", "Failed to fetch invoice", {
            invoiceId: sale.xeroInvoiceId,
            status: invoiceResponse.status,
          });

          // Log error
          // ORIGINAL XATA: await xata().db.Errors.create({
          // ORIGINAL XATA:   sale: sale.id,
          // ORIGINAL XATA:   severity: "medium",
          // ORIGINAL XATA:   source: "xero-sync",
          // ORIGINAL XATA:   message: [
          // ORIGINAL XATA:     `Failed to fetch invoice from Xero: ${invoiceResponse.status} ${invoiceResponse.statusText}`,
          // ORIGINAL XATA:   ],
          // ORIGINAL XATA:   timestamp: new Date(),
          // ORIGINAL XATA:   resolved: false,
          // ORIGINAL XATA: });
          await db.insert(errors).values({
            saleId: sale.id,
            severity: "medium",
            source: "xero-sync",
            message: [
              `Failed to fetch invoice from Xero: ${invoiceResponse.status} ${invoiceResponse.statusText}`,
            ],
            timestamp: new Date(),
            resolved: false,
          });

          errorCount++;
          continue;
        }

        const invoiceData = await invoiceResponse.json();
        const invoice = invoiceData.Invoices?.[0];

        if (!invoice) {
          logger.error("XERO_SYNC", "Invoice not found in Xero response", {
            invoiceId: sale.xeroInvoiceId,
          });
          errorCount++;
          continue;
        }

        logger.info("XERO_SYNC", "Invoice fetched", {
          invoiceNumber: invoice.InvoiceNumber,
          status: invoice.Status,
          amountDue: invoice.AmountDue,
        });

        // Use the shared mapper for status — distinguishes PAID from CREDITED
        // even though both have AmountDue=0. Skip if the derived status is
        // anything other than PAID (CREDITED, AUTHORISED, DRAFT, VOIDED all
        // fall here).
        const mapped = mapXeroInvoiceToSaleFields(invoice);
        if (mapped.invoiceStatus !== "PAID") {
          logger.info("XERO_SYNC", "Invoice not paid (or now credited) - skipping", {
            invoiceNumber: invoice.InvoiceNumber,
            derivedStatus: mapped.invoiceStatus,
          });
          continue;
        }

        // Update sale payment status
        const result = await updateSalePaymentStatusFromXero(sale.id, {
          Status: invoice.Status,
          AmountDue: invoice.AmountDue,
          PaidDate: invoice.DateString || invoice.UpdatedDateUTC,
        });

        if (result.success) {
          logger.info("XERO_SYNC", "Sale marked as paid", {
            saleId: sale.id,
            invoiceNumber: invoice.InvoiceNumber,
          });
          updatedCount++;
        } else {
          logger.error("XERO_SYNC", "Failed to update sale", {
            saleId: sale.id,
            error: result.error,
          });
          errorCount++;

          // Log error
          // ORIGINAL XATA: await xata().db.Errors.create({
          // ORIGINAL XATA:   sale: sale.id,
          // ORIGINAL XATA:   severity: "medium",
          // ORIGINAL XATA:   source: "xero-sync",
          // ORIGINAL XATA:   message: [`Failed to update payment status: ${result.error}`],
          // ORIGINAL XATA:   timestamp: new Date(),
          // ORIGINAL XATA:   resolved: false,
          // ORIGINAL XATA: });
          await db.insert(errors).values({
            saleId: sale.id,
            severity: "medium",
            source: "xero-sync",
            message: [`Failed to update payment status: ${result.error}`],
            timestamp: new Date(),
            resolved: false,
          });
        }
      } catch (err: any) {
        logger.error("XERO_SYNC", "Error processing sale", {
          saleId: sale.id,
          error: err as any,
        });
        errorCount++;

        // Log error but continue processing other sales
        try {
          // ORIGINAL XATA: await xata().db.Errors.create({
          // ORIGINAL XATA:   sale: sale.id,
          // ORIGINAL XATA:   severity: "medium",
          // ORIGINAL XATA:   source: "xero-sync",
          // ORIGINAL XATA:   message: [`Sale processing error: ${err.message || err}`],
          // ORIGINAL XATA:   timestamp: new Date(),
          // ORIGINAL XATA:   resolved: false,
          // ORIGINAL XATA: });
          await db.insert(errors).values({
            saleId: sale.id,
            severity: "medium",
            source: "xero-sync",
            message: [`Sale processing error: ${err.message || err}`],
            timestamp: new Date(),
            resolved: false,
          });
        } catch (logErr) {
          logger.error("XERO_SYNC", "Failed to log error", { error: logErr as any } as any);
        }
      }
    }

    const summary = {
      checked: checkedCount,
      updated: updatedCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    };

    logger.info("XERO_SYNC", "Sync complete", {
      updated: updatedCount,
      errors: errorCount,
      checked: checkedCount,
    });

    return NextResponse.json(summary);
  } catch (error: any) {
    logger.error("XERO_SYNC", "Fatal error", { error: error as any });

    // Log fatal error
    try {
      // ORIGINAL XATA: await xata().db.Errors.create({
      // ORIGINAL XATA:   severity: "high",
      // ORIGINAL XATA:   source: "xero-sync",
      // ORIGINAL XATA:   message: [`Cron job fatal error: ${error.message || error}`],
      // ORIGINAL XATA:   timestamp: new Date(),
      // ORIGINAL XATA:   resolved: false,
      // ORIGINAL XATA: });
      await db.insert(errors).values({
        severity: "high",
        source: "xero-sync",
        message: [`Cron job fatal error: ${error.message || error}`],
        timestamp: new Date(),
        resolved: false,
      });
    } catch (logErr) {
      logger.error("XERO_SYNC", "Failed to log fatal error", { error: logErr as any });
    }

    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
