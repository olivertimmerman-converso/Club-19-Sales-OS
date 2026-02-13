/**
 * Club 19 Sales OS - Automated Payment Status Sync Cron Job
 *
 * Automatically syncs payment statuses from Xero every hour.
 * Updates invoice_status and invoice_paid_date for unpaid invoices.
 *
 * SCHEDULE: Every hour (see vercel.json)
 *
 * This cron job mirrors the manual POST /api/sync/payment-status endpoint
 * but runs automatically without user authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getValidTokens } from '@/lib/xero-auth';
import { db } from "@/db";
import { sales, errors } from "@/db/schema";
import { and, ne, isNotNull, eq } from "drizzle-orm";
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Integration user ID - single source of truth for Xero tokens
const INTEGRATION_USER_ID = process.env.XERO_INTEGRATION_CLERK_USER_ID;

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Status: string;
  AmountDue: number;
  AmountPaid: number;
  UpdatedDateUTC: string;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.info('XERO_CRON_PAYMENTS', 'Starting automated payment status sync');

  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET) {
    logger.error('XERO_CRON_PAYMENTS', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== expectedAuth) {
    logger.error('XERO_CRON_PAYMENTS', 'Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!INTEGRATION_USER_ID) {
    logger.error('XERO_CRON_PAYMENTS', 'XERO_INTEGRATION_CLERK_USER_ID not configured');
    return NextResponse.json({
      error: 'XERO_INTEGRATION_CLERK_USER_ID not configured'
    }, { status: 500 });
  }

  try {
    // Get Xero tokens
    const tokens = await getValidTokens(INTEGRATION_USER_ID);
    logger.info('XERO_CRON_PAYMENTS', 'Got valid Xero tokens');

    // Fetch unpaid Sales from database
    const unpaidSales = await db
      .select({
        id: sales.id,
        xeroInvoiceId: sales.xeroInvoiceId,
        xeroInvoiceNumber: sales.xeroInvoiceNumber,
        invoiceStatus: sales.invoiceStatus,
      })
      .from(sales)
      .where(
        and(
          ne(sales.invoiceStatus, 'PAID'),
          isNotNull(sales.xeroInvoiceId)
        )
      );

    logger.info('XERO_CRON_PAYMENTS', 'Found unpaid sales to check', {
      count: unpaidSales.length
    });

    if (unpaidSales.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unpaid invoices to sync',
        summary: {
          checked: 0,
          updated: 0,
          errors: 0,
        },
        duration: `${Date.now() - startTime}ms`,
      });
    }

    let checkedCount = 0;
    let updatedCount = 0;
    const syncErrors: Array<{ saleId: string; invoiceNumber: string; error: string }> = [];

    for (const sale of unpaidSales) {
      try {
        if (!sale.xeroInvoiceId) {
          continue;
        }

        const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices/${sale.xeroInvoiceId}`;

        const xeroResponse = await fetch(xeroUrl, {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Xero-Tenant-Id': tokens.tenantId,
            'Accept': 'application/json',
          },
        });

        if (!xeroResponse.ok) {
          syncErrors.push({
            saleId: sale.id,
            invoiceNumber: sale.xeroInvoiceNumber || sale.xeroInvoiceId,
            error: `Xero API error: ${xeroResponse.status}`,
          });
          continue;
        }

        const xeroData: XeroInvoicesResponse = await xeroResponse.json();
        const invoice = xeroData.Invoices?.[0];

        if (!invoice) {
          syncErrors.push({
            saleId: sale.id,
            invoiceNumber: sale.xeroInvoiceNumber || sale.xeroInvoiceId,
            error: 'Invoice not found in Xero',
          });
          continue;
        }

        checkedCount++;

        // Check if status changed
        if (invoice.Status !== sale.invoiceStatus) {
          logger.info('XERO_CRON_PAYMENTS', 'Status changed', {
            invoiceNumber: sale.xeroInvoiceNumber,
            oldStatus: sale.invoiceStatus,
            newStatus: invoice.Status
          });

          await db
            .update(sales)
            .set({
              invoiceStatus: invoice.Status,
              invoicePaidDate: invoice.Status === 'PAID' ? new Date() : null,
            })
            .where(eq(sales.id, sale.id));

          updatedCount++;
        }

        // Small delay to avoid rate limiting (100ms = max 600 requests/min)
        if (unpaidSales.indexOf(sale) < unpaidSales.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        syncErrors.push({
          saleId: sale.id,
          invoiceNumber: sale.xeroInvoiceNumber || sale.xeroInvoiceId || 'unknown',
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('XERO_CRON_PAYMENTS', 'Sync completed', {
      duration,
      checked: checkedCount,
      updated: updatedCount,
      errors: syncErrors.length
    });

    // Log errors to database if any
    if (syncErrors.length > 0) {
      try {
        await db.insert(errors).values({
          severity: 'medium',
          source: 'xero-cron-payments',
          message: syncErrors.map(e => `${e.invoiceNumber}: ${e.error}`),
          timestamp: new Date(),
          resolved: false,
        });
      } catch {
        logger.error('XERO_CRON_PAYMENTS', 'Failed to log errors to database');
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        checked: checkedCount,
        updated: updatedCount,
        errors: syncErrors.length,
      },
      duration: `${duration}ms`,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('XERO_CRON_PAYMENTS', 'Fatal error during sync', {
      message: errorMessage,
    });

    // Log to database
    try {
      await db.insert(errors).values({
        severity: 'high',
        source: 'xero-cron-payments',
        message: [`Cron payment sync failed: ${errorMessage}`],
        timestamp: new Date(),
        resolved: false,
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage,
    }, { status: 500 });
  }
}
