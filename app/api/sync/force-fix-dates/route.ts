/**
 * Club 19 Sales OS - Force Fix Invoice Dates
 *
 * POST /api/sync/force-fix-dates
 * One-time fix: Fetches ALL invoices from Xero and forces date updates
 * on ALL matching Sales records, regardless of current values.
 *
 * Superadmin only endpoint
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { getValidTokens } from '@/lib/xero-auth';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for long-running operation

/**
 * Parse Xero's .NET JSON date format: /Date(1731456000000+0000)/
 */
function parseXeroDate(dateValue: unknown): Date | null {
  if (!dateValue) return null;

  try {
    if (typeof dateValue === 'string') {
      const match = dateValue.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
      if (match) {
        const timestamp = parseInt(match[1], 10);
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      return dateValue;
    }

    if (typeof dateValue === 'number') {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  } catch {
    return null;
  }
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: string;
  Date: string;
  Status: string;
  FullyPaidOnDate?: string;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

export async function POST(request: Request) {
  const startTime = Date.now();

  logger.info('FORCE_FIX_DATES', 'Starting force date fix');

  try {
    // 1. Auth check - superadmin only
    const { userId } = await auth();
    if (!userId) {
      logger.error('FORCE_FIX_DATES', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('FORCE_FIX_DATES', 'User role check', { role });

    if (role !== 'superadmin') {
      logger.error('FORCE_FIX_DATES', 'Forbidden - insufficient role', { role });
      return NextResponse.json(
        { error: 'Forbidden - requires superadmin role' },
        { status: 403 }
      );
    }

    // 2. Get system user's Xero tokens
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId || systemUserId === 'FILL_ME') {
      logger.error('FORCE_FIX_DATES', 'XERO_SYSTEM_USER_ID not configured');
      return NextResponse.json(
        { error: 'XERO_SYSTEM_USER_ID not configured' },
        { status: 500 }
      );
    }

    const tokens = await getValidTokens(systemUserId);
    logger.info('FORCE_FIX_DATES', 'Got valid Xero tokens');

    // 3. Fetch ALL invoices from Xero (no date filter)
    logger.info('FORCE_FIX_DATES', 'Fetching ALL invoices from Xero (no date limit)');

    const allInvoices: XeroInvoice[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?page=${page}`;

      logger.info('FORCE_FIX_DATES', 'Fetching page', { page });

      const xeroResponse = await fetch(xeroUrl, {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Xero-Tenant-Id': tokens.tenantId,
          'Accept': 'application/json',
        },
      });

      if (!xeroResponse.ok) {
        const errorText = await xeroResponse.text();
        logger.error('FORCE_FIX_DATES', 'Xero API error', {
          status: xeroResponse.status,
          details: errorText
        });
        return NextResponse.json(
          { error: 'Xero API error', details: errorText },
          { status: 500 }
        );
      }

      const xeroData: XeroInvoicesResponse = await xeroResponse.json();
      const invoices = xeroData.Invoices || [];

      logger.info('FORCE_FIX_DATES', 'Page fetched', {
        page,
        count: invoices.length
      });

      if (invoices.length === 0) {
        hasMorePages = false;
      } else {
        allInvoices.push(...invoices);
        page++;
      }
    }

    logger.info('FORCE_FIX_DATES', 'All invoices fetched', {
      total: allInvoices.length,
      pages: page - 1
    });

    // 4. Force update dates on ALL matching Sales records
    const xata = getXataClient();
    let updatedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;
    const errors: Array<{ invoiceNumber: string; error: string }> = [];

    for (const invoice of allInvoices) {
      try {
        // Only process ACCREC (sales) invoices
        if (invoice.Type !== 'ACCREC') {
          skippedCount++;
          continue;
        }

        // Parse the invoice date
        const invoiceDate = parseXeroDate(invoice.Date);
        if (!invoiceDate) {
          logger.warn('FORCE_FIX_DATES', 'Could not parse date', {
            invoiceNumber: invoice.InvoiceNumber,
            dateValue: invoice.Date
          });
          errors.push({
            invoiceNumber: invoice.InvoiceNumber,
            error: `Could not parse date: ${invoice.Date}`
          });
          skippedCount++;
          continue;
        }

        // Find matching Sale record
        const existing = await xata.db.Sales.filter({
          xero_invoice_id: invoice.InvoiceID
        }).getFirst();

        if (!existing) {
          notFoundCount++;
          continue;
        }

        // FORCE UPDATE - no conditions, just update
        const oldDate = existing.sale_date?.toISOString().split('T')[0] || 'null';
        const newDate = invoiceDate.toISOString().split('T')[0];

        logger.info('FORCE_FIX_DATES', 'Force updating date', {
          invoiceNumber: invoice.InvoiceNumber,
          recordId: existing.id,
          oldDate,
          newDate,
          xeroDateRaw: invoice.Date
        });

        await xata.db.Sales.update(existing.id, {
          sale_date: invoiceDate,
          invoice_status: invoice.Status,
          invoice_paid_date: invoice.FullyPaidOnDate ? parseXeroDate(invoice.FullyPaidOnDate) : null,
        });

        updatedCount++;

        // Log every 100 updates
        if (updatedCount % 100 === 0) {
          logger.info('FORCE_FIX_DATES', `Progress: ${updatedCount} updated so far`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('FORCE_FIX_DATES', 'Error processing invoice', {
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
    logger.info('FORCE_FIX_DATES', 'Force fix completed', {
      duration: `${duration}ms`,
      updated: updatedCount,
      skipped: skippedCount,
      notFound: notFoundCount,
      errors: errors.length
    });

    return NextResponse.json({
      success: true,
      summary: {
        total_invoices: allInvoices.length,
        updated: updatedCount,
        skipped: skippedCount,
        not_found: notFoundCount,
        errors: errors.length,
      },
      errors,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('FORCE_FIX_DATES', 'Fatal error during force fix', { error: error as any });
    return NextResponse.json(
      {
        error: 'Force fix failed',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
