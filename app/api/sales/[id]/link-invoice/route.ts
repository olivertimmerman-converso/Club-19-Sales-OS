/**
 * Club 19 Sales OS - Link Invoice API
 *
 * POST: Link an unallocated Xero import to an existing sale
 * This allows multiple Xero invoices to be associated with a single sale
 * (e.g., when client pays in multiple parts - deposit + balance)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  calculateMargins,
  getVATRateForBrandingTheme,
  calculateExVatWithRate,
  toNumber,
} from '@/lib/economics';
import { roundCurrency, addCurrency } from '@/lib/utils/currency';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface LinkedInvoice {
  xero_invoice_id: string;
  xero_invoice_number: string;
  amount_inc_vat: number;
  currency: string;
  invoice_date: string;
  linked_at: string;
  linked_by: string;
}

/**
 * POST /api/sales/[id]/link-invoice
 * Link an unallocated Xero import to this sale
 *
 * Body: { xero_import_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role check: superadmin/founder/operations can link any sale,
    // shoppers can link invoices to their own sales only
    const role = await getUserRole();
    const managementRoles = ['superadmin', 'founder', 'operations'];
    const canLinkAnySale = managementRoles.includes(role || '');

    if (!canLinkAnySale && role !== 'shopper') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { id: saleId } = await params;
    const body = await request.json();
    const { xero_import_id } = body;

    if (!xero_import_id) {
      return NextResponse.json(
        { error: 'xero_import_id is required' },
        { status: 400 }
      );
    }

    logger.info('LINK_INVOICE', 'Link invoice request', { saleId, xero_import_id, role });

    // Fetch the target sale
    const saleResults = await db
      .select()
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);
    const sale = saleResults[0] || null;

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Shoppers can only link invoices to their own sales
    if (!canLinkAnySale) {
      const shopperRecord = await db.query.shoppers.findFirst({
        where: eq(shoppers.clerkUserId, userId),
      });
      if (!shopperRecord || sale.shopperId !== shopperRecord.id) {
        return NextResponse.json(
          { error: 'You can only link invoices to your own sales' },
          { status: 403 }
        );
      }
    }

    // Prevent linking a sale to itself (by DB id or Xero invoice id)
    if (sale.id === xero_import_id) {
      return NextResponse.json(
        { error: 'Cannot link a sale to itself' },
        { status: 400 }
      );
    }

    // Also check by Xero invoice ID (prevents linking duplicate DB records of the same invoice)
    const [importToCheck] = await db
      .select({ xeroInvoiceId: sales.xeroInvoiceId })
      .from(sales)
      .where(eq(sales.id, xero_import_id))
      .limit(1);
    if (importToCheck && sale.xeroInvoiceId && importToCheck.xeroInvoiceId === sale.xeroInvoiceId) {
      return NextResponse.json(
        { error: 'Cannot link an invoice to itself' },
        { status: 400 }
      );
    }

    // Fetch the Xero import to link
    const xeroImportResults = await db
      .select()
      .from(sales)
      .where(eq(sales.id, xero_import_id))
      .limit(1);
    const xeroImport = xeroImportResults[0] || null;

    if (!xeroImport) {
      return NextResponse.json(
        { error: 'Xero import not found' },
        { status: 404 }
      );
    }

    // Validate it's a Xero-originated invoice (import, allocated, or adopted — not an atelier sale)
    const linkableSources = ['xero_import', 'allocated', 'adopted'];
    if (!linkableSources.includes(xeroImport.source || '')) {
      return NextResponse.json(
        { error: 'Can only link Xero-originated invoices' },
        { status: 400 }
      );
    }

    // Check it's not already soft-deleted (linked elsewhere)
    if (xeroImport.deletedAt) {
      return NextResponse.json(
        { error: 'Invoice has already been linked or deleted' },
        { status: 400 }
      );
    }

    // Validate currencies match
    const saleCurrency = sale.currency || 'GBP';
    const importCurrency = xeroImport.currency || 'GBP';
    if (saleCurrency !== importCurrency) {
      return NextResponse.json(
        { error: `Cannot link invoice with different currency (sale: ${saleCurrency}, import: ${importCurrency})` },
        { status: 400 }
      );
    }

    // Get existing linked invoices array
    const existingLinked: LinkedInvoice[] = (sale as any).linkedInvoices || [];

    // Check if already linked
    if (existingLinked.some(inv => inv.xero_invoice_id === xeroImport.xeroInvoiceId)) {
      return NextResponse.json(
        { error: 'Invoice is already linked to this sale' },
        { status: 400 }
      );
    }

    // Create new linked invoice entry
    const newLinkedInvoice: LinkedInvoice = {
      xero_invoice_id: xeroImport.xeroInvoiceId || '',
      xero_invoice_number: xeroImport.xeroInvoiceNumber || 'Unknown',
      amount_inc_vat: roundCurrency(toNumber(xeroImport.saleAmountIncVat)),
      currency: importCurrency,
      invoice_date: xeroImport.saleDate ? xeroImport.saleDate.toISOString() : new Date().toISOString(),
      linked_at: new Date().toISOString(),
      linked_by: userId,
    };

    const updatedLinked = [...existingLinked, newLinkedInvoice];

    // Calculate new totals
    // Extract the primary's ORIGINAL amount by subtracting any existing linked amounts
    // from the current total. This prevents cumulative double-counting when linking
    // multiple invoices sequentially (the DB value includes prior linked amounts).
    const currentTotal = roundCurrency(toNumber(sale.saleAmountIncVat));
    const existingLinkedTotal = existingLinked.reduce(
      (sum, inv) => addCurrency(sum, inv.amount_inc_vat),
      0
    );
    const primaryOriginalAmount = roundCurrency(currentTotal - existingLinkedTotal);

    const allLinkedAmounts = updatedLinked.reduce(
      (sum, inv) => addCurrency(sum, inv.amount_inc_vat),
      0
    );
    const totalIncVat = addCurrency(primaryOriginalAmount, allLinkedAmounts);

    // Recalculate ex-VAT using branding theme
    const vatRate = getVATRateForBrandingTheme(sale.brandingTheme);
    const totalExVat = calculateExVatWithRate(totalIncVat, vatRate);

    // Recalculate margins
    const margins = calculateMargins({
      saleAmountExVat: totalExVat,
      buyPrice: sale.buyPrice,
      shippingCost: sale.shippingCost,
      cardFees: sale.cardFees,
      directCosts: sale.directCosts,
      introducerCommission: sale.introducerCommission,
    });

    logger.info('LINK_INVOICE', 'Recalculated totals', {
      saleId,
      primaryOriginalAmount,
      allLinkedAmounts,
      totalIncVat,
      totalExVat,
      grossMargin: margins.grossMargin,
      commissionableMargin: margins.commissionableMargin,
    });

    // Update the sale with new linked invoices and recalculated totals
    const updatedSaleResults = await db
      .update(sales)
      .set({
        linkedInvoices: updatedLinked,
        saleAmountIncVat: totalIncVat,
        saleAmountExVat: totalExVat,
        grossMargin: margins.grossMargin,
        commissionableMargin: margins.commissionableMargin,
      })
      .where(eq(sales.id, saleId))
      .returning();
    const updatedSale = updatedSaleResults[0] || null;

    // Soft-delete the linked import
    await db
      .update(sales)
      .set({
        deletedAt: new Date(),
        needsAllocation: false,
      })
      .where(eq(sales.id, xero_import_id));

    logger.info('LINK_INVOICE', 'Invoice linked successfully', {
      saleId,
      linkedInvoiceId: xero_import_id,
      xeroInvoiceNumber: newLinkedInvoice.xero_invoice_number,
    });

    return NextResponse.json({
      success: true,
      sale: updatedSale,
      linked_invoice: newLinkedInvoice,
    });
  } catch (error) {
    logger.error('LINK_INVOICE', 'Error linking invoice', { error: error as any });
    return NextResponse.json(
      { error: 'Failed to link invoice' },
      { status: 500 }
    );
  }
}
