/**
 * Club 19 Sales OS - Error Groups API
 *
 * GET /api/errors/groups
 * Returns error summaries grouped by type, group, and severity
 *
 * Admin/Finance/Superadmin only endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
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
// TYPE DEFINITIONS
// ============================================================================

interface ErrorGroupsSummary {
  total_errors: number;
  unresolved_errors: number;
  errors_by_type: Record<string, number>;
  errors_by_group: Record<string, number>;
  errors_by_severity: Record<string, number>;
}

// ============================================================================
// GET HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  console.log("[ERROR GROUPS API] GET request received");

  // Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.general);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      console.error("[ERROR GROUPS API] ❌ Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      console.error(`[ERROR GROUPS API] ❌ Forbidden - insufficient permissions (role: ${role})`);
      return NextResponse.json(
        { error: "Forbidden", message: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    console.log(`[ERROR GROUPS API] ✓ Authorized (role: ${role})`);

    // STEP 2: Fetch all errors with minimal fields
    console.log("[ERROR GROUPS API] Fetching errors...");

    const errors = await xata()
      .db.Errors.select(["id", "error_type", "error_group", "severity", "resolved"])
      .getMany();

    console.log(`[ERROR GROUPS API] ✓ Found ${errors.length} errors`);

    // STEP 3: Compute summaries
    let total_errors = errors.length;
    let unresolved_errors = 0;
    const errors_by_type: Record<string, number> = {};
    const errors_by_group: Record<string, number> = {};
    const errors_by_severity: Record<string, number> = {};

    for (const error of errors) {
      // Count unresolved
      if (!error.resolved) {
        unresolved_errors++;
      }

      // Group by type
      const type = error.error_type || "unknown";
      errors_by_type[type] = (errors_by_type[type] || 0) + 1;

      // Group by group
      const group = error.error_group || "unknown";
      errors_by_group[group] = (errors_by_group[group] || 0) + 1;

      // Group by severity
      const severity = error.severity || "unknown";
      errors_by_severity[severity] = (errors_by_severity[severity] || 0) + 1;
    }

    // STEP 4: Build response
    const summary: ErrorGroupsSummary = {
      total_errors,
      unresolved_errors,
      errors_by_type,
      errors_by_group,
      errors_by_severity,
    };

    console.log(`[ERROR GROUPS API] ✅ Computed error groups summary`);

    // STEP 5: Return response
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[ERROR GROUPS API] ❌ Failed to fetch error groups:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch error groups",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
