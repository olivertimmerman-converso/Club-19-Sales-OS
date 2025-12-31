/**
 * Club 19 Sales OS - Allocate Invoice API
 *
 * POST endpoint to allocate an unassigned invoice to a shopper
 * Automatically calculates commission based on shopper's scheme
 *
 * Auth: Superadmin, Operations, or Founder only
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';

export const dynamic = 'force-dynamic';

interface AllocateRequest {
  saleId: string;
  shopperId: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[ALLOCATE INVOICE] === Starting invoice allocation ===');

  try {
    // 1. Auth check - superadmin, operations, or founder only
    const { userId } = await auth();
    if (!userId) {
      console.error('[ALLOCATE INVOICE] ❌ Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    console.log(`[ALLOCATE INVOICE] User role: ${role}`);

    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      console.error(`[ALLOCATE INVOICE] ❌ Forbidden - role ${role} not allowed`);
      return NextResponse.json({ error: 'Forbidden - requires superadmin, operations, or founder role' }, { status: 403 });
    }

    // 2. Parse request body
    let body: AllocateRequest;
    try {
      body = await request.json();
    } catch (err) {
      console.error('[ALLOCATE INVOICE] ❌ Invalid JSON body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { saleId, shopperId } = body;

    if (!saleId || !shopperId) {
      console.error('[ALLOCATE INVOICE] ❌ Missing required fields');
      return NextResponse.json({ error: 'Missing saleId or shopperId' }, { status: 400 });
    }

    console.log(`[ALLOCATE INVOICE] Allocating sale ${saleId} to shopper ${shopperId}`);

    const xata = getXataClient();

    // 3. Fetch the sale record
    const sale = await xata.db.Sales
      .filter({ id: saleId })
      .select([
        'id',
        'xero_invoice_number',
        'sale_amount_inc_vat',
        'sale_amount_ex_vat',
        'buy_price',
        'gross_margin',
        'needs_allocation',
        'shopper.id',
      ])
      .getFirst();

    if (!sale) {
      console.error(`[ALLOCATE INVOICE] ❌ Sale not found: ${saleId}`);
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    console.log(`[ALLOCATE INVOICE] Found sale: ${sale.xero_invoice_number}`);

    // 4. Fetch the shopper record
    const shopper = await xata.db.Shoppers
      .filter({ id: shopperId })
      .select(['id', 'name', 'commission_scheme'])
      .getFirst();

    if (!shopper) {
      console.error(`[ALLOCATE INVOICE] ❌ Shopper not found: ${shopperId}`);
      return NextResponse.json({ error: 'Shopper not found' }, { status: 404 });
    }

    console.log(`[ALLOCATE INVOICE] Found shopper: ${shopper.name} (scheme: ${shopper.commission_scheme})`);

    // 5. Calculate commission based on shopper's scheme and gross margin
    let commissionAmount = 0;
    const grossMargin = sale.gross_margin || 0;
    const scheme = shopper.commission_scheme || 'standard'; // Default to 'standard' if null

    console.log(`[ALLOCATE INVOICE] Calculating commission for gross margin: £${grossMargin}`);

    // Commission scheme logic (matching existing system)
    switch (scheme.toLowerCase()) {
      case 'founder':
        // Founder gets 50% of gross margin
        commissionAmount = grossMargin * 0.5;
        console.log(`[ALLOCATE INVOICE] Founder scheme: 50% of £${grossMargin} = £${commissionAmount}`);
        break;

      case 'senior':
        // Senior gets 40% of gross margin
        commissionAmount = grossMargin * 0.4;
        console.log(`[ALLOCATE INVOICE] Senior scheme: 40% of £${grossMargin} = £${commissionAmount}`);
        break;

      case 'standard':
      default:
        // Standard gets 30% of gross margin
        commissionAmount = grossMargin * 0.3;
        console.log(`[ALLOCATE INVOICE] Standard scheme: 30% of £${grossMargin} = £${commissionAmount}`);
        break;
    }

    // 6. Update sale record
    const updatedSale = await xata.db.Sales.update(saleId, {
      shopper: shopperId,
      needs_allocation: false,
      commission_amount: commissionAmount,
    });

    if (!updatedSale) {
      console.error(`[ALLOCATE INVOICE] ❌ Failed to update sale: ${saleId}`);
      return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 });
    }

    const duration = Date.now() - startTime;
    console.log(`[ALLOCATE INVOICE] ✓✓✓ Allocation completed in ${duration}ms`);
    console.log(`[ALLOCATE INVOICE] Sale ${sale.xero_invoice_number} allocated to ${shopper.name} with commission £${commissionAmount}`);

    return NextResponse.json({
      success: true,
      sale: {
        id: updatedSale.id,
        xeroInvoiceNumber: sale.xero_invoice_number,
        shopper: {
          id: shopper.id,
          name: shopper.name,
          scheme: shopper.commission_scheme,
        },
        grossMargin,
        commissionAmount,
        needsAllocation: false,
      },
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ALLOCATE INVOICE] ❌ Fatal error:', error);
    return NextResponse.json({
      error: 'Allocation failed',
      details: errorMessage
    }, { status: 500 });
  }
}
