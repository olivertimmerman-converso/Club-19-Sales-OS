/**
 * Club 19 Sales OS - Sale Introducer Management API
 *
 * PUT /api/sales/[id]/introducer
 * Updates introducer and commission on a sale
 *
 * Body: { introducerId?: string | null, introducerCommission?: number | null }
 *
 * MIGRATION STATUS: Converted from Xata SDK to Drizzle ORM (Feb 2026)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import * as logger from '@/lib/logger';

// Drizzle imports
import { db } from "@/db";
import { sales, introducers, introducerCommissionEdits } from "@/db/schema";
import { eq } from "drizzle-orm";

// ORIGINAL XATA:
// import { getXataClient } from '@/src/xata';

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

    // ORIGINAL XATA:
    // const xata = getXataClient();

    // If introducerId is provided (and not null), verify it exists
    let introducerName: string | null = null;
    if (introducerId) {
      // ORIGINAL XATA:
      // const introducer = await xata.db.Introducers.read(introducerId);

      // DRIZZLE:
      const [introducer] = await db
        .select()
        .from(introducers)
        .where(eq(introducers.id, introducerId))
        .limit(1);

      if (!introducer) {
        return NextResponse.json(
          { error: 'Introducer not found' },
          { status: 404 }
        );
      }
      introducerName = introducer.name || null;
    }

    // Build update object with correct Drizzle syntax
    const updateData: Record<string, any> = {};

    // Handle introducer link (use foreign key column, or null to clear)
    if (introducerId !== undefined) {
      updateData.introducerId = introducerId || null;
    }

    // Handle commission (direct value or null)
    if (introducerCommission !== undefined) {
      updateData.introducerCommission = introducerCommission;
    }

    // Transaction: read previous values, conditionally insert audit rows,
    // perform the update — atomically. Audit rows are written separately
    // for fee changes and FK link changes so the timeline on the sale
    // detail page stays readable. Two no-op cases never log: identical
    // fee resubmits, and dropdown saves that don't move the FK.
    const updatedSale = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          introducerId: sales.introducerId,
          introducerCommission: sales.introducerCommission,
        })
        .from(sales)
        .where(eq(sales.id, id))
        .limit(1);

      if (!existing) {
        return null;
      }

      const previousValue = existing.introducerCommission ?? null;
      const newValue =
        introducerCommission === undefined
          ? previousValue
          : introducerCommission ?? null;

      const feeChanged =
        introducerCommission !== undefined && previousValue !== newValue;
      if (feeChanged) {
        await tx.insert(introducerCommissionEdits).values({
          saleId: id,
          previousValue,
          newValue,
          editedBy: userId,
          eventType: "fee_change",
        });
      }

      // Link audit: 'manual_link' when an operator attaches/swaps a curated
      // record, 'unlink' when the FK is cleared. previous/new values stay
      // null for these rows — the fee is logged separately if it also moves.
      const previousIntroducerId = existing.introducerId ?? null;
      const requestedIntroducerId =
        introducerId === undefined ? previousIntroducerId : introducerId || null;
      const linkChanged =
        introducerId !== undefined && previousIntroducerId !== requestedIntroducerId;
      if (linkChanged) {
        await tx.insert(introducerCommissionEdits).values({
          saleId: id,
          previousValue: null,
          newValue: null,
          editedBy: userId,
          eventType: requestedIntroducerId ? "manual_link" : "unlink",
          linkedIntroducerId: requestedIntroducerId,
        });
      }

      const [row] = await tx
        .update(sales)
        .set(updateData)
        .where(eq(sales.id, id))
        .returning();
      return row;
    });

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
