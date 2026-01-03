/**
 * Club 19 Sales OS - Backfill Source Field
 *
 * One-time migration script to populate the new 'source' field in Sales table
 * Run this ONCE after adding the source column to Xata schema
 *
 * Logic:
 * - Records with brand = 'Unknown' OR brand IS NULL → source = 'xero_import'
 * - Records with valid brand data → source = 'atelier'
 */

import { NextResponse } from 'next/server';
import { getXataClient } from '@/src/xata';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const xata = getXataClient();

    // Get all Sales records
    const allSales = await xata.db.Sales.getAll();

    let xeroImportCount = 0;
    let atelierCount = 0;
    let skippedCount = 0;

    console.log(`\n=== BACKFILL SOURCE FIELD ===`);
    console.log(`Total Sales records: ${allSales.length}\n`);

    // Process each record
    for (const sale of allSales) {
      // Skip if already has source set
      if (sale.source && sale.source !== '') {
        skippedCount++;
        continue;
      }

      // Determine source based on brand data
      const hasValidBrand = sale.brand && sale.brand !== 'Unknown';

      if (hasValidBrand) {
        // Valid brand → atelier-created record
        await xata.db.Sales.update(sale.id, { source: 'atelier' });
        atelierCount++;
      } else {
        // Unknown/null brand → xero import
        await xata.db.Sales.update(sale.id, { source: 'xero_import' });
        xeroImportCount++;
      }
    }

    const summary = {
      total: allSales.length,
      updated: {
        xero_import: xeroImportCount,
        atelier: atelierCount,
      },
      skipped: skippedCount,
    };

    console.log(`\n=== BACKFILL COMPLETE ===`);
    console.log(`Updated ${xeroImportCount} records to 'xero_import'`);
    console.log(`Updated ${atelierCount} records to 'atelier'`);
    console.log(`Skipped ${skippedCount} records (already had source set)\n`);

    return NextResponse.json({
      success: true,
      message: 'Source field backfill completed',
      summary,
    });

  } catch (error: any) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
