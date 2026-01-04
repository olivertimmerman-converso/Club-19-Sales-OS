/**
 * Club 19 Sales OS - Fix VAT Calculation API
 *
 * POST /api/sales/[id]/fix-vat
 * Recalculates VAT amounts based on branding_theme for a sale record
 *
 * This endpoint:
 * 1. Gets the sale record
 * 2. Looks up the branding theme mapping
 * 3. Recalculates sale_amount_inc_vat based on expectedVAT rate
 * 4. Updates the sale record
 * 5. Returns the updated amounts
 *
 * Superadmin only endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { getBrandingThemeMapping } from '@/lib/branding-theme-mappings';
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

    logger.info('FIX_VAT', 'Starting VAT recalculation', {
      saleId: id,
      saleReference: sale.sale_reference,
      brandingTheme: sale.branding_theme,
      currentExVat: sale.sale_amount_ex_vat,
      currentIncVat: sale.sale_amount_inc_vat
    });

    // Get branding theme mapping
    const brandingThemeMapping = getBrandingThemeMapping(sale.branding_theme || null);

    if (!brandingThemeMapping) {
      logger.warn('FIX_VAT', 'Branding theme not recognized', {
        brandingTheme: sale.branding_theme
      });
      return NextResponse.json(
        {
          error: 'Unknown branding theme',
          brandingTheme: sale.branding_theme,
          message: 'Cannot determine correct VAT rate for this branding theme'
        },
        { status: 400 }
      );
    }

    const vatRate = brandingThemeMapping.expectedVAT;
    const vatRateDecimal = vatRate / 100;

    // Calculate correct VAT amounts
    const saleAmountExVat = sale.sale_amount_ex_vat || 0;
    let saleAmountIncVat: number;

    if (vatRate === 0) {
      // Zero-rated: inc VAT = ex VAT
      saleAmountIncVat = saleAmountExVat;
    } else {
      // Standard rate: add VAT
      saleAmountIncVat = saleAmountExVat * (1 + vatRateDecimal);
    }

    const vatAmount = saleAmountIncVat - saleAmountExVat;

    logger.info('FIX_VAT', 'VAT recalculated', {
      themeName: brandingThemeMapping.name,
      vatRate,
      saleAmountExVat,
      saleAmountIncVat,
      vatAmount,
      changed: Math.abs((sale.sale_amount_inc_vat || 0) - saleAmountIncVat) > 0.01
    });

    // Update the sale record
    const updatedSale = await xata.db.Sales.update(id, {
      sale_amount_inc_vat: saleAmountIncVat,
    });

    logger.info('FIX_VAT', 'Sale updated successfully', {
      saleId: id,
      oldIncVat: sale.sale_amount_inc_vat,
      newIncVat: saleAmountIncVat
    });

    return NextResponse.json({
      success: true,
      saleId: id,
      saleReference: sale.sale_reference,
      brandingTheme: {
        id: sale.branding_theme,
        name: brandingThemeMapping.name,
        accountCode: brandingThemeMapping.accountCode,
      },
      vatCalculation: {
        vatRate,
        saleAmountExVat,
        saleAmountIncVat,
        vatAmount,
      },
      changes: {
        oldIncVat: sale.sale_amount_inc_vat,
        newIncVat: saleAmountIncVat,
        difference: saleAmountIncVat - (sale.sale_amount_inc_vat || 0),
      },
    });
  } catch (error) {
    logger.error('FIX_VAT', 'Error fixing VAT', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to fix VAT',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
