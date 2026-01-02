/**
 * Club 19 Sales OS - Payment Status Sync API
 *
 * POST endpoint to sync payment statuses from Xero
 * Fetches current status for all unpaid invoices and updates Sales records
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

export async function POST() {
  const startTime = Date.now();
  logger.info('PAYMENT_SYNC', 'Starting payment status sync');

  try {
    // 1. Auth check - superadmin, operations, or founder only
    const { userId } = await auth();
    if (!userId) {
      logger.error('PAYMENT_SYNC', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('PAYMENT_SYNC', 'User authenticated', { role });

    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      logger.error('PAYMENT_SYNC', 'Forbidden - insufficient permissions', { role });
      return NextResponse.json({ error: 'Forbidden - requires superadmin, operations, or founder role' }, { status: 403 });
    }

    // 2. Get system user's Xero tokens
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId || systemUserId === 'FILL_ME') {
      logger.error('PAYMENT_SYNC', 'XERO_SYSTEM_USER_ID not configured');
      return NextResponse.json({
        error: 'XERO_SYSTEM_USER_ID not configured. Please set environment variable.'
      }, { status: 500 });
    }

    logger.info('PAYMENT_SYNC', 'Using system user', { systemUserId });

    const tokens = await getValidTokens(systemUserId);
    logger.info('PAYMENT_SYNC', 'Got valid Xero tokens');

    // 3. Fetch unpaid Sales from database
    const xata = getXataClient();
    const unpaidSales = await xata.db.Sales
      .filter({
        $all: [
          { invoice_status: { $isNot: 'PAID' } },
          { xero_invoice_id: { $isNot: null } }
        ]
      })
      .select(['id', 'xero_invoice_id', 'xero_invoice_number', 'invoice_status'])
      .getMany();

    logger.info('PAYMENT_SYNC', 'Found unpaid sales to check', { count: unpaidSales.length });

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

    // 4. Batch fetch invoice statuses from Xero
    let checkedCount = 0;
    let updatedCount = 0;
    const errors: Array<{ saleId: string; invoiceNumber: string; error: string }> = [];

    // Xero allows fetching multiple invoices by ID using comma-separated list
    // But for reliability and better error handling, we'll fetch individually
    for (const sale of unpaidSales) {
      try {
        if (!sale.xero_invoice_id) {
          logger.info('PAYMENT_SYNC', 'Skipping sale - no xero_invoice_id', { saleId: sale.id });
          continue;
        }

        logger.info('PAYMENT_SYNC', 'Checking invoice', {
          invoiceNumber: sale.xero_invoice_number,
          invoiceId: sale.xero_invoice_id
        });

        const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices/${sale.xero_invoice_id}`;

        const xeroResponse = await fetch(xeroUrl, {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Xero-Tenant-Id': tokens.tenantId,
            'Accept': 'application/json',
          },
        });

        if (!xeroResponse.ok) {
          const errorText = await xeroResponse.text();
          logger.error('PAYMENT_SYNC', 'Xero API error', {
            invoiceNumber: sale.xero_invoice_number,
            status: xeroResponse.status,
            errorText
          });
          errors.push({
            saleId: sale.id,
            invoiceNumber: sale.xero_invoice_number || sale.xero_invoice_id,
            error: `Xero API error: ${xeroResponse.status}`,
          });
          continue;
        }

        const xeroData: XeroInvoicesResponse = await xeroResponse.json();
        const invoice = xeroData.Invoices?.[0];

        if (!invoice) {
          logger.error('PAYMENT_SYNC', 'Invoice not found in Xero', {
            invoiceNumber: sale.xero_invoice_number
          });
          errors.push({
            saleId: sale.id,
            invoiceNumber: sale.xero_invoice_number || sale.xero_invoice_id,
            error: 'Invoice not found in Xero',
          });
          continue;
        }

        checkedCount++;

        // Check if status changed
        if (invoice.Status !== sale.invoice_status) {
          logger.info('PAYMENT_SYNC', 'Status changed', {
            invoiceNumber: sale.xero_invoice_number,
            oldStatus: sale.invoice_status,
            newStatus: invoice.Status
          });

          await xata.db.Sales.update(sale.id, {
            invoice_status: invoice.Status,
            invoice_paid_date: invoice.Status === 'PAID' ? new Date() : null,
          });

          updatedCount++;
          logger.info('PAYMENT_SYNC', 'Updated invoice status', {
            invoiceNumber: sale.xero_invoice_number
          });
        } else {
          logger.info('PAYMENT_SYNC', 'No status change', {
            invoiceNumber: sale.xero_invoice_number,
            status: invoice.Status
          });
        }

        // Small delay to avoid rate limiting (Xero allows 60 requests/minute)
        // Only add delay if we have more invoices to process
        if (unpaidSales.indexOf(sale) < unpaidSales.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms = max 600 requests/min (well under limit)
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        logger.error('PAYMENT_SYNC', 'Error processing sale', {
          saleId: sale.id,
          error: err as any
        });
        errors.push({
          saleId: sale.id,
          invoiceNumber: sale.xero_invoice_number || sale.xero_invoice_id || 'unknown',
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('PAYMENT_SYNC', 'Sync completed', {
      durationMs: duration,
      checked: checkedCount,
      updated: updatedCount,
      errors: errors.length
    });

    return NextResponse.json({
      success: true,
      summary: {
        checked: checkedCount,
        updated: updatedCount,
        errors: errors.length,
      },
      errors,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('PAYMENT_SYNC', 'Fatal error', { error: error as any });
    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage
    }, { status: 500 });
  }
}
