/**
 * Club 19 Sales OS - Incomplete Sales API
 *
 * GET /api/sales/incomplete
 * Returns sales assigned to the current shopper that have incomplete data fields
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sales, buyers, shoppers } from "@/db/schema";
import { eq, and, isNull, or, desc } from "drizzle-orm";
import { assessCompleteness, type SaleForCompleteness } from "@/lib/completeness";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/sales/incomplete
 * Fetch sales with incomplete data for the current shopper
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.info("INCOMPLETE", "Fetching incomplete sales", { userId });

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
      logger.warn("INCOMPLETE", "No shopper record found for user", { userId, userFullName });
      return NextResponse.json({ sales: [], shopperId: null });
    }

    const currentShopperId = shopperRecord.id;
    logger.info("INCOMPLETE", "Found shopper record", { shopperId: currentShopperId });

    // Query for sales that are:
    // - Assigned to this shopper
    // - Not deleted
    // - Not needing allocation (already claimed/assigned)
    // - Have at least one missing required field
    const shopperSales = await db.query.sales.findMany({
      where: and(
        eq(sales.shopperId, currentShopperId),
        isNull(sales.deletedAt),
        eq(sales.needsAllocation, false),
        // At least one required field is missing
        or(
          isNull(sales.supplierId),
          isNull(sales.category),
          eq(sales.category, ""),
          eq(sales.category, "Unknown"),
          isNull(sales.brand),
          eq(sales.brand, ""),
          eq(sales.brand, "Unknown"),
          isNull(sales.buyPrice),
          eq(sales.buyPrice, 0),
          isNull(sales.brandingTheme),
          eq(sales.brandingTheme, "")
        )
      ),
      with: {
        buyer: true,
      },
      orderBy: [desc(sales.saleDate)],
    });

    logger.info("INCOMPLETE", "Found potentially incomplete sales", {
      count: shopperSales.length,
      shopperId: currentShopperId,
    });

    // Run full completeness assessment on each sale
    const incompleteSales = shopperSales
      .map((sale) => {
        const saleForCheck: SaleForCompleteness = {
          supplierId: sale.supplierId,
          category: sale.category,
          brand: sale.brand,
          buyPrice: sale.buyPrice,
          brandingTheme: sale.brandingTheme,
          buyerType: sale.buyerType,
          itemTitle: sale.itemTitle,
          shippingCost: sale.shippingCost,
          cardFees: sale.cardFees,
        };

        const assessment = assessCompleteness(saleForCheck);

        // Only include if not complete (has missing required fields)
        if (assessment.isComplete) {
          return null;
        }

        return {
          id: sale.id,
          sale_reference: sale.saleReference || null,
          xero_invoice_number: sale.xeroInvoiceNumber || null,
          sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
          sale_amount_inc_vat: sale.saleAmountIncVat || 0,
          currency: sale.currency || "GBP",
          buyer_name: sale.buyer?.name || "Unknown",
          buyer_id: sale.buyerId || null,
          completeness: {
            percentage: assessment.completionPercentage,
            missing_fields: assessment.missingFields.map((f) => f.label),
            missing_required: assessment.missingFields
              .filter((f) => f.priority === "required")
              .map((f) => f.label),
          },
        };
      })
      .filter(Boolean);

    logger.info("INCOMPLETE", "Filtered to truly incomplete sales", {
      count: incompleteSales.length,
      shopperId: currentShopperId,
    });

    return NextResponse.json({
      sales: incompleteSales,
      shopperId: currentShopperId,
    });
  } catch (error: any) {
    logger.error("INCOMPLETE", "Error fetching incomplete sales", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to fetch incomplete sales", details: error.message },
      { status: 500 }
    );
  }
}
