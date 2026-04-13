/**
 * GET /api/finance/commissions?month=2026-02
 *
 * Returns commission calculation for all configured shoppers for the given
 * month. Defaults to the current month if no month param is provided.
 *
 * Response: { month, shoppers: CommissionResult[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { db } from "@/db";
import { sales, buyers } from "@/db/schema";
import { and, eq, gte, lt, isNull } from "drizzle-orm";
import {
  getAllShopperConfigs,
  calculateShopperCommission,
  type SaleForCommission,
} from "@/lib/calculations/commission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole();
    if (!["superadmin", "founder", "operations", "finance"].includes(role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse month param (YYYY-MM) or default to current month
    const monthParam = request.nextUrl.searchParams.get("month");
    let year: number;
    let monthNum: number; // 0-indexed
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      year = y;
      monthNum = m - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      monthNum = now.getMonth();
    }

    const monthStart = new Date(Date.UTC(year, monthNum, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum + 1, 1));
    const monthLabel = `${year}-${String(monthNum + 1).padStart(2, "0")}`;

    const configs = getAllShopperConfigs();
    const results = [];

    for (const config of configs) {
      // Fetch all non-deleted sales for this shopper in the month
      const salesData = await db
        .select({
          id: sales.id,
          xeroInvoiceNumber: sales.xeroInvoiceNumber,
          saleDate: sales.saleDate,
          saleAmountIncVat: sales.saleAmountIncVat,
          saleAmountExVat: sales.saleAmountExVat,
          buyPrice: sales.buyPrice,
          brandingTheme: sales.brandingTheme,
          introducerCommission: sales.introducerCommission,
          cardFees: sales.cardFees,
          entrupyFee: sales.entrupyFee,
          shippingCost: sales.shippingCost,
          dhlCost: sales.dhlCost,
          addisonLeeCost: sales.addisonLeeCost,
          taxiCost: sales.taxiCost,
          handDeliveryCost: sales.handDeliveryCost,
          otherLogisticsCost: sales.otherLogisticsCost,
          deliveryConfirmed: sales.deliveryConfirmed,
          isNewClient: sales.isNewClient,
          buyerId: sales.buyerId,
          buyerName: buyers.name,
        })
        .from(sales)
        .leftJoin(buyers, eq(sales.buyerId, buyers.id))
        .where(
          and(
            eq(sales.shopperId, config.shopperId),
            isNull(sales.deletedAt),
            gte(sales.saleDate, monthStart),
            lt(sales.saleDate, monthEnd)
          )
        )
        .orderBy(sales.saleDate);

      const salesToCalc: SaleForCommission[] = salesData.map((s) => ({
        id: s.id,
        xeroInvoiceNumber: s.xeroInvoiceNumber,
        saleDate: s.saleDate,
        saleAmountIncVat: s.saleAmountIncVat,
        saleAmountExVat: s.saleAmountExVat,
        buyPrice: s.buyPrice,
        brandingTheme: s.brandingTheme,
        introducerCommission: s.introducerCommission,
        cardFees: s.cardFees,
        entrupyFee: s.entrupyFee,
        shippingCost: s.shippingCost,
        dhlCost: s.dhlCost,
        addisonLeeCost: s.addisonLeeCost,
        taxiCost: s.taxiCost,
        handDeliveryCost: s.handDeliveryCost,
        otherLogisticsCost: s.otherLogisticsCost,
        deliveryConfirmed: s.deliveryConfirmed,
        isNewClient: s.isNewClient,
        buyerName: s.buyerName,
      }));

      const result = calculateShopperCommission(salesToCalc, config, monthLabel);
      results.push(result);
    }

    return NextResponse.json({ month: monthLabel, shoppers: results });
  } catch (error) {
    console.error("[commissions] Error", error);
    return NextResponse.json(
      { error: "Failed to calculate commissions" },
      { status: 500 }
    );
  }
}
