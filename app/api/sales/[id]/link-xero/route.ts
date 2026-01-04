/**
 * Club 19 Sales OS - Link/Re-link Atelier Sale to Xero Invoice API
 *
 * POST /api/sales/[id]/link-xero
 * Links (or re-links) an Atelier sale to an existing Xero invoice (imported record)
 *
 * This endpoint:
 * 1. Gets the Atelier sale record (the one we're updating)
 * 2. Gets the Xero import record (the one we're linking to)
 * 3. Copies Xero fields from import to Atelier record (overwrites if already linked)
 * 4. Soft-deletes the Xero import record (set deleted_at = now)
 * 5. Returns success
 *
 * Re-linking: If the Atelier sale already has a xero_invoice_id, this will update it
 * to point to the new invoice. The old invoice (if it exists in Xero) remains as a Draft.
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: saleId } = await params;

  logger.info('SALES_LINK_XERO', 'Link Xero invoice request received', { saleId });

  try {
    // 1. Auth check - superadmin only
    const { userId } = await auth();
    if (!userId) {
      logger.error('SALES_LINK_XERO', 'Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    logger.info('SALES_LINK_XERO', 'User role check', { role });

    if (role !== 'superadmin') {
      logger.error('SALES_LINK_XERO', 'Forbidden - insufficient role', { role });
      return NextResponse.json(
        { error: 'Forbidden - requires superadmin role' },
        { status: 403 }
      );
    }

    // 2. Parse request body
    const body = await req.json();
    const { xeroImportId } = body;

    if (!xeroImportId) {
      logger.error('SALES_LINK_XERO', 'Missing xeroImportId in request body');
      return NextResponse.json(
        { error: 'Missing xeroImportId' },
        { status: 400 }
      );
    }

    // 3. Get both records
    const xata = getXataClient();

    const atelierSale = await xata.db.Sales.filter({ id: saleId }).getFirst();
    if (!atelierSale) {
      logger.error('SALES_LINK_XERO', 'Atelier sale not found', { saleId });
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const xeroImport = await xata.db.Sales.filter({ id: xeroImportId }).getFirst();
    if (!xeroImport) {
      logger.error('SALES_LINK_XERO', 'Xero import not found', { xeroImportId });
      return NextResponse.json({ error: 'Xero import not found' }, { status: 404 });
    }

    // 4. Validate record types
    if (atelierSale.source !== 'atelier') {
      logger.error('SALES_LINK_XERO', 'Target sale is not an Atelier record', {
        saleId,
        source: atelierSale.source,
      });
      return NextResponse.json(
        { error: 'Target sale must be an Atelier record (source=atelier)' },
        { status: 400 }
      );
    }

    if (xeroImport.source !== 'xero_import') {
      logger.error('SALES_LINK_XERO', 'Source record is not a Xero import', {
        xeroImportId,
        source: xeroImport.source,
      });
      return NextResponse.json(
        { error: 'Source record must be a Xero import (source=xero_import)' },
        { status: 400 }
      );
    }

    // 5. Check if Xero import is already deleted
    if (xeroImport.deleted_at) {
      logger.warn('SALES_LINK_XERO', 'Xero import already deleted', { xeroImportId });
      return NextResponse.json(
        { error: 'This Xero invoice has already been linked or deleted' },
        { status: 400 }
      );
    }

    logger.info('SALES_LINK_XERO', 'Linking records', {
      atelierSale: saleId,
      xeroImport: xeroImportId,
      xeroInvoiceNumber: xeroImport.xero_invoice_number,
    });

    // 6. Copy Xero fields from import to Atelier record
    await xata.db.Sales.update(saleId, {
      xero_invoice_id: xeroImport.xero_invoice_id,
      xero_invoice_number: xeroImport.xero_invoice_number,
      xero_invoice_url: xeroImport.xero_invoice_url,
      invoice_status: xeroImport.invoice_status,
      invoice_paid_date: xeroImport.invoice_paid_date || null,
    });

    // 7. Soft-delete the Xero import record
    await xata.db.Sales.update(xeroImportId, {
      deleted_at: new Date(),
    });

    logger.info('SALES_LINK_XERO', 'Successfully linked records', {
      saleId,
      xeroImportId,
      xeroInvoiceNumber: xeroImport.xero_invoice_number,
    });

    return NextResponse.json({
      success: true,
      message: 'Successfully linked to Xero invoice',
      xeroInvoiceNumber: xeroImport.xero_invoice_number,
      saleId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('SALES_LINK_XERO', 'Failed to link Xero invoice', {
      saleId,
      error: error as any,
    });
    return NextResponse.json(
      {
        error: 'Failed to link Xero invoice',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
