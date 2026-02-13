/**
 * Club 19 Sales OS - Sale Data Completion API
 *
 * POST /api/sales/[id]/complete
 * Saves missing data fields and recalculates margins/commission
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { calculateSaleEconomics } from "@/lib/economics";
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/sales/[id]/complete
 * Complete missing data fields on a sale and recalculate margins
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole();
    const { id: saleId } = await params;

    logger.info("COMPLETE", "Data completion request received", { saleId, userId, role });

    // Fetch the current sale
    const [currentSale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);

    if (!currentSale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    // Permission check
    const canEditAny = ["superadmin", "founder", "operations"].includes(role || "");

    if (!canEditAny) {
      // Get the shopper record for the current user
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

      // Check if this sale belongs to the current shopper
      if (!shopperRecord || currentSale.shopperId !== shopperRecord.id) {
        return NextResponse.json(
          { error: "You can only complete data for your own sales" },
          { status: 403 }
        );
      }
    }

    // Parse request body
    const body = await request.json();
    logger.info("COMPLETE", "Received completion data", { saleId, fields: Object.keys(body) });

    // Build update object
    const updateData: Record<string, unknown> = {};

    // Map API field names to Drizzle schema field names
    if (body.supplier !== undefined) {
      updateData.supplierId = body.supplier || null;
    }
    if (body.brand !== undefined && body.brand !== "Unknown") {
      updateData.brand = body.brand;
    }
    if (body.category !== undefined && body.category !== "Unknown") {
      updateData.category = body.category;
    }
    if (body.item_title !== undefined) {
      updateData.itemTitle = body.item_title;
    }
    if (body.buy_price !== undefined) {
      updateData.buyPrice = body.buy_price;
    }
    if (body.branding_theme !== undefined) {
      updateData.brandingTheme = body.branding_theme;
    }
    if (body.buyer_type !== undefined) {
      updateData.buyerType = body.buyer_type;
    }
    if (body.shipping_cost !== undefined) {
      updateData.shippingCost = body.shipping_cost;
    }
    if (body.card_fees !== undefined) {
      updateData.cardFees = body.card_fees;
    }

    // Get values for margin recalculation (merge current with updates)
    const saleAmountIncVat = currentSale.saleAmountIncVat || 0;
    const buyPrice = updateData.buyPrice !== undefined
      ? Number(updateData.buyPrice)
      : (currentSale.buyPrice || 0);
    const brandingTheme = updateData.brandingTheme !== undefined
      ? String(updateData.brandingTheme)
      : currentSale.brandingTheme;
    const shippingCost = updateData.shippingCost !== undefined
      ? Number(updateData.shippingCost)
      : (currentSale.shippingCost || 0);
    const cardFees = updateData.cardFees !== undefined
      ? Number(updateData.cardFees)
      : (currentSale.cardFees || 0);
    const directCosts = currentSale.directCosts || 0;
    const introducerCommission = currentSale.introducerCommission || 0;

    // Recalculate economics using the centralized function
    logger.info("COMPLETE", "Recalculating economics", {
      saleId,
      saleAmountIncVat,
      buyPrice,
      brandingTheme,
      shippingCost,
      cardFees,
    });

    const economics = calculateSaleEconomics({
      sale_amount_inc_vat: saleAmountIncVat,
      buy_price: buyPrice,
      branding_theme: brandingTheme,
      shipping_cost: shippingCost,
      card_fees: cardFees,
      direct_costs: directCosts,
      introducer_commission: introducerCommission,
    });

    // Add recalculated values to update
    updateData.saleAmountExVat = economics.sale_amount_ex_vat;
    updateData.grossMargin = economics.gross_margin;
    updateData.commissionableMargin = economics.commissionable_margin;

    logger.info("COMPLETE", "Economics recalculated", {
      saleId,
      saleAmountExVat: economics.sale_amount_ex_vat,
      grossMargin: economics.gross_margin,
      commissionableMargin: economics.commissionable_margin,
    });

    // Mark as completed with timestamp and user
    updateData.completedAt = new Date();
    updateData.completedBy = userId;

    // Perform the update
    const [updatedSale] = await db
      .update(sales)
      .set(updateData)
      .where(eq(sales.id, saleId))
      .returning();

    if (!updatedSale) {
      return NextResponse.json({ error: "Failed to update sale" }, { status: 500 });
    }

    logger.info("COMPLETE", "Sale data completed successfully", {
      saleId,
      updatedFields: Object.keys(updateData),
      completedBy: userId,
    });

    return NextResponse.json({
      success: true,
      sale: {
        id: updatedSale.id,
        grossMargin: updatedSale.grossMargin,
        commissionableMargin: updatedSale.commissionableMargin,
      },
    });
  } catch (error: any) {
    logger.error("COMPLETE", "Error completing sale data", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to complete sale data", details: error.message },
      { status: 500 }
    );
  }
}
