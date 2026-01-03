/**
 * Club 19 Sales OS - Restore Deleted Sales Record API
 *
 * POST /api/sales/[id]/restore
 * Restores a soft-deleted sale record by setting deleted_at to null
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

  logger.info('SALES_RESTORE', 'Restore request received', { saleId });

  try {
    // 1. Auth check - superadmin only
    const { userId } = await auth();
    if (!userId) {
      logger.error('SALES_RESTORE', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('SALES_RESTORE', 'User role check', { role });

    if (role !== 'superadmin') {
      logger.error('SALES_RESTORE', 'Forbidden - insufficient role', { role });
      return NextResponse.json(
        { error: 'Forbidden - requires superadmin role' },
        { status: 403 }
      );
    }

    // 2. Check if sale exists (include deleted records)
    const xata = getXataClient();
    const sale = await xata.db.Sales.filter({ id: saleId }).getFirst();

    if (!sale) {
      logger.error('SALES_RESTORE', 'Sale not found', { saleId });
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // 3. Check if actually deleted
    if (!sale.deleted_at) {
      logger.warn('SALES_RESTORE', 'Sale is not deleted', { saleId });
      return NextResponse.json(
        { error: 'Sale is not deleted' },
        { status: 400 }
      );
    }

    // 4. Restore - set deleted_at to null
    await xata.db.Sales.update(saleId, {
      deleted_at: null,
    });

    logger.info('SALES_RESTORE', 'Sale restored successfully', { saleId });

    return NextResponse.json({
      success: true,
      message: 'Sale restored successfully',
      saleId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('SALES_RESTORE', 'Failed to restore sale', { saleId, error: error as any });
    return NextResponse.json(
      {
        error: 'Failed to restore sale',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
