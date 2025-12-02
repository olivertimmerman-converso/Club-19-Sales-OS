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
  console.log("[XERO SYNC] Starting payment sync cron job");

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

    console.log(`[XERO SYNC] Found ${sales.length} invoiced sales to check`);

    if (sales.length === 0) {
      return NextResponse.json({
        checked: 0,
        updated: 0,
        errors: 0,
        message: "No invoiced sales to sync",
      });
    }

    // STEP 2: Get Xero tokens
    // Use system admin user for cron token access
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId) {
      console.error("[XERO SYNC] ❌ XERO_SYSTEM_USER_ID not configured");
      return NextResponse.json(
        { error: "System user not configured" },
        { status: 500 }
      );
    }

    const tokens = await getValidTokens(systemUserId);
    if (!tokens) {
      console.error("[XERO SYNC] ❌ No valid Xero tokens available");
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
          console.warn(
            `[XERO SYNC] ⚠️ Sale ${sale.id} missing xero_invoice_id - skipping`
          );
          continue;
        }

        console.log(
          `[XERO SYNC] Checking invoice ${sale.xero_invoice_number} (${sale.xero_invoice_id})`
        );

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
          console.error(
            `[XERO SYNC] ❌ Failed to fetch invoice ${sale.xero_invoice_id}: ${invoiceResponse.status}`
          );

          // Log error
          await xata().db.Errors.create({
            sale: sale.id,
            error_type: ERROR_TYPES.SYNC,
            severity: "medium",
            source: "xero-sync",
            message: [
              `Failed to fetch invoice from Xero: ${invoiceResponse.status} ${invoiceResponse.statusText}`,
            ],
            metadata: {
              saleId: sale.id,
              xeroInvoiceId: sale.xero_invoice_id,
              xeroInvoiceNumber: sale.xero_invoice_number,
              httpStatus: invoiceResponse.status,
              statusText: invoiceResponse.statusText,
            },
            triggered_by: ERROR_TRIGGERED_BY.XERO_SYNC,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });

          errorCount++;
          continue;
        }

        const invoiceData = await invoiceResponse.json();
        const invoice = invoiceData.Invoices?.[0];

        if (!invoice) {
          console.error(
            `[XERO SYNC] ❌ Invoice ${sale.xero_invoice_id} not found in Xero response`
          );
          errorCount++;
          continue;
        }

        console.log(
          `[XERO SYNC] Invoice ${invoice.InvoiceNumber} - Status: ${invoice.Status}, AmountDue: ${invoice.AmountDue}`
        );

        // Check if invoice is paid
        const isPaid =
          invoice.Status === "PAID" ||
          (invoice.AmountDue !== undefined && invoice.AmountDue === 0);

        if (!isPaid) {
          console.log(
            `[XERO SYNC] Invoice ${invoice.InvoiceNumber} not paid yet - skipping`
          );
          continue;
        }

        // Update sale payment status
        const result = await updateSalePaymentStatusFromXero(sale.id, {
          Status: invoice.Status,
          AmountDue: invoice.AmountDue,
          PaidDate: invoice.DateString || invoice.UpdatedDateUTC,
        });

        if (result.success) {
          console.log(
            `[XERO SYNC] ✅ Sale ${sale.id} marked as paid for invoice ${invoice.InvoiceNumber}`
          );
          updatedCount++;
        } else {
          console.error(
            `[XERO SYNC] ❌ Failed to update sale ${sale.id}: ${result.error}`
          );
          errorCount++;

          // Log error
          await xata().db.Errors.create({
            sale: sale.id,
            error_type: ERROR_TYPES.SYNC,
            severity: "medium",
            source: "xero-sync",
            message: [`Failed to update payment status: ${result.error}`],
            metadata: {
              saleId: sale.id,
              invoiceNumber: invoice.InvoiceNumber,
              invoiceStatus: invoice.Status,
              amountDue: invoice.AmountDue,
              errorDetails: result.error,
            },
            triggered_by: ERROR_TRIGGERED_BY.XERO_SYNC,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });
        }
      } catch (err: any) {
        console.error(`[XERO SYNC] ❌ Error processing sale ${sale.id}:`, err);
        errorCount++;

        // Log error but continue processing other sales
        try {
          await xata().db.Errors.create({
            sale: sale.id,
            error_type: ERROR_TYPES.SYNC,
            severity: "medium",
            source: "xero-sync",
            message: [`Sale processing error: ${err.message || err}`],
            metadata: {
              saleId: sale.id,
              xeroInvoiceId: sale.xero_invoice_id,
              xeroInvoiceNumber: sale.xero_invoice_number,
              error: err.message || String(err),
              stack: err.stack,
            },
            triggered_by: ERROR_TRIGGERED_BY.XERO_SYNC,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });
        } catch (logErr) {
          console.error("[XERO SYNC] ❌ Failed to log error:", logErr);
        }
      }
    }

    const summary = {
      checked: checkedCount,
      updated: updatedCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    };

    console.log(
      `[XERO SYNC] ✅ Sync complete: ${updatedCount} updated, ${errorCount} errors out of ${checkedCount} checked`
    );

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[XERO SYNC] ❌ Fatal error:", error);

    // Log fatal error
    try {
      await xata().db.Errors.create({
        sale: undefined,
        error_type: ERROR_TYPES.SYSTEM,
        severity: "high",
        source: "xero-sync",
        message: [`Cron job fatal error: ${error.message || error}`],
        metadata: {
          error: error.message || String(error),
          stack: error.stack,
          timestamp: new Date().toISOString(),
        },
        triggered_by: ERROR_TRIGGERED_BY.CRON,
        timestamp: new Date(),
        resolved: false,
        resolved_by: null,
        resolved_at: null,
        resolved_notes: null,
      });
    } catch (logErr) {
      console.error("[XERO SYNC] ❌ Failed to log fatal error:", logErr);
    }

    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
