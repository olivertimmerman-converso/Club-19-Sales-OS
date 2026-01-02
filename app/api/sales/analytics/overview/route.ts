/**
 * Club 19 Sales OS - Sales Analytics Overview API
 *
 * GET /api/sales/analytics/overview
 * Returns high-level KPIs and metrics for dashboard display
 *
 * Admin/Finance/Superadmin only endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import type { SalesRecord } from "@/src/xata";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  computePaymentFlags,
  computeOverdueFlags,
  computeMarginMetrics,
  computeAuthenticityRisk,
} from "@/lib/sales-summary-helpers";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ============================================================================
// XATA CLIENT
// ============================================================================

let _xata: ReturnType<typeof getXataClient> | null = null;

function xata() {
  if (_xata) return _xata;
  _xata = getXataClient();
  return _xata;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AnalyticsOverview {
  // General KPIs
  total_sales_count: number;
  total_revenue_inc_vat: number;
  total_buy_cost: number;
  total_margin: number;
  average_margin_percent: number;

  // Payment status
  count_paid: number;
  count_unpaid: number;
  count_overdue: number;

  // Buyer type breakdown
  end_client_sales_count: number;
  b2b_sales_count: number;

  // Authenticity tracking
  authenticity_high_risk_count: number;
  authenticity_missing_receipt_count: number;

  // Error tracking
  errors_count_total: number;
  errors_by_group: Record<string, number>;
}

// ============================================================================
// GET HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  logger.info("ANALYTICS", "GET request received");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      logger.error("ANALYTICS", "Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      logger.error("ANALYTICS", "Forbidden - insufficient permissions", { role });
      return NextResponse.json(
        { error: "Forbidden", message: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    logger.info("ANALYTICS", "Authorized", { role });

    // STEP 2: Fetch all sales
    logger.info("ANALYTICS", "Fetching sales...");

    const sales = await xata()
      .db.Sales.select([
        "id",
        "status",
        "buyer_type",
        "authenticity_status",
        "supplier_receipt_attached",
        "invoice_due_date",
        "sale_amount_inc_vat",
        "buy_price",
        "commissionable_margin",
      ])
      .getMany();

    logger.info("ANALYTICS", "Found sales", { count: sales.length });

    // STEP 3: Fetch all errors
    logger.info("ANALYTICS", "Fetching errors...");

    const errors = await xata()
      .db.Errors.select(["id", "error_group"])
      .getMany();

    logger.info("ANALYTICS", "Found errors", { count: errors.length });

    // STEP 4: Compute KPIs
    logger.info("ANALYTICS", "Computing KPIs...");

    let total_revenue_inc_vat = 0;
    let total_buy_cost = 0;
    let total_margin = 0;
    let count_paid = 0;
    let count_unpaid = 0;
    let count_overdue = 0;
    let end_client_sales_count = 0;
    let b2b_sales_count = 0;
    let authenticity_high_risk_count = 0;
    let authenticity_missing_receipt_count = 0;

    for (const sale of sales) {
      // Revenue & costs
      total_revenue_inc_vat += sale.sale_amount_inc_vat || 0;
      total_buy_cost += sale.buy_price || 0;
      total_margin += sale.commissionable_margin || 0;

      // Payment status
      const paymentFlags = computePaymentFlags(sale as SalesRecord);
      if (paymentFlags.isPaid) {
        count_paid++;
      } else {
        count_unpaid++;
      }

      // Overdue status
      const overdueFlags = computeOverdueFlags(sale as SalesRecord);
      if (overdueFlags.is_overdue) {
        count_overdue++;
      }

      // Buyer type
      if (sale.buyer_type === "end_client") {
        end_client_sales_count++;
      } else if (sale.buyer_type === "b2b") {
        b2b_sales_count++;
      }

      // Authenticity risk
      const authenticityRisk = computeAuthenticityRisk(sale as SalesRecord);
      if (authenticityRisk === "high_risk") {
        authenticity_high_risk_count++;
      } else if (authenticityRisk === "missing_receipt") {
        authenticity_missing_receipt_count++;
      }
    }

    // Average margin
    const average_margin_percent =
      total_revenue_inc_vat > 0 ? (total_margin / total_revenue_inc_vat) * 100 : 0;

    // Error grouping
    const errors_by_group: Record<string, number> = {};
    for (const error of errors) {
      const group = error.error_group || "unknown";
      errors_by_group[group] = (errors_by_group[group] || 0) + 1;
    }

    // STEP 5: Build response
    const overview: AnalyticsOverview = {
      // General KPIs
      total_sales_count: sales.length,
      total_revenue_inc_vat,
      total_buy_cost,
      total_margin,
      average_margin_percent,

      // Payment status
      count_paid,
      count_unpaid,
      count_overdue,

      // Buyer type breakdown
      end_client_sales_count,
      b2b_sales_count,

      // Authenticity tracking
      authenticity_high_risk_count,
      authenticity_missing_receipt_count,

      // Error tracking
      errors_count_total: errors.length,
      errors_by_group,
    };

    logger.info("ANALYTICS", "Computed analytics");

    // STEP 6: Return response
    return NextResponse.json(overview);
  } catch (error: any) {
    logger.error("ANALYTICS", "Failed to compute analytics", { error });

    return NextResponse.json(
      {
        error: "Failed to compute analytics",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
