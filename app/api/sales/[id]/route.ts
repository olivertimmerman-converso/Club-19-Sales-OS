/**
 * Club 19 Sales OS - Single Sale API
 *
 * GET: Fetch single sale by ID
 * PATCH: Update sale fields (especially shopper assignment)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { calculateMargins } from '@/lib/economics';
import { roundCurrency } from '@/lib/utils/currency';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sales/[id]
 * Fetch a single sale by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    logger.info('SALES_API', 'Fetching sale', { saleId: id });

    const xata = getXataClient();
    const sale = await xata.db.Sales
      .select(['*', 'buyer.*', 'shopper.*', 'supplier.*'])
      .filter({ id })
      .getFirst();

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    return NextResponse.json({ sale });
  } catch (error) {
    logger.error('SALES_API', 'Error fetching sale', { error: error as any });
    return NextResponse.json(
      { error: 'Failed to fetch sale' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sales/[id]
 * Update sale fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    if (!['superadmin', 'operations', 'founder', 'admin'].includes(role || '')) {
      return NextResponse.json(
        { error: 'Forbidden - requires admin or higher role' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    logger.info('SALES_API', 'Update sale request', { saleId: id, fields: Object.keys(body) });

    const xata = getXataClient();

    // Build update object from allowed fields
    const updateData: Record<string, any> = {};

    // Allow updating shopper and supplier (link fields)
    if (body.shopper !== undefined) {
      updateData.shopper = body.shopper || null;
    }
    if (body.supplier !== undefined) {
      updateData.supplier = body.supplier || null;
    }

    // Allow updating other fields if needed
    const allowedFields = [
      'brand',
      'category',
      'item_title',
      'quantity',
      'buy_price',
      'sale_amount_inc_vat',
      'sale_amount_ex_vat',
      'gross_margin',
      'internal_notes',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // If buy_price is being updated, recalculate margins
    if (body.buy_price !== undefined) {
      // Fetch current sale to get sale_amount_ex_vat and other costs
      const currentSale = await xata.db.Sales.read(id);
      if (currentSale) {
        const saleAmountExVat = currentSale.sale_amount_ex_vat || 0;
        const newBuyPrice = roundCurrency(body.buy_price);
        const shippingCost = currentSale.shipping_cost || 0;
        const cardFees = currentSale.card_fees || 0;
        const directCosts = currentSale.direct_costs || 0;
        const introducerCommission = (currentSale as any).introducer_commission || 0;

        const marginResult = calculateMargins({
          saleAmountExVat,
          buyPrice: newBuyPrice,
          shippingCost,
          cardFees,
          directCosts,
          introducerCommission,
        });

        updateData.buy_price = newBuyPrice;
        updateData.gross_margin = marginResult.grossMargin;
        updateData.commissionable_margin = marginResult.commissionableMargin;

        logger.info('SALES_API', 'Recalculated margins', {
          saleId: id,
          saleAmountExVat,
          newBuyPrice,
          grossMargin: marginResult.grossMargin,
          commissionableMargin: marginResult.commissionableMargin,
        });
      }
    }

    logger.info('SALES_API', 'Updating sale', { saleId: id, updateFields: Object.keys(updateData) });

    const updatedSale = await xata.db.Sales.update(id, updateData);

    if (!updatedSale) {
      return NextResponse.json(
        { error: 'Failed to update sale' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sale: updatedSale,
    });
  } catch (error) {
    logger.error('SALES_API', 'Error updating sale', { error: error as any });
    return NextResponse.json(
      { error: 'Failed to update sale' },
      { status: 500 }
    );
  }
}
