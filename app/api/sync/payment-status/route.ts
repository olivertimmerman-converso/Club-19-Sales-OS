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
import { db } from "@/db";
import { sales } from "@/db/schema";
import { and, ne, isNotNull, eq } from "drizzle-orm";
import { getValidTokens } from '@/lib/xero-auth';
import * as logger from '@/lib/logger';
import {
  mapXeroInvoiceToSaleFields,
  xeroAmountsChanged,
} from '@/lib/xero-invoice-mapping';

// ORIGINAL XATA: import { getXataClient } from '@/src/xata';

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

    // 2. Get integration user's Xero tokens
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
    if (!integrationUserId) {
      logger.error('PAYMENT_SYNC', 'XERO_INTEGRATION_CLERK_USER_ID not configured');
      return NextResponse.json({
        error: 'XERO_INTEGRATION_CLERK_USER_ID not configured. Please set environment variable.'
      }, { status: 500 });
    }

    logger.info('PAYMENT_SYNC', 'Using integration user', { integrationUserId });

    const tokens = await getValidTokens(integrationUserId);
    logger.info('PAYMENT_SYNC', 'Got valid Xero tokens');

    // 3. Fetch unpaid Sales from database
    // ORIGINAL XATA: const xata = getXataClient();
    // ORIGINAL XATA: const unpaidSales = await xata.db.Sales
    // ORIGINAL XATA:   .filter({
    // ORIGINAL XATA:     $all: [
    // ORIGINAL XATA:       { invoice_status: { $isNot: 'PAID' } },
    // ORIGINAL XATA:       { xero_invoice_id: { $isNot: null } }
    // ORIGINAL XATA:     ]
    // ORIGINAL XATA:   })
    // ORIGINAL XATA:   .select(['id', 'xero_invoice_id', 'xero_invoice_number', 'invoice_status'])
    // ORIGINAL XATA:   .getMany();
    const unpaidSales = await db
      .select({
        id: sales.id,
        xeroInvoiceId: sales.xeroInvoiceId,
        xeroInvoiceNumber: sales.xeroInvoiceNumber,
        invoiceStatus: sales.invoiceStatus,
        saleAmountIncVat: sales.saleAmountIncVat,
        xeroAmountPaid: sales.xeroAmountPaid,
        xeroAmountDue: sales.xeroAmountDue,
        xeroAmountCredited: sales.xeroAmountCredited,
      })
      .from(sales)
      .where(
        and(
          ne(sales.invoiceStatus, 'PAID'),
          isNotNull(sales.xeroInvoiceId)
        )
      );

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
    const errorsArray: Array<{ saleId: string; invoiceNumber: string; error: string }> = [];

    // Xero allows fetching multiple invoices by ID using comma-separated list
    // But for reliability and better error handling, we'll fetch individually
    for (const sale of unpaidSales) {
      try {
        if (!sale.xeroInvoiceId) {
          logger.info('PAYMENT_SYNC', 'Skipping sale - no xero_invoice_id', { saleId: sale.id });
          continue;
        }

        logger.info('PAYMENT_SYNC', 'Checking invoice', {
          invoiceNumber: sale.xeroInvoiceNumber,
          invoiceId: sale.xeroInvoiceId
        });

        const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices/${sale.xeroInvoiceId}`;

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
            invoiceNumber: sale.xeroInvoiceNumber,
            status: xeroResponse.status,
            errorText
          });
          errorsArray.push({
            saleId: sale.id,
            invoiceNumber: sale.xeroInvoiceNumber || sale.xeroInvoiceId,
            error: `Xero API error: ${xeroResponse.status}`,
          });
          continue;
        }

        const xeroData: XeroInvoicesResponse = await xeroResponse.json();
        const invoice = xeroData.Invoices?.[0];

        if (!invoice) {
          logger.error('PAYMENT_SYNC', 'Invoice not found in Xero', {
            invoiceNumber: sale.xeroInvoiceNumber
          });
          errorsArray.push({
            saleId: sale.id,
            invoiceNumber: sale.xeroInvoiceNumber || sale.xeroInvoiceId,
            error: 'Invoice not found in Xero',
          });
          continue;
        }

        checkedCount++;

        // Re-derive status + amounts from Xero. Catches credit-note flips
        // even when Xero's raw Status hasn't changed (CN application leaves
        // the invoice as PAID — only AmountCredited/AmountDue move).
        const mapped = mapXeroInvoiceToSaleFields(invoice);
        const statusChanged = sale.invoiceStatus !== mapped.invoiceStatus;
        const amountsChanged = xeroAmountsChanged(sale, invoice);

        if (statusChanged || amountsChanged) {
          logger.info('PAYMENT_SYNC', 'Status or amounts changed', {
            invoiceNumber: sale.xeroInvoiceNumber,
            oldStatus: sale.invoiceStatus,
            newStatus: mapped.invoiceStatus,
            xeroRawStatus: invoice.Status,
            amountCredited: mapped.xeroAmountCredited,
          });

          await db
            .update(sales)
            .set({
              invoiceStatus: mapped.invoiceStatus,
              invoicePaidDate: mapped.invoiceStatus === 'PAID' ? new Date() : null,
              xeroAmountPaid: mapped.xeroAmountPaid,
              xeroAmountDue: mapped.xeroAmountDue,
              xeroAmountCredited: mapped.xeroAmountCredited,
            })
            .where(eq(sales.id, sale.id));

          updatedCount++;
          logger.info('PAYMENT_SYNC', 'Updated invoice status + amounts', {
            invoiceNumber: sale.xeroInvoiceNumber
          });
        } else {
          logger.info('PAYMENT_SYNC', 'No change', {
            invoiceNumber: sale.xeroInvoiceNumber,
            status: mapped.invoiceStatus
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
        errorsArray.push({
          saleId: sale.id,
          invoiceNumber: sale.xeroInvoiceNumber || sale.xeroInvoiceId || 'unknown',
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('PAYMENT_SYNC', 'Sync completed', {
      durationMs: duration,
      checked: checkedCount,
      updated: updatedCount,
      errors: errorsArray.length
    });

    return NextResponse.json({
      success: true,
      summary: {
        checked: checkedCount,
        updated: updatedCount,
        errors: errorsArray.length,
      },
      errors: errorsArray,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : undefined;

    // Properly serialize error for logging
    logger.error('PAYMENT_SYNC', 'Fatal error', {
      message: errorMessage,
      stack: errorStack,
      name: errorName,
      type: typeof error,
    });

    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
    }, { status: 500 });
  }
}
