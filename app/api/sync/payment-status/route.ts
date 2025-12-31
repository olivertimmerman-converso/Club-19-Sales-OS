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
  console.log('[PAYMENT SYNC] === Starting payment status sync ===');

  try {
    // 1. Auth check - superadmin, operations, or founder only
    const { userId } = await auth();
    if (!userId) {
      console.error('[PAYMENT SYNC] ❌ Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    console.log(`[PAYMENT SYNC] User role: ${role}`);

    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      console.error(`[PAYMENT SYNC] ❌ Forbidden - role ${role} not allowed`);
      return NextResponse.json({ error: 'Forbidden - requires superadmin, operations, or founder role' }, { status: 403 });
    }

    // 2. Get system user's Xero tokens
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId || systemUserId === 'FILL_ME') {
      console.error('[PAYMENT SYNC] ❌ XERO_SYSTEM_USER_ID not configured');
      return NextResponse.json({
        error: 'XERO_SYSTEM_USER_ID not configured. Please set environment variable.'
      }, { status: 500 });
    }

    console.log(`[PAYMENT SYNC] Using system user: ${systemUserId}`);

    const tokens = await getValidTokens(systemUserId);
    console.log('[PAYMENT SYNC] ✓ Got valid Xero tokens');

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

    console.log(`[PAYMENT SYNC] Found ${unpaidSales.length} unpaid sales to check`);

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
          console.log(`[PAYMENT SYNC] Skipping sale ${sale.id} - no xero_invoice_id`);
          continue;
        }

        console.log(`[PAYMENT SYNC] Checking invoice ${sale.xero_invoice_number} (${sale.xero_invoice_id})`);

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
          console.error(`[PAYMENT SYNC] ❌ Xero API error for ${sale.xero_invoice_number}:`, xeroResponse.status, errorText);
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
          console.error(`[PAYMENT SYNC] ❌ Invoice not found in Xero: ${sale.xero_invoice_number}`);
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
          console.log(`[PAYMENT SYNC] Status changed for ${sale.xero_invoice_number}: ${sale.invoice_status} → ${invoice.Status}`);

          await xata.db.Sales.update(sale.id, {
            invoice_status: invoice.Status,
            invoice_paid_date: invoice.Status === 'PAID' ? new Date() : null,
          });

          updatedCount++;
          console.log(`[PAYMENT SYNC] ✓ Updated ${sale.xero_invoice_number}`);
        } else {
          console.log(`[PAYMENT SYNC] No change for ${sale.xero_invoice_number} (still ${invoice.Status})`);
        }

        // Small delay to avoid rate limiting (Xero allows 60 requests/minute)
        // Only add delay if we have more invoices to process
        if (unpaidSales.indexOf(sale) < unpaidSales.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms = max 600 requests/min (well under limit)
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[PAYMENT SYNC] ❌ Error processing sale ${sale.id}:`, err);
        errors.push({
          saleId: sale.id,
          invoiceNumber: sale.xero_invoice_number || sale.xero_invoice_id || 'unknown',
          error: errorMessage,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[PAYMENT SYNC] ✓✓✓ Sync completed in ${duration}ms`);
    console.log(`[PAYMENT SYNC] Summary: ${checkedCount} checked, ${updatedCount} updated, ${errors.length} errors`);

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
    console.error('[PAYMENT SYNC] ❌ Fatal error:', error);
    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage
    }, { status: 500 });
  }
}
