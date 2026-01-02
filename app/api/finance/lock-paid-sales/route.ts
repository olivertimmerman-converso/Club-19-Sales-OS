/**
 * Club 19 Sales OS - Lock Paid Sales API
 *
 * POST /api/finance/lock-paid-sales
 * End-of-month commission lock tool
 *
 * Transitions all sales from "paid" → "locked"
 * Admin/Finance/Superadmin only endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { transitionSaleStatus } from "@/lib/deal-lifecycle";
import { ERROR_TYPES, ERROR_TRIGGERED_BY, ERROR_GROUPS } from "@/lib/error-types";
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

interface LockResult {
  sale_id: string;
  sale_reference: string;
  status: "locked" | "failed";
  error?: string;
}

interface LockPaidSalesResponse {
  total_paid: number;
  total_locked: number;
  total_failed: number;
  results: LockResult[];
}

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  logger.info("FINANCE", "POST request received - lock paid sales");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      logger.error("FINANCE", "Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      logger.error("FINANCE", "Forbidden - insufficient permissions", { role });
      return NextResponse.json(
        { error: "Forbidden", message: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    // Get current user for audit trail
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const adminUserEmail = user.emailAddresses[0]?.emailAddress || "unknown@system.local";

    logger.info("FINANCE", "Authorized", { role, email: adminUserEmail });

    // STEP 2: Fetch all sales with status = "paid"
    logger.info("FINANCE", "Fetching paid sales...");

    const paidSales = await xata()
      .db.Sales.filter({ status: "paid" })
      .select(["id", "sale_reference", "status"])
      .getMany();

    logger.info("FINANCE", `Found ${paidSales.length} paid sales`);

    if (paidSales.length === 0) {
      logger.info("FINANCE", "No paid sales to lock");
      return NextResponse.json({
        total_paid: 0,
        total_locked: 0,
        total_failed: 0,
        results: [],
      });
    }

    // STEP 3: Transition each sale from "paid" → "locked"
    logger.info("FINANCE", "Processing transitions...");

    const results: LockResult[] = [];
    let total_locked = 0;
    let total_failed = 0;

    for (const sale of paidSales) {
      try {
        logger.info("FINANCE", "Processing sale", { saleId: sale.id, saleReference: sale.sale_reference });

        const transitionResult = await transitionSaleStatus({
          saleId: sale.id,
          currentStatus: "paid",
          nextStatus: "locked",
          adminUserEmail,
        });

        if (transitionResult.success) {
          total_locked++;
          results.push({
            sale_id: sale.id,
            sale_reference: sale.sale_reference || "",
            status: "locked",
          });
          logger.info("FINANCE", "Sale locked", { saleReference: sale.sale_reference });
        } else {
          total_failed++;
          results.push({
            sale_id: sale.id,
            sale_reference: sale.sale_reference || "",
            status: "failed",
            error: transitionResult.error || "Unknown error",
          });
          logger.error("FINANCE", "Failed to lock sale", {
            saleReference: sale.sale_reference,
            error: transitionResult.error
          });

          // Log error to Errors table
          try {
            await xata().db.Errors.create({
              sale: sale.id,
              error_type: ERROR_TYPES.LIFECYCLE,
              error_group: ERROR_GROUPS.PAYMENT_LIFECYCLE,
              severity: "high",
              source: "lock-paid-sales",
              message: [transitionResult.error || "Failed to lock paid sale"],
              metadata: {
                saleId: sale.id,
                saleReference: sale.sale_reference,
                attemptedTransition: "paid -> locked",
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
            logger.error("FINANCE", "Failed to log error", { saleId: sale.id, error: logErr as any });
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
        logger.error("FINANCE", "Exception processing sale", { saleId: sale.id, error: saleErr });
      }
    }

    // STEP 4: Return response
    const response: LockPaidSalesResponse = {
      total_paid: paidSales.length,
      total_locked,
      total_failed,
      results,
    };

    logger.info("FINANCE", "Complete - lock paid sales", {
      locked: total_locked,
      failed: total_failed
    });

    return NextResponse.json(response);
  } catch (error: any) {
    logger.error("FINANCE", "Unexpected error", { error });

    return NextResponse.json(
      {
        error: "Failed to lock paid sales",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
