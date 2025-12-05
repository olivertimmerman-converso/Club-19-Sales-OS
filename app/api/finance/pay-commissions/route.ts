/**
 * Club 19 Sales OS - Pay Commissions API
 *
 * POST /api/finance/pay-commissions
 * Final commission lifecycle step - transitions locked sales to commission_paid
 *
 * Admin/Finance/Superadmin only endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { transitionSaleStatus } from "@/lib/deal-lifecycle";
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

interface PayCommissionResult {
  sale_id: string;
  sale_reference: string;
  status: "commission_paid" | "failed";
  error?: string;
}

interface PayCommissionsResponse {
  total_locked: number;
  total_commission_paid: number;
  total_failed: number;
  results: PayCommissionResult[];
}

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  console.log("[FINANCE][PAY-COMMISSIONS] POST request received");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      console.error("[FINANCE][PAY-COMMISSIONS] ❌ Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      console.error(`[FINANCE][PAY-COMMISSIONS] ❌ Forbidden - insufficient permissions (role: ${role})`);
      return NextResponse.json(
        { error: "Forbidden", message: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    // Get current user for audit trail
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const adminUserEmail = user.emailAddresses[0]?.emailAddress || "unknown@system.local";

    console.log(`[FINANCE][PAY-COMMISSIONS] ✓ Authorized (role: ${role}, email: ${adminUserEmail})`);

    // STEP 2: Fetch all sales with status = "locked"
    console.log("[FINANCE][PAY-COMMISSIONS] Fetching locked sales...");

    const lockedSales = await xata()
      .db.Sales.filter({ status: "locked" })
      .select(["id", "sale_reference", "status"])
      .getMany();

    console.log(`[FINANCE][PAY-COMMISSIONS] ✓ Found ${lockedSales.length} locked sales`);

    if (lockedSales.length === 0) {
      console.log("[FINANCE][PAY-COMMISSIONS] ✅ No locked sales to process");
      return NextResponse.json({
        total_locked: 0,
        total_commission_paid: 0,
        total_failed: 0,
        results: [],
      });
    }

    // STEP 3: Transition each sale from "locked" → "commission_paid"
    console.log("[FINANCE][PAY-COMMISSIONS] Processing transitions...");

    const results: PayCommissionResult[] = [];
    let total_commission_paid = 0;
    let total_failed = 0;

    for (const sale of lockedSales) {
      try {
        console.log(`[FINANCE][PAY-COMMISSIONS] Processing sale: ${sale.id} (${sale.sale_reference})`);

        const transitionResult = await transitionSaleStatus({
          saleId: sale.id,
          currentStatus: "locked",
          nextStatus: "commission_paid",
          adminUserEmail,
        });

        if (transitionResult.success) {
          total_commission_paid++;
          results.push({
            sale_id: sale.id,
            sale_reference: sale.sale_reference || "",
            status: "commission_paid",
          });
          console.log(`[FINANCE][PAY-COMMISSIONS] ✓ Commission paid: ${sale.sale_reference}`);
        } else {
          total_failed++;
          results.push({
            sale_id: sale.id,
            sale_reference: sale.sale_reference || "",
            status: "failed",
            error: transitionResult.error || "Unknown error",
          });
          console.error(`[FINANCE][PAY-COMMISSIONS] ❌ Failed: ${sale.sale_reference} - ${transitionResult.error}`);

          // Log error to Errors table
          try {
            await xata().db.Errors.create({
              sale: sale.id,
              error_type: ERROR_TYPES.LIFECYCLE,
              error_group: ERROR_GROUPS.PAYMENT_LIFECYCLE,
              severity: "high",
              source: "pay-commissions",
              message: [transitionResult.error || "Failed to pay commission"],
              metadata: {
                saleId: sale.id,
                saleReference: sale.sale_reference,
                attemptedTransition: "locked -> commission_paid",
                adminUserEmail,
              },
              triggered_by: ERROR_TRIGGERED_BY.BACKEND,
              timestamp: new Date(),
              resolved: false,
              resolved_by: null,
              resolved_at: null,
              resolved_notes: null,
            });
          } catch (logErr) {
            console.error(`[FINANCE][PAY-COMMISSIONS] ❌ Failed to log error for sale ${sale.id}:`, logErr);
          }
        }
      } catch (saleErr: any) {
        total_failed++;
        results.push({
          sale_id: sale.id,
          sale_reference: sale.sale_reference || "",
          status: "failed",
          error: saleErr.message || "Unexpected error",
        });
        console.error(`[FINANCE][PAY-COMMISSIONS] ❌ Exception for sale ${sale.id}:`, saleErr);
      }
    }

    // STEP 4: Return response
    const response: PayCommissionsResponse = {
      total_locked: lockedSales.length,
      total_commission_paid,
      total_failed,
      results,
    };

    console.log(`[FINANCE][PAY-COMMISSIONS] ✅ Complete - Commission Paid: ${total_commission_paid}, Failed: ${total_failed}`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[FINANCE][PAY-COMMISSIONS] ❌ Unexpected error:", error);

    return NextResponse.json(
      {
        error: "Failed to pay commissions",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
