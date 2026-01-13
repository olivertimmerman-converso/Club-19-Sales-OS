/**
 * Club 19 Sales OS - Single Sale Invoice Status Sync
 *
 * POST endpoint to sync a single sale's invoice status from Xero
 * Useful for manual fixes when webhooks fail
 *
 * Auth: Superadmin, Operations, or Founder only
 */

import { NextRequest, NextResponse } from 'next/server';
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
  FullyPaidOnDate?: string;
  AmountDue: number;
  AmountPaid: number;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

/**
 * Parse Xero .NET JSON date format
 */
function parseXeroDate(dateValue: unknown): Date | null {
  if (!dateValue) return null;
  if (typeof dateValue === 'string') {
    const match = dateValue.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
    if (match) {
      return new Date(parseInt(match[1], 10));
    }
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: saleId } = await params;

  logger.info('SYNC_STATUS', 'Starting single sale status sync', { saleId });

  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Get the sale record
    const xata = getXataClient();
    const sale = await xata.db.Sales.read(saleId);

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (!sale.xero_invoice_id) {
      return NextResponse.json({
        error: 'Sale has no Xero invoice ID',
        message: 'This sale is not linked to a Xero invoice'
      }, { status: 400 });
    }

    logger.info('SYNC_STATUS', 'Found sale', {
      saleId,
      invoiceId: sale.xero_invoice_id,
      currentStatus: sale.invoice_status,
    });

    // 3. Get Xero tokens
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
    if (!integrationUserId) {
      return NextResponse.json({
        error: 'XERO_INTEGRATION_CLERK_USER_ID not configured'
      }, { status: 500 });
    }

    let tokens;
    try {
      tokens = await getValidTokens(integrationUserId);
    } catch (tokenError: any) {
      logger.error('SYNC_STATUS', 'Failed to get Xero tokens', {
        message: tokenError.message,
        stack: tokenError.stack,
      });
      return NextResponse.json({
        error: 'Xero authentication failed',
        message: tokenError.message,
        action: 'Admin must reconnect Xero at /admin/xero'
      }, { status: 401 });
    }

    // 4. Fetch invoice from Xero
    const xeroResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${sale.xero_invoice_id}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Xero-Tenant-Id': tokens.tenantId,
          'Accept': 'application/json',
        },
      }
    );

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      logger.error('SYNC_STATUS', 'Xero API error', {
        status: xeroResponse.status,
        details: errorText,
      });
      return NextResponse.json({
        error: 'Xero API error',
        details: errorText
      }, { status: 500 });
    }

    const xeroData: XeroInvoicesResponse = await xeroResponse.json();
    const invoice = xeroData.Invoices?.[0];

    if (!invoice) {
      return NextResponse.json({
        error: 'Invoice not found in Xero',
        invoiceId: sale.xero_invoice_id
      }, { status: 404 });
    }

    logger.info('SYNC_STATUS', 'Fetched invoice from Xero', {
      invoiceNumber: invoice.InvoiceNumber,
      xeroStatus: invoice.Status,
      currentStatus: sale.invoice_status,
      amountDue: invoice.AmountDue,
      amountPaid: invoice.AmountPaid,
    });

    // 5. Update sale with new status
    const updates: Record<string, any> = {};
    const changes: string[] = [];

    if (sale.invoice_status !== invoice.Status) {
      updates.invoice_status = invoice.Status;
      changes.push(`status: ${sale.invoice_status} → ${invoice.Status}`);
    }

    // Set paid date if invoice is now paid
    if (invoice.Status === 'PAID' && !sale.invoice_paid_date) {
      const paidDate = parseXeroDate(invoice.FullyPaidOnDate) || new Date();
      updates.invoice_paid_date = paidDate;
      changes.push(`paid_date: null → ${paidDate.toISOString()}`);
    }

    if (Object.keys(updates).length === 0) {
      logger.info('SYNC_STATUS', 'No changes needed', { saleId });
      return NextResponse.json({
        success: true,
        message: 'Invoice status already up to date',
        status: invoice.Status,
        changes: [],
      });
    }

    await xata.db.Sales.update(saleId, updates);

    logger.info('SYNC_STATUS', 'Sale updated successfully', {
      saleId,
      changes,
    });

    return NextResponse.json({
      success: true,
      message: 'Invoice status synced from Xero',
      previousStatus: sale.invoice_status,
      newStatus: invoice.Status,
      changes,
    });

  } catch (error: any) {
    logger.error('SYNC_STATUS', 'Error syncing status', {
      saleId,
      message: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      error: 'Sync failed',
      details: error.message,
    }, { status: 500 });
  }
}
