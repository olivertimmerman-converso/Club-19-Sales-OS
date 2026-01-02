/**
 * Club 19 Sales OS - Xero Webhook Handler
 *
 * High-security webhook endpoint for receiving Xero payment notifications
 * Uses HMAC-SHA256 signature verification to ensure authenticity
 *
 * Handles:
 * - Signature verification with XERO_WEBHOOK_SECRET
 * - Invoice payment events
 * - Status transitions from "invoiced" to "paid"
 * - Error logging for invalid requests
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getXataClient } from "@/src/xata";
import {
  findSaleByInvoiceNumber,
  updateSalePaymentStatusFromXero,
} from "@/lib/xata-sales";
import { getValidTokens } from "@/lib/xero-auth";
import { ERROR_TYPES, ERROR_TRIGGERED_BY } from "@/lib/error-types";
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
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify Xero webhook signature using HMAC-SHA256
 *
 * @param rawBody - Raw request body as string
 * @param signature - Signature from x-xero-signature header
 * @returns true if signature is valid, false otherwise
 */
function verifyXeroSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.XERO_WEBHOOK_SECRET;

  if (!webhookSecret || webhookSecret === "FILL_ME") {
    logger.error("XERO_WEBHOOKS", "XERO_WEBHOOK_SECRET not configured or is placeholder");
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(rawBody);
    const computedSignature = hmac.digest("base64");

    const isValid = computedSignature === signature;

    if (isValid) {
      logger.info("XERO_WEBHOOKS", "Signature verified");
    } else {
      logger.error("XERO_WEBHOOKS", "Invalid signature");
    }

    return isValid;
  } catch (err) {
    logger.error("XERO_WEBHOOKS", "Signature verification error", { error: err as any });
    return false;
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  logger.info("XERO_WEBHOOKS", "Received webhook request");

  try {
    // STEP 1: Read raw body (required for signature verification)
    const rawBody = await req.text();

    // STEP 2: Extract Xero headers
    const signature = req.headers.get("x-xero-signature");
    const eventId = req.headers.get("x-xero-event-id");
    const eventTimestamp = req.headers.get("x-xero-event-timestamp");

    logger.info("XERO_WEBHOOKS", "Event received", {
      eventId,
      timestamp: eventTimestamp,
    });

    if (!signature) {
      logger.error("XERO_WEBHOOKS", "Missing x-xero-signature header");
      return new Response("Missing signature", { status: 401 });
    }

    // STEP 3: Verify signature
    const isValidSignature = verifyXeroSignature(rawBody, signature);

    if (!isValidSignature) {
      // Log security incident to Errors table
      try {
        await xata().db.Errors.create({
          sale: undefined,
          error_type: ERROR_TYPES.SYSTEM,
          severity: "high",
          source: "xero-webhook",
          message: ["Invalid webhook signature - possible security breach"],
          metadata: {
            receivedSignature: signature,
            timestamp: new Date().toISOString(),
            headers: Object.fromEntries(req.headers.entries()),
          },
          triggered_by: ERROR_TRIGGERED_BY.WEBHOOK,
          timestamp: new Date(),
          resolved: false,
          resolved_by: null,
          resolved_at: null,
          resolved_notes: null,
        });
      } catch (err) {
        logger.error("XERO_WEBHOOKS", "Failed to log security error", { error: err as any });
      }

      return new Response("Invalid signature", { status: 401 });
    }

    // STEP 4: Handle Xero validation handshake
    // Xero sends empty events array to verify endpoint
    if (rawBody.includes('"events":[]') || rawBody === '{"events":[]}') {
      logger.info("XERO_WEBHOOKS", "Handshake validation request");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    // STEP 5: Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      logger.error("XERO_WEBHOOKS", "Invalid JSON", { error: err as any });
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    logger.info("XERO_WEBHOOKS", "Processing events", {
      eventCount: payload.events?.length || 0,
    });

    // STEP 6: Process each event
    const events = payload.events || [];
    let processedCount = 0;
    let errorCount = 0;

    for (const event of events) {
      try {
        // Only process invoice events
        if (event.resourceType !== "invoices") {
          logger.info("XERO_WEBHOOKS", "Skipping non-invoice event", {
            resourceType: event.resourceType,
          });
          continue;
        }

        logger.info("XERO_WEBHOOKS", "Processing invoice event", {
          eventType: event.eventType,
        });

        // Get invoice details from event
        const invoiceId = event.resourceId;

        if (!invoiceId) {
          logger.warn("XERO_WEBHOOKS", "Event missing resourceId");
          continue;
        }

        // Fetch full invoice details from Xero API
        // Use system admin user for webhook token access
        const systemUserId = process.env.XERO_SYSTEM_USER_ID;
        if (!systemUserId || systemUserId === "FILL_ME") {
          logger.error("XERO_WEBHOOKS", "XERO_SYSTEM_USER_ID not configured or is placeholder");
          errorCount++;
          continue;
        }

        const tokens = await getValidTokens(systemUserId);
        if (!tokens) {
          logger.error("XERO_WEBHOOKS", "No valid Xero tokens available");
          errorCount++;
          continue;
        }

        // Fetch invoice from Xero
        const invoiceResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              "xero-tenant-id": tokens.tenantId || "",
              Accept: "application/json",
            },
          }
        );

        if (!invoiceResponse.ok) {
          logger.error("XERO_WEBHOOKS", "Failed to fetch invoice", {
            invoiceId,
            status: invoiceResponse.status,
          });
          errorCount++;
          continue;
        }

        const invoiceData = await invoiceResponse.json();
        const invoice = invoiceData.Invoices?.[0];

        if (!invoice) {
          logger.error("XERO_WEBHOOKS", "Invoice not found", { invoiceId });
          errorCount++;
          continue;
        }

        logger.info("XERO_WEBHOOKS", "Invoice fetched", {
          invoiceNumber: invoice.InvoiceNumber,
          status: invoice.Status,
          amountDue: invoice.AmountDue,
        });

        // Check if invoice is paid
        const isPaid =
          invoice.Status === "PAID" ||
          (invoice.AmountDue !== undefined && invoice.AmountDue === 0);

        if (!isPaid) {
          logger.info("XERO_WEBHOOKS", "Invoice not paid yet - skipping", {
            invoiceNumber: invoice.InvoiceNumber,
          });
          continue;
        }

        // Find corresponding sale in Xata
        const sale = await findSaleByInvoiceNumber(invoice.InvoiceNumber);

        if (!sale) {
          logger.error("XERO_WEBHOOKS", "No sale found for invoice", {
            invoiceNumber: invoice.InvoiceNumber,
          });

          // Log to Errors table
          await xata().db.Errors.create({
            sale: undefined,
            error_type: ERROR_TYPES.SYNC,
            severity: "high",
            source: "xero-webhook",
            message: [
              `Xero invoice ${invoice.InvoiceNumber} not matched to any sale`,
            ],
            metadata: {
              invoiceNumber: invoice.InvoiceNumber,
              invoiceId: invoice.InvoiceID,
              invoiceStatus: invoice.Status,
              amountDue: invoice.AmountDue,
              eventId: event.eventId,
            },
            triggered_by: ERROR_TRIGGERED_BY.WEBHOOK,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });

          errorCount++;
          continue;
        }

        // Update sale payment status
        const result = await updateSalePaymentStatusFromXero(sale.id, {
          Status: invoice.Status,
          AmountDue: invoice.AmountDue,
          PaidDate: invoice.DateString || invoice.UpdatedDateUTC,
        });

        if (result.success) {
          logger.info("XERO_WEBHOOKS", "Sale marked as paid", {
            saleId: sale.id,
            invoiceNumber: invoice.InvoiceNumber,
          });
          processedCount++;
        } else {
          logger.error("XERO_WEBHOOKS", "Failed to update sale", {
            saleId: sale.id,
            error: result.error,
          });
          errorCount++;

          // Log error
          await xata().db.Errors.create({
            sale: sale.id,
            error_type: ERROR_TYPES.WEBHOOK,
            severity: "medium",
            source: "xero-webhook",
            message: [`Failed to update payment status: ${result.error}`],
            metadata: {
              saleId: sale.id,
              invoiceNumber: invoice.InvoiceNumber,
              invoiceStatus: invoice.Status,
              amountDue: invoice.AmountDue,
              errorDetails: result.error,
            },
            triggered_by: ERROR_TRIGGERED_BY.WEBHOOK,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });
        }
      } catch (err: any) {
        logger.error("XERO_WEBHOOKS", "Error processing event", { error: err as any });
        errorCount++;

        // Log error
        try {
          await xata().db.Errors.create({
            sale: undefined,
            error_type: ERROR_TYPES.WEBHOOK,
            severity: "medium",
            source: "xero-webhook",
            message: [`Event processing error: ${err.message || err}`],
            metadata: {
              error: err.message || String(err),
              stack: err.stack,
              eventId: event.eventId,
              resourceId: event.resourceId,
            },
            triggered_by: ERROR_TRIGGERED_BY.WEBHOOK,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });
        } catch (logErr) {
          logger.error("XERO_WEBHOOKS", "Failed to log error", { error: logErr as any });
        }
      }
    }

    logger.info("XERO_WEBHOOKS", "Webhook processing complete", {
      processed: processedCount,
      errors: errorCount,
    });

    return NextResponse.json({
      received: true,
      processed: processedCount,
      errors: errorCount,
    });
  } catch (error: any) {
    logger.error("XERO_WEBHOOKS", "Fatal error", { error: error as any });

    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
