/**
 * Club 19 Sales OS - Xero Invoice Sync API
 *
 * POST endpoint to sync invoices from Xero
 * Fetches invoices updated in last 7 days and creates/updates Sales records
 *
 * Auth: Superadmin, Operations, or Founder only
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { getValidTokens } from '@/lib/xero-auth';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Safely convert a date value to Date object or null
 * Handles invalid dates without throwing errors
 */
function safeDate(dateValue: unknown): Date | null {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue as string | number | Date);
    if (isNaN(date.getTime())) {
      logger.warn('XERO_SYNC', 'Invalid date value', { dateValue: String(dateValue) });
      return null;
    }
    return date;
  } catch (err) {
    logger.error('XERO_SYNC', 'Error parsing date', { dateValue: String(dateValue), error: err as any });
    return null;
  }
}

/**
 * Safely convert a date to ISO string or null
 */
function safeISOString(dateValue: unknown): string | null {
  const date = safeDate(dateValue);
  if (!date) return null;
  try {
    return date.toISOString();
  } catch (err) {
    logger.error('XERO_SYNC', 'Error converting to ISO string', { error: err as any });
    return null;
  }
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: 'ACCREC' | 'ACCPAY';
  Status: string;
  Date: string;
  DueDate: string;
  Total: number;
  SubTotal: number;
  TotalTax: number;
  AmountDue: number;
  AmountPaid: number;
  AmountCredited: number;
  UpdatedDateUTC: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
  LineItems?: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    LineAmount: number;
    AccountCode: string;
  }>;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

export async function POST() {
  const startTime = Date.now();
  logger.info('XERO_SYNC', 'Starting Xero invoice sync');

  try {
    // 1. Auth check - superadmin, operations, or founder only
    const { userId } = await auth();
    if (!userId) {
      logger.error('XERO_SYNC', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('XERO_SYNC', 'User role check', { role });

    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      logger.error('XERO_SYNC', 'Forbidden - insufficient role', { role });
      return NextResponse.json({ error: 'Forbidden - requires superadmin, operations, or founder role' }, { status: 403 });
    }

    // 2. Get system user's Xero tokens
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId || systemUserId === 'FILL_ME') {
      logger.error('XERO_SYNC', 'XERO_SYSTEM_USER_ID not configured');
      return NextResponse.json({
        error: 'XERO_SYSTEM_USER_ID not configured. Please set environment variable.'
      }, { status: 500 });
    }

    logger.info('XERO_SYNC', 'Using system user', { systemUserId });

    const tokens = await getValidTokens(systemUserId);
    logger.info('XERO_SYNC', 'Got valid Xero tokens');

    // 3. Fetch all invoices from Xero with pagination
    const statusFilter = 'AUTHORISED,PAID,SUBMITTED';
    logger.info('XERO_SYNC', 'Fetching invoices with pagination', { statusFilter });

    const allInvoices: XeroInvoice[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?Statuses=${statusFilter}&page=${page}`;

      logger.info('XERO_SYNC', 'Fetching page', { page });

      const xeroResponse = await fetch(xeroUrl, {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Xero-Tenant-Id': tokens.tenantId,
          'Accept': 'application/json',
        },
      });

      if (!xeroResponse.ok) {
        const errorText = await xeroResponse.text();
        logger.error('XERO_SYNC', 'Xero API error', { status: xeroResponse.status, details: errorText });
        return NextResponse.json({
          error: 'Xero API error',
          details: errorText
        }, { status: 500 });
      }

      const xeroData: XeroInvoicesResponse = await xeroResponse.json();
      const invoices = xeroData.Invoices || [];

      logger.info('XERO_SYNC', 'Page fetched', { page, count: invoices.length });

      if (invoices.length === 0) {
        hasMorePages = false;
      } else {
        allInvoices.push(...invoices);
        page++;
      }
    }

    const invoices = allInvoices;
    logger.info('XERO_SYNC', 'All invoices fetched', { total: invoices.length, pages: page - 1 });

    // 4. Process each invoice
    const xata = getXataClient();
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ invoiceNumber: string; error: string }> = [];

    for (const invoice of invoices) {
      try {
        // Only process ACCREC (sales) invoices, not ACCPAY (bills)
        if (invoice.Type !== 'ACCREC') {
          logger.info('XERO_SYNC', 'Skipping non-ACCREC invoice', {
            invoiceNumber: invoice.InvoiceNumber,
            type: invoice.Type
          });
          skippedCount++;
          continue;
        }

        logger.info('XERO_SYNC', 'Processing invoice', {
          invoiceNumber: invoice.InvoiceNumber,
          status: invoice.Status
        });

        // Check if invoice already exists
        const existing = await xata.db.Sales.filter({
          xero_invoice_id: invoice.InvoiceID
        }).getFirst();

        if (existing) {
          // Update status if changed
          if (existing.invoice_status !== invoice.Status) {
            logger.info('XERO_SYNC', 'Updating invoice status', {
              invoiceNumber: invoice.InvoiceNumber,
              oldStatus: existing.invoice_status,
              newStatus: invoice.Status
            });
            await xata.db.Sales.update(existing.id, {
              invoice_status: invoice.Status,
              invoice_paid_date: invoice.Status === 'PAID' ? new Date() : null,
            });
            updatedCount++;
          } else {
            logger.info('XERO_SYNC', 'No change for invoice', { invoiceNumber: invoice.InvoiceNumber });
            skippedCount++;
          }
        } else {
          // Create new sale record (needs allocation)
          const contactName = invoice.Contact?.Name || 'Unknown';
          const total = invoice.Total || 0;
          const lineItems = invoice.LineItems || [];
          const firstItem = lineItems[0] || {};

          logger.info('XERO_SYNC', 'Creating new sale', {
            invoiceNumber: invoice.InvoiceNumber,
            contactName
          });

          // Safely parse dates
          const saleDate = safeDate(invoice.Date);
          const dueDate = safeDate(invoice.DueDate);

          if (!saleDate) {
            logger.warn('XERO_SYNC', 'Invalid sale date', {
              invoiceNumber: invoice.InvoiceNumber,
              dateValue: invoice.Date
            });
          }
          if (invoice.DueDate && !dueDate) {
            logger.warn('XERO_SYNC', 'Invalid due date', {
              invoiceNumber: invoice.InvoiceNumber,
              dateValue: invoice.DueDate
            });
          }

          // Try to find or create buyer
          let buyer = await xata.db.Buyers.filter({
            name: { $iContains: contactName }
          }).getFirst();

          if (buyer) {
            logger.info('XERO_SYNC', 'Found existing buyer', { buyerName: buyer.name });
          } else {
            // Create new buyer record
            logger.info('XERO_SYNC', 'Creating new buyer', { contactName });
            buyer = await xata.db.Buyers.create({
              name: contactName,
              xero_contact_id: invoice.Contact?.ContactID || null,
            });
            logger.info('XERO_SYNC', 'Created buyer', { buyerName: buyer.name, buyerId: buyer.id });
          }

          const currentDate = new Date();
          const dueDateNote = dueDate ? ` Due: ${safeISOString(dueDate) || 'Unknown'}` : '';
          const importNotes = `Auto-imported from Xero on ${safeISOString(currentDate) || currentDate.toString()}. Client: ${contactName}.${dueDateNote} Needs shopper allocation and cost details.`;

          await xata.db.Sales.create({
            xero_invoice_id: invoice.InvoiceID,
            xero_invoice_number: invoice.InvoiceNumber,
            invoice_status: invoice.Status,
            sale_date: saleDate || currentDate, // Fallback to current date if invalid
            invoice_due_date: dueDate,
            sale_amount_inc_vat: total,
            sale_amount_ex_vat: invoice.SubTotal || (total / 1.2), // Use SubTotal or assume 20% VAT
            currency: 'GBP',
            needs_allocation: true, // Requires shopper assignment
            buyer: buyer ? buyer.id : null,
            buyer_name: contactName,
            brand: 'Unknown',
            category: 'Unknown',
            item_title: firstItem.Description || 'Imported from Xero',
            quantity: firstItem.Quantity || 1,
            buy_price: 0, // Unknown - Operations will need to fill in
            gross_margin: 0,
            internal_notes: importNotes,
          });
          newCount++;
          logger.info('XERO_SYNC', 'Created new sale', { invoiceNumber: invoice.InvoiceNumber });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('XERO_SYNC', 'Error processing invoice', {
          invoiceNumber: invoice.InvoiceNumber || invoice.InvoiceID,
          error: err as any
        });
        errors.push({
          invoiceNumber: invoice.InvoiceNumber || invoice.InvoiceID,
          error: errorMessage
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('XERO_SYNC', 'Sync completed', {
      duration: `${duration}ms`,
      new: newCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errors.length
    });

    return NextResponse.json({
      success: true,
      summary: {
        total: invoices.length,
        new: newCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length,
      },
      errors,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('XERO_SYNC', 'Fatal error during sync', { error: error as any });
    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage
    }, { status: 500 });
  }
}
