/**
 * Club 19 Sales OS - Sale Introducer Management API
 *
 * PUT /api/sales/[id]/introducer
 * Updates introducer and commission on a sale
 *
 * Body: { introducerId?: string | null, introducerCommission?: number | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import * as logger from '@/lib/logger';

/**
 * PUT - Update introducer and/or commission on sale
 */
export async function PUT(
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
    const body = await request.json();
    const { introducerId, introducerCommission } = body;

    // Validate introducerCommission if provided
    if (introducerCommission !== null && introducerCommission !== undefined) {
      if (typeof introducerCommission !== 'number' || introducerCommission < 0) {
        return NextResponse.json(
          { error: 'introducerCommission must be a positive number or null' },
          { status: 400 }
        );
      }
    }

    const xata = getXataClient();

    // If introducerId is provided (and not null), verify it exists
    let introducerName: string | null = null;
    if (introducerId) {
      const introducer = await xata.db.Introducers.read(introducerId);
      if (!introducer) {
        return NextResponse.json(
          { error: 'Introducer not found' },
          { status: 404 }
        );
      }
      introducerName = introducer.name || null;
    }

    // Build update object with correct Xata syntax
    const updateData: any = {};

    // Handle introducer link (use { id: ... } format for links, or null to clear)
    if (introducerId !== undefined) {
      updateData.introducer = introducerId ? { id: introducerId } : null;
    }

    // Handle commission (direct value or null)
    if (introducerCommission !== undefined) {
      updateData.introducer_commission = introducerCommission;
    }

    // Update sale record
    const updatedSale = await xata.db.Sales.update(id, updateData);

    if (!updatedSale) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      );
    }

    logger.info('SALE_INTRODUCER', 'Introducer/commission updated on sale', {
      saleId: id,
      introducerId: introducerId || null,
      introducerName,
      introducerCommission: introducerCommission !== undefined ? introducerCommission : 'unchanged'
    });

    return NextResponse.json({
      success: true,
      message: 'Introducer updated successfully',
      introducer: introducerId ? {
        id: introducerId,
        name: introducerName,
      } : null,
      introducerCommission: introducerCommission !== undefined ? introducerCommission : null,
    });
  } catch (error) {
    logger.error('SALE_INTRODUCER', 'Error updating introducer', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to update introducer',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
