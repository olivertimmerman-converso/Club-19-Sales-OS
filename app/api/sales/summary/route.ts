/**
 * Club 19 Sales OS - Sales Summary API
 *
 * GET /api/sales/summary
 * Returns complete sales data with computed flags, errors, and analytics
 *
 * Admin/Finance/Superadmin only endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import type { SalesRecord, ErrorsRecord } from "@/src/xata";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  computePaymentFlags,
  computeOverdueFlags,
  computeMarginMetrics,
  computeAuthenticityRisk,
  type AuthenticityRisk,
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

interface ErrorRecord {
  id: string;
  error_type: string;
  error_group: string;
  severity: string;
  source: string;
  message: string[];
  metadata: Record<string, unknown>;
  triggered_by: string;
  timestamp: Date;
  resolved: boolean;
}

interface SaleSummary {
  sale_id: string;
  sale_reference: string;

  // Parties
  buyer_name: string;
  supplier_name: string;
  shopper_name: string;
  introducer_name: string;

  // Classification
  buyer_type: string;
  authenticity_status: string;
  authenticity_risk: AuthenticityRisk;
  supplier_receipt_attached: boolean;

  // Status & Lifecycle
  status: string;
  isPaid: boolean;
  isLocked: boolean;
  canLock: boolean;
  canPayCommission: boolean;

  // Dates
  invoice_due_date: Date | null | undefined;
  xero_payment_date: Date | null | undefined;
  is_overdue: boolean;
  days_overdue: number;

  // Economics
  sale_amount_inc_vat: number;
  buy_price: number;
  commissionable_margin: number;
  commission_amount: number;
  margin_percent: number;

  // Errors
  errors: ErrorRecord[];
  warnings: ErrorRecord[];
  error_groups: Record<string, number>;
}

// ============================================================================
// GET HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  logger.info("SALES_SUMMARY", "GET request received");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      logger.error("SALES_SUMMARY", "Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      logger.error("SALES_SUMMARY", "Forbidden - insufficient permissions", { role });
      return NextResponse.json(
        { error: "Forbidden", message: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    logger.info("SALES_SUMMARY", "Authorized", { role });

    // STEP 2: Fetch all sales with required fields
    logger.info("SALES_SUMMARY", "Fetching sales...");

    const sales = await xata()
      .db.Sales.select([
        "id",
        "sale_reference",
        "status",
        "buyer_name",
        "supplier_name",
        "shopper_name",
        "introducer_name",
        "buyer_type",
        "authenticity_status",
        "supplier_receipt_attached",
        "invoice_due_date",
        "xero_payment_date",
        "commission_amount",
        "commission_split_introducer",
        "commission_split_shopper",
        "commissionable_margin",
        "sale_amount_inc_vat",
        "buy_price",
        "error_flag",
        "error_message",
      ])
      .sort("sale_date", "desc")
      .getMany();

    logger.info("SALES_SUMMARY", "Found sales", { count: sales.length });

    // STEP 3: Fetch all errors (we'll group by sale_id)
    logger.info("SALES_SUMMARY", "Fetching errors...");

    const allErrors = await xata()
      .db.Errors.select([
        "id",
        "sale.id",
        "error_type",
        "error_group",
        "severity",
        "source",
        "message",
        "metadata",
        "triggered_by",
        "timestamp",
        "resolved",
      ])
      .getMany();

    logger.info("SALES_SUMMARY", "Found errors", { count: allErrors.length });

    // Group errors by sale ID (using any to avoid Xata SelectedPick complexity)
    const errorsBySale = new Map<string, any[]>();
    for (const error of allErrors) {
      const saleId = error.sale?.id;
      if (!saleId) continue;

      if (!errorsBySale.has(saleId)) {
        errorsBySale.set(saleId, []);
      }
      errorsBySale.get(saleId)!.push(error);
    }

    // STEP 4: Transform sales into summary format
    logger.info("SALES_SUMMARY", "Computing derived fields...");

    const summaries: SaleSummary[] = sales.map((sale) => {
      // Compute flags
      const paymentFlags = computePaymentFlags(sale as SalesRecord);
      const overdueFlags = computeOverdueFlags(sale as SalesRecord);
      const marginMetrics = computeMarginMetrics(sale as SalesRecord);
      const authenticityRisk = computeAuthenticityRisk(sale as SalesRecord);

      // Get errors for this sale
      const saleErrors = errorsBySale.get(sale.id) || [];

      // Separate errors and warnings
      const errors: ErrorRecord[] = [];
      const warnings: ErrorRecord[] = [];

      for (const err of saleErrors) {
        const errorRecord: ErrorRecord = {
          id: err.id,
          error_type: err.error_type || "",
          error_group: err.error_group || "",
          severity: err.severity || "",
          source: err.source || "",
          message: err.message || [],
          metadata: err.metadata || {},
          triggered_by: err.triggered_by || "",
          timestamp: err.timestamp || new Date(),
          resolved: err.resolved || false,
        };

        // Classify as error or warning based on severity
        const severity = err.severity || "";
        if (severity === "low" || severity === "medium") {
          warnings.push(errorRecord);
        } else {
          errors.push(errorRecord);
        }
      }

      // Count errors by group
      const error_groups: Record<string, number> = {};
      for (const err of saleErrors) {
        const group = err.error_group || "unknown";
        error_groups[group] = (error_groups[group] || 0) + 1;
      }

      return {
        sale_id: sale.id,
        sale_reference: sale.sale_reference || "",

        // Parties
        buyer_name: sale.buyer_name || "",
        supplier_name: sale.supplier_name || "",
        shopper_name: sale.shopper_name || "",
        introducer_name: sale.introducer_name || "",

        // Classification
        buyer_type: sale.buyer_type || "",
        authenticity_status: sale.authenticity_status || "not_verified",
        authenticity_risk: authenticityRisk,
        supplier_receipt_attached: sale.supplier_receipt_attached || false,

        // Status & Lifecycle
        status: sale.status || "",
        ...paymentFlags,

        // Dates
        invoice_due_date: sale.invoice_due_date,
        xero_payment_date: sale.xero_payment_date,
        ...overdueFlags,

        // Economics
        sale_amount_inc_vat: sale.sale_amount_inc_vat || 0,
        buy_price: sale.buy_price || 0,
        commissionable_margin: sale.commissionable_margin || 0,
        commission_amount: sale.commission_amount || 0,
        ...marginMetrics,

        // Errors
        errors,
        warnings,
        error_groups,
      };
    });

    logger.info("SALES_SUMMARY", "Returning sale summaries", { count: summaries.length });

    // STEP 5: Return response
    return NextResponse.json({
      sales: summaries,
      count: summaries.length,
    });
  } catch (error: any) {
    logger.error("SALES_SUMMARY", "Failed to fetch sales summary", { error });

    return NextResponse.json(
      {
        error: "Failed to fetch sales summary",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
