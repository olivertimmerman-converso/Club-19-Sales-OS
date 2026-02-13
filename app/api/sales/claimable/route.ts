/**
 * Club 19 Sales OS - Claimable Sales API
 *
 * GET /api/sales/claimable
 * Returns unallocated sales that the current shopper can claim
 * (where the buyer is owned by this shopper OR has no owner)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sales, buyers, shoppers } from "@/db/schema";
import { eq, and, isNull, or, desc } from "drizzle-orm";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/sales/claimable
 * Fetch unallocated sales that the current shopper can claim
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.info("CLAIMABLE", "Fetching claimable sales", { userId });

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
      logger.warn("CLAIMABLE", "No shopper record found for user", { userId, userFullName });
      return NextResponse.json({ sales: [], shopperId: null });
    }

    const currentShopperId = shopperRecord.id;
    logger.info("CLAIMABLE", "Found shopper record", { shopperId: currentShopperId });

    // Query for claimable sales:
    // - needs_allocation = true
    // - deleted_at IS NULL
    // - dismissed = false OR NULL
    // - shopper_id IS NULL
    // - buyer is owned by this shopper OR buyer has no owner
    const claimableSales = await db.query.sales.findMany({
      where: and(
        eq(sales.needsAllocation, true),
        isNull(sales.deletedAt),
        or(eq(sales.dismissed, false), isNull(sales.dismissed)),
        isNull(sales.shopperId)
      ),
      with: {
        buyer: true,
      },
      orderBy: [desc(sales.saleDate)],
    });

    // Filter to only include sales where buyer is owned by this shopper OR has no owner
    const filteredSales = claimableSales.filter((sale) => {
      if (!sale.buyer) {
        // No buyer - include it (anyone can claim)
        return true;
      }
      const buyerOwnerId = sale.buyer.ownerId;
      // Include if: no owner OR owner is current shopper
      return !buyerOwnerId || buyerOwnerId === currentShopperId;
    });

    logger.info("CLAIMABLE", "Found claimable sales", {
      total: claimableSales.length,
      filtered: filteredSales.length,
      shopperId: currentShopperId,
    });

    // Serialize for client
    const serializedSales = filteredSales.map((sale) => ({
      id: sale.id,
      xero_invoice_number: sale.xeroInvoiceNumber || null,
      xero_invoice_id: sale.xeroInvoiceId || null,
      sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
      sale_amount_inc_vat: sale.saleAmountIncVat || 0,
      currency: sale.currency || "GBP",
      buyer_name: sale.buyer?.name || "Unknown",
      buyer_id: sale.buyerId || null,
      buyer_has_owner: !!sale.buyer?.ownerId,
      invoice_status: sale.invoiceStatus || null,
    }));

    return NextResponse.json({
      sales: serializedSales,
      shopperId: currentShopperId,
    });
  } catch (error: any) {
    logger.error("CLAIMABLE", "Error fetching claimable sales", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to fetch claimable sales", details: error.message },
      { status: 500 }
    );
  }
}
