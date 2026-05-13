/**
 * Club 19 Sales OS - Xero Webhook Handler
 *
 * High-security webhook endpoint for receiving Xero invoice events
 * Uses HMAC-SHA256 signature verification to ensure authenticity
 *
 * Handles:
 * - Signature verification with XERO_WEBHOOK_SECRET
 * - Intent to Receive validation handshake from Xero
 * - Invoice CREATE and UPDATE events
 * - Automatic payment status updates when invoices are paid
 * - Updates existing Sales records based on xero_invoice_id
 * - Error logging and structured logging for debugging
 *
 * Event flow:
 * 1. Xero sends POST with x-xero-signature header
 * 2. Validate HMAC-SHA256 signature
 * 3. For validation requests (empty payload), return 200 OK
 * 4. For invoice events, fetch full invoice data from Xero API
 * 5. Find matching Sale by xero_invoice_id
 * 6. Update invoice_status and invoice_paid_date fields
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { sales, buyers, errors, lineItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  findSaleByInvoiceNumber,
  updateSalePaymentStatusFromXero,
} from "@/lib/xata-sales";
import { getValidTokens } from "@/lib/xero-auth";
import { ERROR_TYPES, ERROR_TRIGGERED_BY } from "@/lib/error-types";
import * as logger from "@/lib/logger";
import {
  mapXeroInvoiceToSaleFields,
  xeroAmountsChanged,
} from "@/lib/xero-invoice-mapping";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ============================================================================
// ORIGINAL XATA CLIENT (REMOVED)
// ============================================================================

// ORIGINAL XATA: import { getXataClient } from "@/src/xata";
// ORIGINAL XATA: let _xata: ReturnType<typeof getXataClient> | null = null;
// ORIGINAL XATA: function xata() {
// ORIGINAL XATA:   if (_xata) return _xata;
// ORIGINAL XATA:   _xata = getXataClient();
// ORIGINAL XATA:   return _xata;
// ORIGINAL XATA: }

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
  const webhookKey = process.env.XERO_WEBHOOK_SECRET;

  if (!webhookKey || webhookKey === "FILL_ME") {
    logger.error("XERO_WEBHOOKS", "XERO_WEBHOOK_SECRET not configured or is placeholder");
    return false;
  }

  try {
    // Debug: Log key and payload info
    logger.info("XERO_WEBHOOKS", "Signature verification debug", {
      keyPrefix: webhookKey.substring(0, 5) + "...",
      keySuffix: "..." + webhookKey.substring(webhookKey.length - 5),
      keyLength: webhookKey.length,
      payloadLength: rawBody.length,
      payloadPreview: rawBody.substring(0, 100),
    });

    // Method 1: Use key as-is (string)
    const hash1 = crypto.createHmac("sha256", webhookKey)
      .update(rawBody)
      .digest("base64");

    // Method 2: Decode key from base64 first (Xero keys are often base64-encoded)
    let hash2: string | null = null;
    try {
      const decodedKey = Buffer.from(webhookKey, "base64");
      hash2 = crypto.createHmac("sha256", decodedKey)
        .update(rawBody)
        .digest("base64");
    } catch (decodeErr) {
      logger.warn("XERO_WEBHOOKS", "Failed to decode key as base64", { error: decodeErr as any });
    }

    logger.info("XERO_WEBHOOKS", "Signature comparison", {
      method1_raw_key: hash1.substring(0, 10) + "...",
      method2_decoded_key: hash2 ? hash2.substring(0, 10) + "..." : "N/A",
      received: signature.substring(0, 10) + "...",
      method1_full: hash1,
      method2_full: hash2 || "N/A",
      received_full: signature,
    });

    // Check both methods
    const isValidMethod1 = hash1 === signature;
    const isValidMethod2 = hash2 === signature;

    if (isValidMethod1) {
      logger.info("XERO_WEBHOOKS", "Signature verified using method 1 (raw key)");
      return true;
    }

    if (isValidMethod2) {
      logger.info("XERO_WEBHOOKS", "Signature verified using method 2 (decoded key)");
      return true;
    }

    logger.error("XERO_WEBHOOKS", "Invalid signature - both methods failed", {
      method1: hash1.substring(0, 15) + "...",
      method2: hash2 ? hash2.substring(0, 15) + "..." : "N/A",
      received: signature.substring(0, 15) + "...",
    });

    return false;
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
        // ORIGINAL XATA: await xata().db.Errors.create({
        // ORIGINAL XATA:   severity: "high",
        // ORIGINAL XATA:   source: "xero-webhook",
        // ORIGINAL XATA:   message: ["Invalid webhook signature - possible security breach"],
        // ORIGINAL XATA:   timestamp: new Date(),
        // ORIGINAL XATA:   resolved: false,
        // ORIGINAL XATA: });
        await db.insert(errors).values({
          severity: "high",
          source: "xero-webhook",
          message: ["Invalid webhook signature - possible security breach"],
          timestamp: new Date(),
          resolved: false,
        });
      } catch (err) {
        logger.error("XERO_WEBHOOKS", "Failed to log security error", { error: err as any });
      }

      return new Response("Invalid signature", { status: 401 });
    }

    // STEP 4: Handle Xero validation handshake
    // Xero sends an "Intent to Receive" request with valid signature but empty/minimal payload
    // We must respond with 200 OK to confirm the endpoint is valid
    if (!rawBody || rawBody.trim() === '' || rawBody.includes('"events":[]') || rawBody === '{"events":[]}') {
      logger.info("XERO_WEBHOOKS", "Validation handshake - Intent to Receive");
      return new Response(null, { status: 200 });
    }

    // STEP 5: Parse JSON payload
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      logger.error("XERO_WEBHOOKS", "Invalid JSON", { error: err as any });
      // For validation requests that aren't valid JSON, still return 200 if signature was valid
      return new Response(null, { status: 200 });
    }

    logger.info("XERO_WEBHOOKS", "Processing events", {
      eventCount: (payload as { events?: unknown[] }).events?.length || 0,
    });

    // STEP 6: Process each event
    const events = (payload as { events?: unknown[] }).events || [];
    let processedCount = 0;
    let errorCount = 0;

    for (const event of events) {
      const webhookEvent = event as {
        resourceUrl?: string;
        resourceId?: string;
        eventDateUtc?: string;
        eventType?: string;
        eventCategory?: string;
        tenantId?: string;
        tenantType?: string;
      };

      try {

        // Only process invoice events
        if (webhookEvent.eventCategory !== "INVOICE") {
          logger.info("XERO_WEBHOOKS", "Skipping non-invoice event", {
            eventCategory: webhookEvent.eventCategory,
          });
          continue;
        }

        logger.info("XERO_WEBHOOKS", "Processing invoice event", {
          eventType: webhookEvent.eventType,
          resourceId: webhookEvent.resourceId,
          eventDateUtc: webhookEvent.eventDateUtc,
        });

        // Log the full event for debugging
        console.log("[XERO_WEBHOOKS] Full event:", JSON.stringify(webhookEvent, null, 2));

        // Get invoice details from event
        const invoiceId = webhookEvent.resourceId;

        if (!invoiceId) {
          logger.warn("XERO_WEBHOOKS", "Event missing resourceId");
          continue;
        }

        // Fetch full invoice details from Xero API
        // Use integration user for webhook token access
        const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
        if (!integrationUserId) {
          logger.error("XERO_WEBHOOKS", "XERO_INTEGRATION_CLERK_USER_ID not configured");
          errorCount++;
          continue;
        }

        const tokens = await getValidTokens(integrationUserId);
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
          invoiceId: invoice.InvoiceID,
          status: invoice.Status,
          amountDue: invoice.AmountDue,
        });

        // Find corresponding sale in database by xero_invoice_id (more reliable than invoice number)
        console.log("[XERO_WEBHOOKS] Looking for sale with xero_invoice_id:", invoice.InvoiceID);

        // ORIGINAL XATA: let sale = await xata().db.Sales
        // ORIGINAL XATA:   .filter({ xero_invoice_id: invoice.InvoiceID })
        // ORIGINAL XATA:   .getFirst();
        const saleResults = await db
          .select()
          .from(sales)
          .where(eq(sales.xeroInvoiceId, invoice.InvoiceID))
          .limit(1);
        let sale = saleResults[0] || null;

        // Fallback: Try to find by invoice number if ID doesn't match
        if (!sale && invoice.InvoiceNumber) {
          console.log("[XERO_WEBHOOKS] No match by ID, trying invoice number:", invoice.InvoiceNumber);
          // ORIGINAL XATA: sale = await xata().db.Sales
          // ORIGINAL XATA:   .filter({ xero_invoice_number: invoice.InvoiceNumber })
          // ORIGINAL XATA:   .getFirst();
          const fallbackResults = await db
            .select()
            .from(sales)
            .where(eq(sales.xeroInvoiceNumber, invoice.InvoiceNumber))
            .limit(1);
          sale = fallbackResults[0] || null;
        }

        if (!sale) {
          // Only create for ACCREC (sales invoices), not ACCPAY (bills)
          if (invoice.Type !== 'ACCREC') {
            logger.info("XERO_WEBHOOKS", "Skipping non-sales invoice (ACCPAY bill)", {
              invoiceNumber: invoice.InvoiceNumber,
              type: invoice.Type,
            });
            continue;
          }

          logger.info("XERO_WEBHOOKS", "Creating new unallocated sale from webhook", {
            invoiceNumber: invoice.InvoiceNumber,
            invoiceId: invoice.InvoiceID,
            contactName: invoice.Contact?.Name,
            total: invoice.Total,
          });

          // Find or create the buyer
          let buyer = null;
          if (invoice.Contact?.Name) {
            // ORIGINAL XATA: buyer = await xata().db.Buyers
            // ORIGINAL XATA:   .filter({ name: invoice.Contact.Name })
            // ORIGINAL XATA:   .getFirst();
            const buyerResults = await db
              .select()
              .from(buyers)
              .where(eq(buyers.name, invoice.Contact.Name))
              .limit(1);
            buyer = buyerResults[0] || null;

            if (!buyer) {
              // Check by Xero contact ID
              if (invoice.Contact?.ContactID) {
                // ORIGINAL XATA: buyer = await xata().db.Buyers
                // ORIGINAL XATA:   .filter({ xero_contact_id: invoice.Contact.ContactID })
                // ORIGINAL XATA:   .getFirst();
                const buyerByContactResults = await db
                  .select()
                  .from(buyers)
                  .where(eq(buyers.xeroContactId, invoice.Contact.ContactID))
                  .limit(1);
                buyer = buyerByContactResults[0] || null;
              }
            }

            if (!buyer) {
              // Create new buyer
              // ORIGINAL XATA: buyer = await xata().db.Buyers.create({
              // ORIGINAL XATA:   name: invoice.Contact.Name,
              // ORIGINAL XATA:   xero_contact_id: invoice.Contact?.ContactID || null,
              // ORIGINAL XATA: });
              const [newBuyer] = await db
                .insert(buyers)
                .values({
                  name: invoice.Contact.Name,
                  xeroContactId: invoice.Contact?.ContactID || null,
                })
                .returning();
              buyer = newBuyer;
              logger.info("XERO_WEBHOOKS", "Created new buyer", {
                buyerId: buyer.id,
                buyerName: buyer.name,
              });
            }
          }

          // Parse invoice date safely
          let saleDate: Date;
          if (invoice.DateString) {
            saleDate = new Date(invoice.DateString);
          } else if (invoice.Date) {
            // Handle Xero's /Date(timestamp)/ format
            const match = invoice.Date.match(/\/Date\((\d+)\)\//);
            saleDate = match ? new Date(parseInt(match[1])) : new Date();
          } else {
            saleDate = new Date();
          }

          // Get first line item description
          const firstLineItem = invoice.LineItems?.[0];
          const itemDescription = firstLineItem?.Description || 'Imported from Xero';

          // Create the sale record
          // ORIGINAL XATA: const newSale = await xata().db.Sales.create({
          // ORIGINAL XATA:   xero_invoice_id: invoice.InvoiceID,
          // ORIGINAL XATA:   xero_invoice_number: invoice.InvoiceNumber,
          // ORIGINAL XATA:   xero_invoice_url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.InvoiceID}`,
          // ORIGINAL XATA:   source: 'xero_import',
          // ORIGINAL XATA:   needs_allocation: true,
          // ORIGINAL XATA:   sale_date: saleDate,
          // ORIGINAL XATA:   buyer: buyer?.id || null,
          // ORIGINAL XATA:   sale_amount_inc_vat: invoice.Total || 0,
          // ORIGINAL XATA:   sale_amount_ex_vat: invoice.SubTotal || (invoice.Total / 1.2),
          // ORIGINAL XATA:   currency: invoice.CurrencyCode || 'GBP',
          // ORIGINAL XATA:   brand: 'Unknown',
          // ORIGINAL XATA:   category: 'Unknown',
          // ORIGINAL XATA:   item_title: itemDescription,
          // ORIGINAL XATA:   quantity: firstLineItem?.Quantity || 1,
          // ORIGINAL XATA:   buy_price: 0,
          // ORIGINAL XATA:   gross_margin: 0,
          // ORIGINAL XATA:   invoice_status: invoice.Status,
          // ORIGINAL XATA:   invoice_paid_date: invoice.Status === 'PAID' ? new Date() : undefined,
          // ORIGINAL XATA:   internal_notes: `Auto-imported via Xero webhook on ${new Date().toISOString()}. Client: ${invoice.Contact?.Name || 'Unknown'}. Needs shopper allocation and cost details.`,
          // ORIGINAL XATA: });
          const insertMapped = mapXeroInvoiceToSaleFields(invoice);
          const [newSale] = await db
            .insert(sales)
            .values({
              xeroInvoiceId: invoice.InvoiceID,
              xeroInvoiceNumber: invoice.InvoiceNumber,
              xeroInvoiceUrl: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.InvoiceID}`,
              source: 'xero_import',
              needsAllocation: true,
              saleDate: saleDate,
              buyerId: buyer?.id || null,
              saleAmountIncVat: insertMapped.saleAmountIncVat,
              saleAmountExVat: invoice.SubTotal || (insertMapped.saleAmountIncVat / 1.2),
              xeroAmountPaid: insertMapped.xeroAmountPaid,
              xeroAmountDue: insertMapped.xeroAmountDue,
              xeroAmountCredited: insertMapped.xeroAmountCredited,
              currency: invoice.CurrencyCode || 'GBP',
              brand: 'Unknown',
              category: 'Unknown',
              itemTitle: itemDescription,
              quantity: firstLineItem?.Quantity || 1,
              buyPrice: 0,
              grossMargin: 0,
              invoiceStatus: insertMapped.invoiceStatus,
              invoicePaidDate: insertMapped.invoiceStatus === 'PAID' ? new Date() : null,
              internalNotes: `Auto-imported via Xero webhook on ${new Date().toISOString()}. Client: ${invoice.Contact?.Name || 'Unknown'}. Needs shopper allocation and cost details.`,
            })
            .returning();

          // Store all line items from the Xero invoice
          const xeroLineItems = invoice.LineItems || [];
          if (newSale && xeroLineItems.length > 0) {
            for (let i = 0; i < xeroLineItems.length; i++) {
              const li = xeroLineItems[i];
              await db.insert(lineItems).values({
                saleId: newSale.id,
                lineNumber: i + 1,
                description: li.Description || 'Imported from Xero',
                quantity: li.Quantity || 1,
                sellPrice: li.UnitAmount || 0,
                lineTotal: li.LineAmount || 0,
                brand: 'Unknown',
                category: 'Unknown',
                buyPrice: 0,
                lineMargin: 0,
                source: 'xero_import',
              });
            }
            logger.info("XERO_WEBHOOKS", "Stored line items", {
              invoiceNumber: invoice.InvoiceNumber,
              lineItemCount: xeroLineItems.length,
            });
          }

          logger.info("XERO_WEBHOOKS", "Created unallocated sale from webhook", {
            saleId: newSale.id,
            invoiceNumber: invoice.InvoiceNumber,
            buyerName: invoice.Contact?.Name,
            total: invoice.Total,
          });
          console.log("[XERO_WEBHOOKS] CREATED new sale:", newSale.id, "for invoice:", invoice.InvoiceNumber);
          processedCount++;
          continue;
        }

        console.log("[XERO_WEBHOOKS] FOUND sale:", sale.id, "Current status:", sale.invoiceStatus);

        logger.info("XERO_WEBHOOKS", "Found matching sale", {
          saleId: sale.id,
          currentStatus: sale.invoiceStatus,
          newStatus: invoice.Status,
        });

        // Update sale with latest invoice data — use the shared mapper so
        // credit-note flips (PAID → CREDITED) and amount changes are handled
        // consistently with the cron paths.
        const mapped = mapXeroInvoiceToSaleFields(invoice);
        const updateData: Partial<typeof sales.$inferInsert> = {
          invoiceStatus: mapped.invoiceStatus,
          xeroAmountPaid: mapped.xeroAmountPaid,
          xeroAmountDue: mapped.xeroAmountDue,
          xeroAmountCredited: mapped.xeroAmountCredited,
        };

        // If invoice is now paid, set the paid date
        if (mapped.invoiceStatus === "PAID" && !sale.invoicePaidDate) {
          updateData.invoicePaidDate = new Date();
          logger.info("XERO_WEBHOOKS", "Marking invoice as paid", {
            saleId: sale.id,
            invoiceNumber: invoice.InvoiceNumber,
          });
        }

        // Update the sale
        // ORIGINAL XATA: console.log("[XERO_WEBHOOKS] Updating sale", sale.id, "with:", JSON.stringify(updateData));
        // ORIGINAL XATA: await xata().db.Sales.update(sale.id, updateData);
        console.log("[XERO_WEBHOOKS] Updating sale", sale.id, "with:", JSON.stringify(updateData));
        await db
          .update(sales)
          .set(updateData)
          .where(eq(sales.id, sale.id));

        logger.info("XERO_WEBHOOKS", "Sale updated successfully", {
          saleId: sale.id,
          invoiceNumber: invoice.InvoiceNumber,
          oldStatus: sale.invoiceStatus,
          newStatus: invoice.Status,
        });
        console.log("[XERO_WEBHOOKS] SUCCESS - Updated", sale.id, "from", sale.invoiceStatus, "to", invoice.Status);
        processedCount++;
      } catch (err: any) {
        logger.error("XERO_WEBHOOKS", "Error processing event", {
          message: err.message,
          stack: err.stack,
          event: webhookEvent,
          invoiceId: webhookEvent.resourceId,
          eventType: webhookEvent.eventType,
        });
        errorCount++;

        // Determine severity based on error type
        const isAuthError = err.message?.includes("Xero session expired") ||
                           err.message?.includes("reconnect Xero");
        const severity = isAuthError ? "high" : "medium";

        // Log error with full details
        try {
          // ORIGINAL XATA: await xata().db.Errors.create({
          // ORIGINAL XATA:   severity,
          // ORIGINAL XATA:   source: "xero-webhook",
          // ORIGINAL XATA:   message: [
          // ORIGINAL XATA:     `Event processing error: ${err.message || err}`,
          // ORIGINAL XATA:     `Event type: ${webhookEvent.eventType}`,
          // ORIGINAL XATA:     `Invoice ID: ${webhookEvent.resourceId}`,
          // ORIGINAL XATA:     isAuthError ? "ACTION REQUIRED: Admin must reconnect Xero at /admin/xero" : "",
          // ORIGINAL XATA:   ].filter(Boolean),
          // ORIGINAL XATA:   timestamp: new Date(),
          // ORIGINAL XATA:   resolved: false,
          // ORIGINAL XATA: });
          await db.insert(errors).values({
            severity,
            source: "xero-webhook",
            message: [
              `Event processing error: ${err.message || err}`,
              `Event type: ${webhookEvent.eventType}`,
              `Invoice ID: ${webhookEvent.resourceId}`,
              isAuthError ? "ACTION REQUIRED: Admin must reconnect Xero at /admin/xero" : "",
            ].filter(Boolean),
            timestamp: new Date(),
            resolved: false,
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
