/**
 * Club 19 Sales OS - Errors API
 *
 * GET /api/errors
 * Fetch errors with optional filters
 *
 * Admin-only endpoint for error management
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/auth";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

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
// GET HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  console.log("[ERRORS API] GET request received");

  // STEP 0: Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.errors);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      console.error("[ERRORS API] ❌ Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      console.error(`[ERRORS API] ❌ Forbidden - insufficient permissions (role: ${role})`);
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    console.log(`[ERRORS API] ✓ Authorized (role: ${role})`);

    // STEP 2: Parse query parameters
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type");
    const severity = searchParams.get("severity");
    const saleId = searchParams.get("saleId");
    const resolved = searchParams.get("resolved");
    const triggeredBy = searchParams.get("triggeredBy");

    console.log("[ERRORS API] Filters:", {
      type,
      severity,
      saleId,
      resolved,
      triggeredBy,
    });

    // STEP 2: Build query with filters
    let query = xata().db.Errors.select([
      "id",
      "sale.id",
      "sale.sale_reference",
      "sale.brand",
      "sale.category",
      "error_type",
      "severity",
      "source",
      "message",
      "metadata",
      "triggered_by",
      "timestamp",
      "resolved",
      "resolved_by",
      "resolved_at",
      "resolved_notes",
    ]);

    // Apply filters
    const filters: any = {};

    if (type) {
      filters.error_type = type;
    }

    if (severity) {
      filters.severity = severity;
    }

    if (saleId) {
      filters["sale.id"] = saleId;
    }

    if (resolved !== null && resolved !== undefined) {
      filters.resolved = resolved === "true";
    }

    if (triggeredBy) {
      filters.triggered_by = triggeredBy;
    }

    // Apply filters if any exist
    if (Object.keys(filters).length > 0) {
      query = query.filter(filters);
    }

    // STEP 3: Fetch errors
    const errors = await query.sort("timestamp", "desc").getMany();

    console.log(`[ERRORS API] ✅ Found ${errors.length} errors`);

    // STEP 4: Return response
    return NextResponse.json({
      errors,
      count: errors.length,
    });
  } catch (error: any) {
    console.error("[ERRORS API] ❌ Failed to fetch errors:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch errors",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
