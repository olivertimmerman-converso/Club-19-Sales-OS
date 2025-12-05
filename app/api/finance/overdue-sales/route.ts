/**
 * Club 19 Sales OS - Overdue Sales API
 *
 * GET /api/finance/overdue-sales
 * Lists sales past their invoice_due_date with key financial details
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
} from "@/lib/sales-summary-helpers";

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

interface ErrorSummary {
  error_id: string;
  error_type: string;
  error_group: string;
  severity: string;
  message: string[];
}

interface OverdueSale {
  sale_id: string;
  sale_reference: string;
  buyer_name: string;
  shopper_name: string;
  sale_amount_inc_vat: number;
  invoice_due_date: Date | null | undefined;
  days_overdue: number;
  isPaid: boolean;
  status: string;
  errors: ErrorSummary[];
}

interface OverdueSalesResponse {
  total_overdue: number;
  overdue_sales: OverdueSale[];
}

// ============================================================================
// GET HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  console.log("[FINANCE][OVERDUE-SALES] GET request received");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      console.error("[FINANCE][OVERDUE-SALES] ❌ Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      console.error(`[FINANCE][OVERDUE-SALES] ❌ Forbidden - insufficient permissions (role: ${role})`);
      return NextResponse.json(
        { error: "Forbidden", message: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    console.log(`[FINANCE][OVERDUE-SALES] ✓ Authorized (role: ${role})`);

    // STEP 2: Fetch all sales with required fields
    console.log("[FINANCE][OVERDUE-SALES] Fetching sales...");

    const sales = await xata()
      .db.Sales.select([
        "id",
        "sale_reference",
        "status",
        "buyer_name",
        "shopper_name",
        "sale_amount_inc_vat",
        "invoice_due_date",
      ])
      .getMany();

    console.log(`[FINANCE][OVERDUE-SALES] ✓ Found ${sales.length} sales`);

    // STEP 3: Filter for overdue sales and compute flags
    console.log("[FINANCE][OVERDUE-SALES] Computing overdue flags...");

    const overdueSales: OverdueSale[] = [];

    for (const sale of sales) {
      const paymentFlags = computePaymentFlags(sale as SalesRecord);
      const overdueFlags = computeOverdueFlags(sale as SalesRecord);

      // Only include sales that are overdue
      if (overdueFlags.is_overdue) {
        overdueSales.push({
          sale_id: sale.id,
          sale_reference: sale.sale_reference || "",
          buyer_name: sale.buyer_name || "",
          shopper_name: sale.shopper_name || "",
          sale_amount_inc_vat: sale.sale_amount_inc_vat || 0,
          invoice_due_date: sale.invoice_due_date,
          days_overdue: overdueFlags.days_overdue,
          isPaid: paymentFlags.isPaid,
          status: sale.status || "",
          errors: [], // Will populate in next step
        });
      }
    }

    console.log(`[FINANCE][OVERDUE-SALES] ✓ Found ${overdueSales.length} overdue sales`);

    // STEP 4: Fetch errors for overdue sales
    if (overdueSales.length > 0) {
      console.log("[FINANCE][OVERDUE-SALES] Fetching errors for overdue sales...");

      const overdueSaleIds = overdueSales.map((s) => s.sale_id);

      const errors = await xata()
        .db.Errors.filter({
          "sale.id": { $any: overdueSaleIds },
        })
        .select([
          "id",
          "sale.id",
          "error_type",
          "error_group",
          "severity",
          "message",
        ])
        .getMany();

      console.log(`[FINANCE][OVERDUE-SALES] ✓ Found ${errors.length} errors`);

      // Group errors by sale_id
      const errorsBySale = new Map<string, any[]>();
      for (const error of errors) {
        const saleId = error.sale?.id;
        if (!saleId) continue;

        if (!errorsBySale.has(saleId)) {
          errorsBySale.set(saleId, []);
        }
        errorsBySale.get(saleId)!.push(error);
      }

      // Attach errors to overdue sales
      for (const sale of overdueSales) {
        const saleErrors = errorsBySale.get(sale.sale_id) || [];
        sale.errors = saleErrors.map((err) => ({
          error_id: err.id,
          error_type: err.error_type || "",
          error_group: err.error_group || "",
          severity: err.severity || "",
          message: err.message || [],
        }));
      }
    }

    // STEP 5: Return response
    const response: OverdueSalesResponse = {
      total_overdue: overdueSales.length,
      overdue_sales: overdueSales,
    };

    console.log(`[FINANCE][OVERDUE-SALES] ✅ Returning ${overdueSales.length} overdue sales`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[FINANCE][OVERDUE-SALES] ❌ Failed to fetch overdue sales:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch overdue sales",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
