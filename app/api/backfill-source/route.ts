/**
 * Club 19 Sales OS - Backfill Source Field API
 *
 * POST /api/backfill-source
 * One-time endpoint to backfill the source field for existing sales with source: null
 * Sets source: 'atelier' for all sales that don't have source set
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import * as logger from '@/lib/logger';

export async function POST() {
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

    const xata = getXataClient();

    // Find all sales with source: null
    const salesWithNullSource = await xata.db.Sales
      .filter({ source: null })
      .select(['id', 'sale_reference', 'xero_invoice_number'])
      .getAll();

    logger.info('BACKFILL_SOURCE', 'Found sales with null source', {
      count: salesWithNullSource.length
    });

    // Update each sale to set source: 'atelier'
    const updates = [];
    for (const sale of salesWithNullSource) {
      updates.push(
        xata.db.Sales.update(sale.id, { source: 'atelier' })
      );
    }

    // Execute all updates in parallel
    await Promise.all(updates);

    logger.info('BACKFILL_SOURCE', 'Backfill complete', {
      updatedCount: updates.length,
      sampleInvoices: salesWithNullSource.slice(0, 5).map(s => s.xero_invoice_number || s.sale_reference)
    });

    return NextResponse.json({
      success: true,
      message: 'Source field backfilled successfully',
      updatedCount: updates.length,
      updatedSales: salesWithNullSource.map(s => ({
        id: s.id,
        reference: s.sale_reference || s.xero_invoice_number || 'Unknown'
      }))
    });
  } catch (error) {
    logger.error('BACKFILL_SOURCE', 'Error backfilling source field', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to backfill source field',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
