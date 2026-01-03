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
 * Handles Xero's .NET JSON date format: /Date(1731456000000+0000)/
 * Also handles standard ISO dates and timestamps
 */
function safeDate(dateValue: unknown): Date | null {
  if (!dateValue) return null;

  try {
    // Handle Xero's .NET JSON date format: /Date(1731456000000+0000)/
    if (typeof dateValue === 'string') {
      const match = dateValue.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
      if (match) {
        const timestamp = parseInt(match[1], 10);
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          logger.info('XERO_SYNC', 'Parsed .NET JSON date', {
            original: dateValue,
            timestamp,
            parsed: date.toISOString()
          });
          return date;
        }
      }

      // Try standard date parsing (ISO 8601, etc.)
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Handle if it's already a Date object
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      return dateValue;
    }

    // Handle numeric timestamp
    if (typeof dateValue === 'number') {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    logger.warn('XERO_SYNC', 'Could not parse date value', {
      dateValue: String(dateValue),
      type: typeof dateValue
    });
    return null;
  } catch (err) {
    logger.error('XERO_SYNC', 'Error parsing date', {
      dateValue: String(dateValue),
      error: err as any
    });
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
  FullyPaidOnDate?: string;
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

export async function POST(request: Request) {
  const startTime = Date.now();

  // Check for full sync query parameter
  const url = new URL(request.url);
  const fullSync = url.searchParams.get('full') === 'true';

  logger.info('XERO_SYNC', 'Starting Xero invoice sync', {
    fullSync,
    rawParam: url.searchParams.get('full'),
    fullUrl: request.url
  });

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
    // Include ALL statuses (DRAFT, SUBMITTED, AUTHORISED, PAID, etc.)
    // Conditional date filter based on fullSync parameter
    let dateFilter = '';
    let fromDate = null;

    if (!fullSync) {
      // Only fetch invoices from last 60 days (default)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      dateFilter = `Date>=DateTime(${sixtyDaysAgo.getFullYear()},${sixtyDaysAgo.getMonth() + 1},${sixtyDaysAgo.getDate()})`;
      fromDate = sixtyDaysAgo.toISOString();
    }

    logger.info('XERO_SYNC', 'Fetching invoices with pagination', {
      fullSync,
      dateFilter: dateFilter || 'NONE (fetching all invoices)',
      from: fromDate || 'ALL TIME'
    });

    const allInvoices: XeroInvoice[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      // Build URL with conditional date filter
      const xeroUrl = dateFilter
        ? `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(dateFilter)}&page=${page}`
        : `https://api.xero.com/api.xro/2.0/Invoices?page=${page}`;

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

        // Parse invoice date for logging
        const invoiceDate = safeDate(invoice.Date);
        const formattedDate = invoiceDate ? invoiceDate.toISOString().split('T')[0] : invoice.Date;

        logger.info('XERO_SYNC', 'Processing invoice', {
          invoiceNumber: invoice.InvoiceNumber,
          xeroDateRaw: invoice.Date,
          parsedDate: formattedDate,
          status: invoice.Status,
          fullyPaidOnDate: invoice.FullyPaidOnDate || 'N/A'
        });

        // Check if invoice already exists
        const existing = await xata.db.Sales.filter({
          xero_invoice_id: invoice.InvoiceID
        }).getFirst();

        if (existing) {
          // Update status and/or date if changed
          const statusChanged = existing.invoice_status !== invoice.Status;
          const dateChanged = existing.sale_date && invoiceDate && existing.sale_date.getTime() !== invoiceDate.getTime();

          // During full sync, update date even if existing date is null
          const shouldUpdateDate = fullSync && invoiceDate && (
            !existing.sale_date ||
            existing.sale_date.getTime() !== invoiceDate.getTime()
          );

          // Detailed logging for debugging
          logger.info('XERO_SYNC', 'Checking existing record for updates', {
            invoiceNumber: invoice.InvoiceNumber,
            recordId: existing.id,
            fullSync,
            existingDate: existing.sale_date?.toISOString() || 'null',
            xeroDate: invoiceDate?.toISOString() || 'null',
            statusChanged,
            dateChanged,
            shouldUpdateDate,
            willUpdate: statusChanged || dateChanged || shouldUpdateDate
          });

          if (statusChanged || dateChanged || shouldUpdateDate) {
            const updates: any = {};
            if (statusChanged) {
              updates.invoice_status = invoice.Status;
              // Use actual paid date from Xero if available, otherwise null
              updates.invoice_paid_date = invoice.FullyPaidOnDate ? safeDate(invoice.FullyPaidOnDate) : null;
            }
            if (shouldUpdateDate) {
              // Update dates during full sync to fix historical data
              updates.sale_date = invoiceDate;
            }

            logger.info('XERO_SYNC', 'Updating invoice', {
              invoiceNumber: invoice.InvoiceNumber,
              fullSync,
              statusChanged,
              shouldUpdateDate,
              oldStatus: existing.invoice_status,
              newStatus: invoice.Status,
              oldDate: existing.sale_date?.toISOString().split('T')[0] || 'null',
              newDate: formattedDate,
              updateFields: Object.keys(updates)
            });

            await xata.db.Sales.update(existing.id, updates);
            updatedCount++;
          } else {
            logger.info('XERO_SYNC', 'Skipping - already exists with same data', {
              invoiceNumber: invoice.InvoiceNumber,
              status: invoice.Status,
              date: formattedDate
            });
            skippedCount++;
          }
        } else {
          // Create new sale record (needs allocation)
          const contactName = invoice.Contact?.Name || 'Unknown';
          const total = invoice.Total || 0;
          const lineItems = invoice.LineItems || [];
          const firstItem = lineItems[0] || {};

          // Safely parse dates
          const saleDate = safeDate(invoice.Date);
          const dueDate = safeDate(invoice.DueDate);

          if (!saleDate) {
            logger.error('XERO_SYNC', 'Invalid sale date - skipping invoice', {
              invoiceNumber: invoice.InvoiceNumber,
              dateValue: invoice.Date
            });
            errors.push({
              invoiceNumber: invoice.InvoiceNumber,
              error: `Invalid sale date: ${invoice.Date}`
            });
            continue; // Skip this invoice if date is invalid
          }
          if (invoice.DueDate && !dueDate) {
            logger.warn('XERO_SYNC', 'Invalid due date', {
              invoiceNumber: invoice.InvoiceNumber,
              dateValue: invoice.DueDate
            });
          }

          logger.info('XERO_SYNC', 'Creating new sale', {
            invoiceNumber: invoice.InvoiceNumber,
            date: formattedDate,
            contactName,
            total
          });

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
            sale_date: saleDate, // Use invoice date from Xero (validated above)
            sale_amount_inc_vat: total,
            sale_amount_ex_vat: invoice.SubTotal || (total / 1.2), // Use SubTotal or assume 20% VAT
            currency: 'GBP',
            source: 'xero_import', // Xero sync origin
            needs_allocation: true, // Requires shopper assignment
            buyer: buyer ? buyer.id : null,
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
