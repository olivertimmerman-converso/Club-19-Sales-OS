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
import { normalizeIntroducerFeeType } from "@/lib/types/invoice";
import { db } from "@/db";
import { sales, shoppers, lineItems, errors } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import * as logger from "@/lib/logger";
import { pushSaleToShopperSheet, updateSaleRowInSheet } from "@/lib/google-sheets";

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
    // Payment structure fields (optional)
    if (body.deposit_amount !== undefined) {
      updateData.depositAmount = body.deposit_amount;
    }
    if (body.payment_plan_notes !== undefined) {
      updateData.paymentPlanNotes = body.payment_plan_notes;
    }
    // Logistics costs (Phase 2 WS3)
    if (body.dhl_cost !== undefined) {
      updateData.dhlCost = body.dhl_cost;
    }
    if (body.addison_lee_cost !== undefined) {
      updateData.addisonLeeCost = body.addison_lee_cost;
    }
    if (body.taxi_cost !== undefined) {
      updateData.taxiCost = body.taxi_cost;
    }
    if (body.hand_delivery_cost !== undefined) {
      updateData.handDeliveryCost = body.hand_delivery_cost;
    }
    if (body.other_logistics_cost !== undefined) {
      updateData.otherLogisticsCost = body.other_logistics_cost;
    }
    if (body.entrupy_fee !== undefined) {
      updateData.entrupyFee = body.entrupy_fee;
    }
    // Delivery tracking (Phase 2 WS3)
    if (body.delivery_confirmed !== undefined) {
      updateData.deliveryConfirmed = body.delivery_confirmed;
    }
    if (body.delivery_date !== undefined) {
      updateData.deliveryDate = body.delivery_date ? new Date(body.delivery_date) : null;
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

    // Granular logistics costs (Phase 2 WS3) — sum for economics
    const dhlCost = updateData.dhlCost !== undefined
      ? Number(updateData.dhlCost) : (currentSale.dhlCost || 0);
    const addisonLeeCost = updateData.addisonLeeCost !== undefined
      ? Number(updateData.addisonLeeCost) : (currentSale.addisonLeeCost || 0);
    const taxiCost = updateData.taxiCost !== undefined
      ? Number(updateData.taxiCost) : (currentSale.taxiCost || 0);
    const handDeliveryCost = updateData.handDeliveryCost !== undefined
      ? Number(updateData.handDeliveryCost) : (currentSale.handDeliveryCost || 0);
    const otherLogisticsCost = updateData.otherLogisticsCost !== undefined
      ? Number(updateData.otherLogisticsCost) : (currentSale.otherLogisticsCost || 0);
    const entrupyFee = updateData.entrupyFee !== undefined
      ? Number(updateData.entrupyFee) : (currentSale.entrupyFee || 0);

    // Total logistics = granular costs if any are set, otherwise fall back to shippingCost
    const totalLogisticsCost = dhlCost + addisonLeeCost + taxiCost + handDeliveryCost + otherLogisticsCost;
    const effectiveShippingCost = totalLogisticsCost > 0 ? totalLogisticsCost : shippingCost;

    // Recalculate economics using the centralized function
    logger.info("COMPLETE", "Recalculating economics", {
      saleId,
      saleAmountIncVat,
      buyPrice,
      brandingTheme,
      effectiveShippingCost,
      cardFees,
      entrupyFee,
    });

    let economics = calculateSaleEconomics({
      sale_amount_inc_vat: saleAmountIncVat,
      buy_price: buyPrice,
      branding_theme: brandingTheme,
      shipping_cost: effectiveShippingCost,
      card_fees: cardFees,
      direct_costs: directCosts,
      introducer_commission: introducerCommission,
      entrupy_fee: entrupyFee,
    });

    // If the sale has an introducer fee % (wizard-captured), recalculate the £
    // amount and re-run economics so commissionable margin reflects the
    // updated introducer cost. Flat-£ fees are fixed at creation and do not
    // recalculate here.
    //
    // The percent is applied to "net before introducer" — gross minus all
    // actual cost deductions EXCEPT the introducer fee — so the introducer's
    // share scales with real costs instead of leaving the shopper to absorb
    // the entire post-cost reduction. We derive that base by running
    // economics once with introducer=0 and reading commissionable_margin.
    let recalculatedIntroducerCommission: number | null = null;
    const introducerFeePercent = currentSale.introducerFeePercent;
    const introducerFeeType = normalizeIntroducerFeeType(currentSale.introducerFeeType);
    if (
      currentSale.hasIntroducer &&
      introducerFeeType !== "flat" &&
      introducerFeePercent != null &&
      introducerFeePercent > 0
    ) {
      const econNoIntroducer = calculateSaleEconomics({
        sale_amount_inc_vat: saleAmountIncVat,
        buy_price: buyPrice,
        branding_theme: brandingTheme,
        shipping_cost: effectiveShippingCost,
        card_fees: cardFees,
        direct_costs: directCosts,
        introducer_commission: 0,
        entrupy_fee: entrupyFee,
      });
      const netBeforeIntroducer = econNoIntroducer.commissionable_margin;

      recalculatedIntroducerCommission =
        netBeforeIntroducer > 0
          ? Math.round(netBeforeIntroducer * (introducerFeePercent / 100) * 100) / 100
          : 0;

      economics = calculateSaleEconomics({
        sale_amount_inc_vat: saleAmountIncVat,
        buy_price: buyPrice,
        branding_theme: brandingTheme,
        shipping_cost: effectiveShippingCost,
        card_fees: cardFees,
        direct_costs: directCosts,
        introducer_commission: recalculatedIntroducerCommission,
        entrupy_fee: entrupyFee,
      });
      updateData.introducerCommission = recalculatedIntroducerCommission;
    }

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

    // Update per-line-item suppliers if provided
    if (body.line_item_suppliers && Array.isArray(body.line_item_suppliers)) {
      for (const { lineItemId, supplierId: liSupplierId } of body.line_item_suppliers) {
        if (lineItemId && liSupplierId) {
          await db
            .update(lineItems)
            .set({ supplierId: liSupplierId })
            .where(eq(lineItems.id, lineItemId));
        }
      }
      logger.info("COMPLETE", "Updated line item suppliers", {
        saleId,
        count: body.line_item_suppliers.length,
      });
    }

    logger.info("COMPLETE", "Sale data completed successfully", {
      saleId,
      updatedFields: Object.keys(updateData),
      completedBy: userId,
    });

    // Push to Google Sheets (fire-and-forget, non-blocking)
    //
    // Two paths:
    //   - Atelier sales: already have a sheet row from wizard creation. Update
    //     that row in place using stored sheets_row_number + sheets_tab_name.
    //   - Non-atelier (adopted/xero_import): no sheet row yet. Append and
    //     persist the row number for future updates.
    try {
      const saleWithRelations = await db.query.sales.findFirst({
        where: eq(sales.id, saleId),
        with: { buyer: true, supplier: true },
      });
      const saleLineItems = await db.query.lineItems.findMany({
        where: eq(lineItems.saleId, saleId),
        with: { supplier: true },
        orderBy: [asc(lineItems.lineNumber)],
      });

      if (saleWithRelations) {
        const shopperRecord = saleWithRelations.shopperId
          ? await db.query.shoppers.findFirst({
              where: eq(shoppers.id, saleWithRelations.shopperId),
            })
          : null;
        const shopperName = shopperRecord?.name || "";

        const hasStoredRow =
          saleWithRelations.sheetsRowNumber != null &&
          saleWithRelations.sheetsTabName != null;

        if (hasStoredRow) {
          // In-place update across all configured legs (master + per-shopper).
          // Master uses stored row+tab; per-shopper legs always search by
          // invoice number. See the self-healing note in updateSaleOnOneSheet
          // for what happens to legacy MC/Hope sales whose sheetsRowNumber
          // points at the per-shopper sheet rather than master.
          const updateResult = await updateSaleRowInSheet({
            sale: saleWithRelations,
            lineItems: saleLineItems,
            shopperName,
            startRow: saleWithRelations.sheetsRowNumber!,
            tabName: saleWithRelations.sheetsTabName!,
          });

          if (
            updateResult.masterResolvedStartRow &&
            updateResult.masterResolvedStartRow !==
              saleWithRelations.sheetsRowNumber
          ) {
            // Master row was found at a different position — overwrite our
            // tracking. This is also the self-healing path for legacy sales.
            await db
              .update(sales)
              .set({ sheetsRowNumber: updateResult.masterResolvedStartRow })
              .where(eq(sales.id, saleId))
              .catch(() => {});
          }

          for (const leg of updateResult.legs) {
            if (leg.success) continue;
            const isMaster = leg.spreadsheetId === process.env.SHEET_ID_MASTER;
            await db
              .insert(errors)
              .values({
                saleId: saleId,
                severity: isMaster ? "medium" : "low",
                source: "sheets-sync",
                message: [
                  `leg=${isMaster ? "master" : "shopper"} spreadsheet=${leg.spreadsheetId}`,
                  `Sheets update on completion failed: ${leg.reason || "unknown"}`,
                ],
                timestamp: new Date(),
                resolved: false,
              })
              .catch(() => {});
          }

          logger.info("COMPLETE", "Sheets update attempted", {
            saleId,
            success: updateResult.success,
            legs: updateResult.legs.length,
            failedLegs: updateResult.legs.filter((l) => !l.success).length,
          });
        } else if (updatedSale.source !== "atelier") {
          // Append path: adopted/xero_import sale that hasn't been pushed yet.
          const pushResult = await pushSaleToShopperSheet({
            sale: saleWithRelations,
            lineItems: saleLineItems,
            shopperName,
          });

          if (pushResult.masterStartRow && pushResult.masterTabName) {
            await db
              .update(sales)
              .set({
                sheetsRowNumber: pushResult.masterStartRow,
                sheetsTabName: pushResult.masterTabName,
              })
              .where(eq(sales.id, saleId))
              .catch(() => {});
          }

          for (const leg of pushResult.legs) {
            if (leg.success) continue;
            const isMaster = leg.spreadsheetId === process.env.SHEET_ID_MASTER;
            await db
              .insert(errors)
              .values({
                saleId: saleId,
                severity: isMaster ? "medium" : "low",
                source: "sheets-sync",
                message: [
                  `leg=${isMaster ? "master" : "shopper"} spreadsheet=${leg.spreadsheetId}`,
                  `Sheets push on completion failed: ${leg.reason || "unknown"}`,
                ],
                timestamp: new Date(),
                resolved: false,
              })
              .catch(() => {});
          }

          logger.info("COMPLETE", "Sheets push attempted", {
            saleId,
            success: pushResult.success,
            skipped: pushResult.skipped,
            legs: pushResult.legs.length,
            failedLegs: pushResult.legs.filter((l) => !l.success).length,
          });
        } else {
          // Atelier sale without stored row (pre-tracking historical) —
          // nothing to do. Manual reconciliation required.
          logger.warn("COMPLETE", "Atelier sale has no stored sheet row; skipping sheets update", {
            saleId,
          });
        }
      }
    } catch (sheetsErr) {
      logger.error("COMPLETE", "Sheets sync wrapper failed (non-fatal)", {
        saleId,
        error:
          sheetsErr instanceof Error ? sheetsErr.message : String(sheetsErr),
      });
    }

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
