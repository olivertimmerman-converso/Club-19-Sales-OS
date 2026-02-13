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
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { eq } from "drizzle-orm";
// ORIGINAL XATA: import { getXataClient } from '@/src/xata';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface AllocateRequest {
  saleId: string;
  shopperId: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('ALLOCATE', 'Starting invoice allocation');

  try {
    // 1. Auth check - superadmin, operations, or founder only
    const { userId } = await auth();
    if (!userId) {
      logger.error('ALLOCATE', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('ALLOCATE', 'User role check', { role });

    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      logger.error('ALLOCATE', 'Forbidden - insufficient role', { role });
      return NextResponse.json({ error: 'Forbidden - requires superadmin, operations, or founder role' }, { status: 403 });
    }

    // 2. Parse request body
    let body: AllocateRequest;
    try {
      body = await request.json();
    } catch (err) {
      logger.error('ALLOCATE', 'Invalid JSON body', { error: err as any });
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { saleId, shopperId } = body;

    if (!saleId || !shopperId) {
      logger.error('ALLOCATE', 'Missing required fields', { saleId, shopperId });
      return NextResponse.json({ error: 'Missing saleId or shopperId' }, { status: 400 });
    }

    logger.info('ALLOCATE', 'Allocating sale to shopper', { saleId, shopperId });

    // ORIGINAL XATA: const xata = getXataClient();

    // 3. Fetch the sale record
    // ORIGINAL XATA:
    // const sale = await xata.db.Sales
    //   .filter({ id: saleId })
    //   .select([
    //     'id',
    //     'xero_invoice_number',
    //     'sale_amount_inc_vat',
    //     'sale_amount_ex_vat',
    //     'buy_price',
    //     'gross_margin',
    //     'needs_allocation',
    //     'shopper.id',
    //   ])
    //   .getFirst();
    const saleResults = await db
      .select({
        id: sales.id,
        xeroInvoiceNumber: sales.xeroInvoiceNumber,
        saleAmountIncVat: sales.saleAmountIncVat,
        saleAmountExVat: sales.saleAmountExVat,
        buyPrice: sales.buyPrice,
        grossMargin: sales.grossMargin,
        needsAllocation: sales.needsAllocation,
        shopperId: sales.shopperId,
      })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);
    const sale = saleResults[0] || null;

    if (!sale) {
      logger.error('ALLOCATE', 'Sale not found', { saleId });
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // ORIGINAL XATA: logger.info('ALLOCATE', 'Found sale', { invoiceNumber: sale.xero_invoice_number });
    logger.info('ALLOCATE', 'Found sale', { invoiceNumber: sale.xeroInvoiceNumber });

    // 4. Fetch the shopper record
    // ORIGINAL XATA:
    // const shopper = await xata.db.Shoppers
    //   .filter({ id: shopperId })
    //   .select(['id', 'name', 'commission_scheme'])
    //   .getFirst();
    const shopperResults = await db
      .select({
        id: shoppers.id,
        name: shoppers.name,
        commissionScheme: shoppers.commissionScheme,
      })
      .from(shoppers)
      .where(eq(shoppers.id, shopperId))
      .limit(1);
    const shopper = shopperResults[0] || null;

    if (!shopper) {
      logger.error('ALLOCATE', 'Shopper not found', { shopperId });
      return NextResponse.json({ error: 'Shopper not found' }, { status: 404 });
    }

    // ORIGINAL XATA: logger.info('ALLOCATE', 'Found shopper', { shopperName: shopper.name, scheme: shopper.commission_scheme });
    logger.info('ALLOCATE', 'Found shopper', { shopperName: shopper.name, scheme: shopper.commissionScheme });

    // 5. Calculate commission based on shopper's scheme and gross margin
    let commissionAmount = 0;
    // ORIGINAL XATA: const grossMargin = sale.gross_margin || 0;
    const grossMargin = sale.grossMargin || 0;
    // ORIGINAL XATA: const scheme = shopper.commission_scheme || 'standard';
    const scheme = shopper.commissionScheme || 'standard'; // Default to 'standard' if null

    logger.info('ALLOCATE', 'Calculating commission', { grossMargin, scheme });

    // Commission scheme logic (matching existing system)
    switch (scheme.toLowerCase()) {
      case 'founder':
        // Founder gets 50% of gross margin
        commissionAmount = grossMargin * 0.5;
        logger.info('ALLOCATE', 'Commission calculated', { scheme: 'founder', rate: '50%', amount: commissionAmount });
        break;

      case 'senior':
        // Senior gets 40% of gross margin
        commissionAmount = grossMargin * 0.4;
        logger.info('ALLOCATE', 'Commission calculated', { scheme: 'senior', rate: '40%', amount: commissionAmount });
        break;

      case 'standard':
      default:
        // Standard gets 30% of gross margin
        commissionAmount = grossMargin * 0.3;
        logger.info('ALLOCATE', 'Commission calculated', { scheme: 'standard', rate: '30%', amount: commissionAmount });
        break;
    }

    // 6. Update sale record
    // ORIGINAL XATA:
    // const updatedSale = await xata.db.Sales.update(saleId, {
    //   shopper: shopperId,
    //   needs_allocation: false,
    //   commission_amount: commissionAmount,
    //   source: 'allocated',
    // });
    const updatedSaleResults = await db
      .update(sales)
      .set({
        shopperId,
        needsAllocation: false,
        commissionAmount,
        source: 'allocated',
        // Track who allocated and when
        allocatedBy: userId,
        allocatedAt: new Date(),
      })
      .where(eq(sales.id, saleId))
      .returning();
    const updatedSale = updatedSaleResults[0] || null;

    if (!updatedSale) {
      logger.error('ALLOCATE', 'Failed to update sale', { saleId });
      return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 });
    }

    const duration = Date.now() - startTime;
    logger.info('ALLOCATE', 'Allocation completed', {
      duration: `${duration}ms`,
      // ORIGINAL XATA: invoiceNumber: sale.xero_invoice_number,
      invoiceNumber: sale.xeroInvoiceNumber,
      shopperName: shopper.name,
      commissionAmount
    });

    return NextResponse.json({
      success: true,
      sale: {
        id: updatedSale.id,
        // ORIGINAL XATA: xeroInvoiceNumber: sale.xero_invoice_number,
        xeroInvoiceNumber: sale.xeroInvoiceNumber,
        shopper: {
          id: shopper.id,
          name: shopper.name,
          // ORIGINAL XATA: scheme: shopper.commission_scheme,
          scheme: shopper.commissionScheme,
        },
        grossMargin,
        commissionAmount,
        needsAllocation: false,
      },
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('ALLOCATE', 'Fatal error during allocation', { error: error as any });
    return NextResponse.json({
      error: 'Allocation failed',
      details: errorMessage
    }, { status: 500 });
  }
}
