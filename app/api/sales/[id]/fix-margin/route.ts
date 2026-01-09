/**
 * Club 19 Sales OS - Fix Margin Calculation API
 *
 * POST /api/sales/[id]/fix-margin
 * Recalculates gross_margin and commissionable_margin for a sale record
 * using the SINGLE SOURCE OF TRUTH in lib/economics.ts
 *
 * This endpoint:
 * 1. Gets the sale record
 * 2. Recalculates margins using calculateMargins()
 * 3. Updates the sale record
 * 4. Returns the updated amounts
 *
 * Superadmin only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { calculateMargins, toNumber } from '@/lib/economics';
import * as logger from '@/lib/logger';

export async function POST(
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

    // Verify superadmin role
    const role = await getUserRole();
    if (role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden: Superadmin access required' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const xata = getXataClient();

    // Get the sale record
    const sale = await xata.db.Sales.read(id);

    if (!sale) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      );
    }

    logger.info('FIX_MARGIN', 'Starting margin recalculation', {
      saleId: id,
      saleReference: sale.sale_reference,
      currentGrossMargin: sale.gross_margin,
      currentCommissionableMargin: sale.commissionable_margin,
      saleAmountExVat: sale.sale_amount_ex_vat,
      buyPrice: sale.buy_price,
    });

    // Calculate correct margins using SINGLE SOURCE OF TRUTH
    const marginResult = calculateMargins({
      saleAmountExVat: sale.sale_amount_ex_vat,
      buyPrice: sale.buy_price,
      shippingCost: sale.shipping_cost,
      cardFees: sale.card_fees,
      directCosts: sale.direct_costs,
      introducerCommission: sale.commission_split_introducer,
    });

    logger.info('FIX_MARGIN', 'Margins calculated', {
      saleId: id,
      newGrossMargin: marginResult.grossMargin,
      newCommissionableMargin: marginResult.commissionableMargin,
      breakdown: marginResult.breakdown,
    });

    // Check if values actually differ
    const oldGrossMargin = toNumber(sale.gross_margin);
    const oldCommissionableMargin = toNumber(sale.commissionable_margin);
    const grossDiff = Math.abs(oldGrossMargin - marginResult.grossMargin);
    const commDiff = Math.abs(oldCommissionableMargin - marginResult.commissionableMargin);

    const hasChanges = grossDiff > 0.01 || commDiff > 0.01;

    if (!hasChanges) {
      logger.info('FIX_MARGIN', 'No changes needed - margins are correct', {
        saleId: id,
      });

      return NextResponse.json({
        success: true,
        saleId: id,
        saleReference: sale.sale_reference,
        message: 'Margins are already correct - no changes made',
        noChanges: true,
        current: {
          grossMargin: oldGrossMargin,
          commissionableMargin: oldCommissionableMargin,
        },
        breakdown: marginResult.breakdown,
      });
    }

    // Update the sale record
    await xata.db.Sales.update(id, {
      gross_margin: marginResult.grossMargin,
      commissionable_margin: marginResult.commissionableMargin,
    });

    logger.info('FIX_MARGIN', 'Sale margins updated successfully', {
      saleId: id,
      oldGrossMargin,
      newGrossMargin: marginResult.grossMargin,
      oldCommissionableMargin,
      newCommissionableMargin: marginResult.commissionableMargin,
    });

    return NextResponse.json({
      success: true,
      saleId: id,
      saleReference: sale.sale_reference,
      previous: {
        grossMargin: oldGrossMargin,
        commissionableMargin: oldCommissionableMargin,
      },
      updated: {
        grossMargin: marginResult.grossMargin,
        commissionableMargin: marginResult.commissionableMargin,
      },
      breakdown: marginResult.breakdown,
      changes: {
        grossMarginDiff: marginResult.grossMargin - oldGrossMargin,
        commissionableMarginDiff: marginResult.commissionableMargin - oldCommissionableMargin,
      },
    });
  } catch (error) {
    logger.error('FIX_MARGIN', 'Error fixing margin', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to fix margin',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
