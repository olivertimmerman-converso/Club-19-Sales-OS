/**
 * Club 19 Sales OS - Claim Sale API
 *
 * POST /api/sales/[id]/claim
 * Allows a shopper to claim an unallocated sale that belongs to one of their buyers
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sales, buyers, shoppers } from "@/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { getUserRole } from "@/lib/getUserRole";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/sales/[id]/claim
 * Claim an unallocated sale for the current shopper
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: saleId } = await params;
    logger.info("CLAIM", "Claim request received", { saleId, userId });

    // Get user's full name from Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userFullName = user?.fullName;

    // Find the shopper record - prefer clerk_user_id (more reliable), fall back to name
    let shopperRecord = null;

    // Try clerk_user_id first
    shopperRecord = await db.query.shoppers.findFirst({
      where: eq(shoppers.clerkUserId, userId),
    });

    // Fall back to name matching if no clerk_user_id match
    if (!shopperRecord && userFullName) {
      shopperRecord = await db.query.shoppers.findFirst({
        where: eq(shoppers.name, userFullName),
      });
    }

    if (!shopperRecord) {
      logger.warn("CLAIM", "No shopper record found for user", { userId, userFullName });
      return NextResponse.json(
        { error: "No shopper profile found for your account." },
        { status: 400 }
      );
    }

    const currentShopperId = shopperRecord.id;
    logger.info("CLAIM", "Found shopper record", { shopperId: currentShopperId, shopperName: shopperRecord.name });

    // Fetch the sale with buyer relationship
    const sale = await db.query.sales.findFirst({
      where: eq(sales.id, saleId),
      with: {
        buyer: true,
      },
    });

    // Validation 1: Sale must exist
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    // Validation 2: Sale must not be deleted
    if (sale.deletedAt) {
      return NextResponse.json({ error: "Sale has been deleted" }, { status: 400 });
    }

    // Validation 3: Sale must need allocation
    if (!sale.needsAllocation) {
      return NextResponse.json(
        { error: "This sale does not need allocation" },
        { status: 400 }
      );
    }

    // Validation 4: Sale must not already have a shopper assigned
    if (sale.shopperId) {
      return NextResponse.json(
        { error: "This sale has already been claimed by another shopper" },
        { status: 409 }
      );
    }

    // Validation 5: Buyer must be owned by this shopper OR have no owner
    const buyerId = sale.buyerId;
    const buyerOwnerId = sale.buyer?.ownerId;

    if (buyerOwnerId && buyerOwnerId !== currentShopperId) {
      logger.warn("CLAIM", "Buyer owned by different shopper", {
        saleId,
        buyerId,
        buyerOwnerId,
        currentShopperId,
      });
      return NextResponse.json(
        { error: "This buyer is assigned to a different shopper" },
        { status: 403 }
      );
    }

    logger.info("CLAIM", "Validation passed, processing claim", {
      saleId,
      currentShopperId,
      buyerId,
      buyerHasOwner: !!buyerOwnerId,
    });

    // Start transaction-like operations
    // 1. Update the sale
    const [updatedSale] = await db
      .update(sales)
      .set({
        shopperId: currentShopperId,
        needsAllocation: false,
      })
      .where(
        and(
          eq(sales.id, saleId),
          // Race condition protection: only update if still unclaimed
          isNull(sales.shopperId),
          eq(sales.needsAllocation, true)
        )
      )
      .returning();

    // Check if the update succeeded (race condition protection)
    if (!updatedSale) {
      logger.warn("CLAIM", "Sale claim failed - possible race condition", { saleId });
      return NextResponse.json(
        { error: "This sale was just claimed by someone else" },
        { status: 409 }
      );
    }

    // 2. If buyer has no owner, assign this shopper as owner
    if (buyerId && !buyerOwnerId) {
      logger.info("CLAIM", "Assigning buyer ownership", { buyerId, currentShopperId });
      await db
        .update(buyers)
        .set({
          ownerId: currentShopperId,
          ownerChangedAt: new Date(),
          ownerChangedBy: userId,
        })
        .where(
          and(
            eq(buyers.id, buyerId),
            // Only update if still no owner (race protection)
            isNull(buyers.ownerId)
          )
        );
    }

    logger.info("CLAIM", "Sale claimed successfully", {
      saleId,
      shopperId: currentShopperId,
      buyerOwnershipAssigned: buyerId && !buyerOwnerId,
    });

    return NextResponse.json({
      success: true,
      saleId,
      message: "Sale claimed successfully",
    });
  } catch (error: any) {
    logger.error("CLAIM", "Error claiming sale", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to claim sale", details: error.message },
      { status: 500 }
    );
  }
}
