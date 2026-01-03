/**
 * Club 19 Sales OS - Soft Delete Sales Record API
 *
 * POST /api/sales/[id]/delete
 * Soft deletes a sale record by setting deleted_at timestamp
 *
 * Superadmin only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const saleId = params.id;

  logger.info('SALES_DELETE', 'Soft delete request received', { saleId });

  try {
    // 1. Auth check - superadmin only
    const { userId } = await auth();
    if (!userId) {
      logger.error('SALES_DELETE', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('SALES_DELETE', 'User role check', { role });

    if (role !== 'superadmin') {
      logger.error('SALES_DELETE', 'Forbidden - insufficient role', { role });
      return NextResponse.json(
        { error: 'Forbidden - requires superadmin role' },
        { status: 403 }
      );
    }

    // 2. Check if sale exists
    const xata = getXataClient();
    const sale = await xata.db.Sales.filter({ id: saleId }).getFirst();

    if (!sale) {
      logger.error('SALES_DELETE', 'Sale not found', { saleId });
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // 3. Check if already deleted
    if (sale.deleted_at) {
      logger.warn('SALES_DELETE', 'Sale already deleted', { saleId });
      return NextResponse.json(
        { error: 'Sale is already deleted' },
        { status: 400 }
      );
    }

    // 4. Soft delete - set deleted_at to current timestamp
    await xata.db.Sales.update(saleId, {
      deleted_at: new Date(),
    });

    logger.info('SALES_DELETE', 'Sale soft deleted successfully', { saleId });

    return NextResponse.json({
      success: true,
      message: 'Sale deleted successfully',
      saleId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('SALES_DELETE', 'Failed to delete sale', { saleId, error: error as any });
    return NextResponse.json(
      {
        error: 'Failed to delete sale',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
