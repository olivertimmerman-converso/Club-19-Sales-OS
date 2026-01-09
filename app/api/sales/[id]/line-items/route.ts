/**
 * Club 19 Sales OS - Line Items API
 *
 * GET /api/sales/[id]/line-items
 * Returns all line items for a specific sale
 *
 * Used by SaleDetailClient to display multi-item invoice details
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getLineItemsForSale } from '@/lib/xata-sales';
import * as logger from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    logger.info('LINE_ITEMS', 'Fetching line items for sale', { saleId: id });

    const lineItems = await getLineItemsForSale(id);

    logger.info('LINE_ITEMS', 'Line items fetched', {
      saleId: id,
      count: lineItems.length,
    });

    // Transform to a simpler format for the frontend
    const items = lineItems.map(item => ({
      id: item.id,
      lineNumber: item.line_number,
      brand: item.brand,
      category: item.category,
      description: item.description,
      quantity: item.quantity,
      buyPrice: item.buy_price,
      sellPrice: item.sell_price,
      lineTotal: item.line_total,
      lineMargin: item.line_margin,
      supplierId: item.supplier?.id,
    }));

    return NextResponse.json({
      success: true,
      saleId: id,
      lineItems: items,
    });
  } catch (error) {
    logger.error('LINE_ITEMS', 'Error fetching line items', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch line items',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
