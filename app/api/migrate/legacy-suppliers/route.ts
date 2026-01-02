/**
 * Club 19 Sales OS - Legacy Suppliers Migration API
 *
 * POST endpoint to migrate legacy_suppliers to main Suppliers table
 * Superadmin only - one-time migration
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import * as logger from "@/lib/logger";

const xata = getXataClient();

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is superadmin or founder
    const userRole = await getUserRole();

    if (userRole !== "superadmin" && userRole !== "founder") {
      return NextResponse.json(
        { error: "Forbidden - Superadmin or Founder access required" },
        { status: 403 }
      );
    }

    logger.info('SUPPLIER_MIGRATION', 'Starting legacy suppliers migration');

    // Get all legacy suppliers
    const legacySuppliers = await xata.db.legacy_suppliers
      .select(["id", "supplier_clean", "trade_count"])
      .getAll();

    logger.info('SUPPLIER_MIGRATION', 'Found legacy suppliers', {
      count: legacySuppliers.length
    });

    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Migrate each legacy supplier
    for (const legacy of legacySuppliers) {
      if (!legacy.supplier_clean || !legacy.supplier_clean.trim()) {
        logger.info('SUPPLIER_MIGRATION', 'Skipping legacy supplier - no supplier_clean value', {
          legacyId: legacy.id
        });
        skipped++;
        continue;
      }

      const supplierName = legacy.supplier_clean.trim();

      try {
        // Check if supplier already exists in main Suppliers table
        const existing = await xata.db.Suppliers.filter({
          name: { $is: supplierName },
        }).getFirst();

        if (existing) {
          logger.info('SUPPLIER_MIGRATION', 'Skipping - already exists in Suppliers table', {
            supplierName
          });
          skipped++;
          continue;
        }

        // Create new supplier in main Suppliers table
        await xata.db.Suppliers.create({
          name: supplierName,
        });

        logger.info('SUPPLIER_MIGRATION', 'Migrated supplier', { supplierName });
        migrated++;
      } catch (error) {
        logger.error('SUPPLIER_MIGRATION', 'Error migrating supplier', {
          supplierName,
          error: error as any
        });
        errors.push(`${supplierName}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    logger.info('SUPPLIER_MIGRATION', 'Migration complete', {
      migrated,
      skipped,
      errorCount: errors.length
    });

    return NextResponse.json({
      success: true,
      total: legacySuppliers.length,
      migrated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Migration complete: ${migrated} suppliers migrated, ${skipped} skipped`,
    });
  } catch (error) {
    logger.error('SUPPLIER_MIGRATION', 'Migration error', { error: error as any });
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
