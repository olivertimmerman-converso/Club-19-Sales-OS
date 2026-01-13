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
import { getXataClient } from "@/src/xata";
import { updateSalePaymentStatusFromXero } from "@/lib/xata-sales";
import { getValidTokens } from "@/lib/xero-auth";
import { ERROR_TYPES, ERROR_TRIGGERED_BY } from "@/lib/error-types";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ============================================================================
// XATA CLIENT
// ============================================================================

let _xata: ReturnType<typeof getXataClient> | null = null;

function xata() {
  if (_xata) return _xata;
  _xata = getXataClient();
  return _xata;
}

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
    const sales = await xata()
      .db.Sales.filter({
        status: "invoiced",
        error_flag: false,
      })
      .getMany();

    logger.info("XERO_SYNC", "Found invoiced sales to check", {
      count: sales.length,
    });

    if (sales.length === 0) {
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

    for (const sale of sales) {
      try {
        checkedCount++;

        // Skip sales without Xero invoice ID
        if (!sale.xero_invoice_id) {
          logger.warn("XERO_SYNC", "Sale missing xero_invoice_id - skipping", {
            saleId: sale.id,
          });
          continue;
        }

        logger.info("XERO_SYNC", "Checking invoice", {
          invoiceNumber: sale.xero_invoice_number,
          invoiceId: sale.xero_invoice_id,
        });

        // Fetch invoice from Xero
        const invoiceResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices/${sale.xero_invoice_id}`,
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
            invoiceId: sale.xero_invoice_id,
            status: invoiceResponse.status,
          });

          // Log error
          await xata().db.Errors.create({
            sale: sale.id,
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
            invoiceId: sale.xero_invoice_id,
          });
          errorCount++;
          continue;
        }

        logger.info("XERO_SYNC", "Invoice fetched", {
          invoiceNumber: invoice.InvoiceNumber,
          status: invoice.Status,
          amountDue: invoice.AmountDue,
        });

        // Check if invoice is paid
        const isPaid =
          invoice.Status === "PAID" ||
          (invoice.AmountDue !== undefined && invoice.AmountDue === 0);

        if (!isPaid) {
          logger.info("XERO_SYNC", "Invoice not paid yet - skipping", {
            invoiceNumber: invoice.InvoiceNumber,
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
          await xata().db.Errors.create({
            sale: sale.id,
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
          await xata().db.Errors.create({
            sale: sale.id,
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
      await xata().db.Errors.create({
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
