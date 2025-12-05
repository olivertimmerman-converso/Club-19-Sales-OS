/**
 * Club 19 Sales OS - Daily Maintenance Cron API
 *
 * POST /api/finance/daily-maintenance
 * Daily maintenance tasks for sales data integrity
 *
 * Designed to run at 07:00 UK time via Vercel Cron or external scheduler
 * Requires x-system-key header for token-based authentication
 * Superadmin role also allowed for manual execution
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
import { ERROR_TYPES, ERROR_TRIGGERED_BY, ERROR_GROUPS } from "@/lib/error-types";

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

interface DailyMaintenanceResponse {
  total_sales: number;
  total_overdue_identified: number;
  total_warnings_created: number;
  overdue_sales: Array<{
    sale_id: string;
    sale_reference: string;
    days_overdue: number;
  }>;
  warnings_created: Array<{
    sale_id: string;
    sale_reference: string;
    warning_type: string;
    message: string;
  }>;
}

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  console.log("[FINANCE][DAILY-MAINTENANCE] POST request received");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication - token-based OR superadmin
    const systemKey = req.headers.get("x-system-key");
    const expectedKey = process.env.SYSTEM_MAINTENANCE_KEY;

    let isAuthorized = false;
    let authMethod = "";

    // Option 1: Token-based authentication
    if (systemKey && expectedKey && systemKey === expectedKey) {
      isAuthorized = true;
      authMethod = "system-token";
      console.log("[FINANCE][DAILY-MAINTENANCE] ✓ Authorized via system token");
    } else {
      // Option 2: Superadmin role authentication
      const { userId } = await auth();
      if (userId) {
        const role = await getUserRole();
        if (role === "superadmin") {
          isAuthorized = true;
          authMethod = "superadmin";
          console.log(`[FINANCE][DAILY-MAINTENANCE] ✓ Authorized via superadmin role`);
        }
      }
    }

    if (!isAuthorized) {
      console.error("[FINANCE][DAILY-MAINTENANCE] ❌ Unauthorized - invalid token or insufficient permissions");
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid system key or superadmin role required" },
        { status: 401 }
      );
    }

    // STEP 2: Fetch all sales with required fields
    console.log("[FINANCE][DAILY-MAINTENANCE] Fetching sales...");

    const sales = await xata()
      .db.Sales.select([
        "id",
        "sale_reference",
        "status",
        "invoice_due_date",
        "sale_amount_inc_vat",
        "buy_price",
        "commissionable_margin",
        "authenticity_status",
        "supplier_receipt_attached",
      ])
      .getMany();

    console.log(`[FINANCE][DAILY-MAINTENANCE] ✓ Found ${sales.length} sales`);

    // STEP 3: Task 1 - Flag overdue sales
    console.log("[FINANCE][DAILY-MAINTENANCE] Task 1: Flagging overdue sales...");

    const overdueSales: Array<{
      sale_id: string;
      sale_reference: string;
      days_overdue: number;
    }> = [];

    for (const sale of sales) {
      const overdueFlags = computeOverdueFlags(sale as SalesRecord);
      if (overdueFlags.is_overdue) {
        overdueSales.push({
          sale_id: sale.id,
          sale_reference: sale.sale_reference || "",
          days_overdue: overdueFlags.days_overdue,
        });
      }
    }

    console.log(`[FINANCE][DAILY-MAINTENANCE] ✓ Task 1 complete - ${overdueSales.length} overdue sales identified`);

    // STEP 4: Task 2 - Generate economics warnings
    console.log("[FINANCE][DAILY-MAINTENANCE] Task 2: Generating economics warnings...");

    const warningsCreated: Array<{
      sale_id: string;
      sale_reference: string;
      warning_type: string;
      message: string;
    }> = [];

    for (const sale of sales) {
      const warnings: Array<{ type: string; message: string }> = [];

      // Warning 1: Negative margin
      const marginMetrics = computeMarginMetrics(sale as SalesRecord);
      if (marginMetrics.margin_percent < 0) {
        warnings.push({
          type: "negative_margin",
          message: `Negative margin detected: ${marginMetrics.margin_percent.toFixed(2)}%`,
        });
      }

      // Warning 2: Suspiciously high margin (>200%)
      if (marginMetrics.margin_percent > 200) {
        warnings.push({
          type: "high_margin",
          message: `Unusually high margin detected: ${marginMetrics.margin_percent.toFixed(2)}%`,
        });
      }

      // Warning 3: Zero sale amount
      if ((sale.sale_amount_inc_vat || 0) === 0) {
        warnings.push({
          type: "zero_sale_amount",
          message: "Sale amount is zero",
        });
      }

      // Warning 4: Buy price exceeds sale amount
      if ((sale.buy_price || 0) > (sale.sale_amount_inc_vat || 0)) {
        warnings.push({
          type: "buy_exceeds_sale",
          message: `Buy price (${sale.buy_price}) exceeds sale amount (${sale.sale_amount_inc_vat})`,
        });
      }

      // Create error records for each warning
      for (const warning of warnings) {
        try {
          await xata().db.Errors.create({
            sale: sale.id,
            error_type: ERROR_TYPES.VALIDATION,
            error_group: ERROR_GROUPS.ECONOMICS_SANITY,
            severity: "medium",
            source: "daily-maintenance",
            message: [warning.message],
            metadata: {
              saleId: sale.id,
              saleReference: sale.sale_reference,
              warningType: warning.type,
              saleAmount: sale.sale_amount_inc_vat,
              buyPrice: sale.buy_price,
              margin: sale.commissionable_margin,
              marginPercent: marginMetrics.margin_percent,
              maintenanceRun: new Date().toISOString(),
            },
            triggered_by: ERROR_TRIGGERED_BY.BACKEND,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });

          warningsCreated.push({
            sale_id: sale.id,
            sale_reference: sale.sale_reference || "",
            warning_type: warning.type,
            message: warning.message,
          });

          console.log(`[FINANCE][DAILY-MAINTENANCE] ⚠️ Warning created for ${sale.sale_reference}: ${warning.type}`);
        } catch (createErr) {
          console.error(`[FINANCE][DAILY-MAINTENANCE] ❌ Failed to create warning for sale ${sale.id}:`, createErr);
        }
      }
    }

    console.log(`[FINANCE][DAILY-MAINTENANCE] ✓ Task 2 complete - ${warningsCreated.length} warnings created`);

    // STEP 5: Task 3 - Recompute authenticity risk
    console.log("[FINANCE][DAILY-MAINTENANCE] Task 3: Recomputing authenticity risk...");

    let authenticityWarningsCreated = 0;

    for (const sale of sales) {
      const authenticityRisk = computeAuthenticityRisk(sale as SalesRecord);

      // Create warning for high-risk items
      if (authenticityRisk === "high_risk") {
        try {
          await xata().db.Errors.create({
            sale: sale.id,
            error_type: ERROR_TYPES.VALIDATION,
            error_group: ERROR_GROUPS.AUTHENTICITY,
            severity: "high",
            source: "daily-maintenance",
            message: ["Authenticity verification not performed - high risk"],
            metadata: {
              saleId: sale.id,
              saleReference: sale.sale_reference,
              authenticityStatus: sale.authenticity_status,
              supplierReceiptAttached: sale.supplier_receipt_attached,
              maintenanceRun: new Date().toISOString(),
            },
            triggered_by: ERROR_TRIGGERED_BY.BACKEND,
            timestamp: new Date(),
            resolved: false,
            resolved_by: null,
            resolved_at: null,
            resolved_notes: null,
          });

          authenticityWarningsCreated++;
          warningsCreated.push({
            sale_id: sale.id,
            sale_reference: sale.sale_reference || "",
            warning_type: "authenticity_high_risk",
            message: "Authenticity verification not performed - high risk",
          });

          console.log(`[FINANCE][DAILY-MAINTENANCE] ⚠️ Authenticity warning created for ${sale.sale_reference}`);
        } catch (createErr) {
          console.error(`[FINANCE][DAILY-MAINTENANCE] ❌ Failed to create authenticity warning for sale ${sale.id}:`, createErr);
        }
      }
    }

    console.log(`[FINANCE][DAILY-MAINTENANCE] ✓ Task 3 complete - ${authenticityWarningsCreated} authenticity warnings created`);

    // STEP 6: Build and return response
    const response: DailyMaintenanceResponse = {
      total_sales: sales.length,
      total_overdue_identified: overdueSales.length,
      total_warnings_created: warningsCreated.length,
      overdue_sales: overdueSales,
      warnings_created: warningsCreated,
    };

    console.log(`[FINANCE][DAILY-MAINTENANCE] ✅ Complete - Auth: ${authMethod}, Overdue: ${overdueSales.length}, Warnings: ${warningsCreated.length}`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[FINANCE][DAILY-MAINTENANCE] ❌ Unexpected error:", error);

    return NextResponse.json(
      {
        error: "Failed to run daily maintenance",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
