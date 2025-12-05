/**
 * Club 19 Sales OS - Error Resolution API
 *
 * POST /api/errors/[id]/resolve
 * Resolve an error and optionally clear sale error flag
 *
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveError, clearSaleErrorFlag } from "@/lib/error-tools";
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
// POST HANDLER
// ============================================================================

interface ResolveErrorRequest {
  adminEmail: string;
  notes?: string;
  clearSaleErrorFlag?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const errorId = params.id;

  console.log(`[ERROR RESOLUTION API] POST request for error ${errorId}`);

  // STEP 0: Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.errors);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      console.error("[ERROR RESOLUTION API] ❌ Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin")) {
      console.error(`[ERROR RESOLUTION API] ❌ Forbidden - insufficient permissions (role: ${role})`);
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    console.log(`[ERROR RESOLUTION API] ✓ Authorized (role: ${role})`);

    // STEP 2: Parse request body
    const body: ResolveErrorRequest = await req.json();

    const { adminEmail, notes, clearSaleErrorFlag: shouldClearFlag } = body;

    // Validate required fields
    if (!adminEmail || adminEmail.trim() === "") {
      return NextResponse.json(
        { error: "adminEmail is required" },
        { status: 400 }
      );
    }

    console.log(
      `[ERROR RESOLUTION API] Admin: ${adminEmail}, Clear flag: ${shouldClearFlag}`
    );

    // STEP 2: Fetch the error to get the sale ID
    const error = await xata().db.Errors.read(errorId);

    if (!error) {
      console.error(`[ERROR RESOLUTION API] ❌ Error ${errorId} not found`);
      return NextResponse.json({ error: "Error not found" }, { status: 404 });
    }

    const saleId = error.sale?.id;

    // STEP 3: Resolve the error
    const resolveResult = await resolveError(errorId, adminEmail, notes);

    if (!resolveResult.success) {
      console.error(
        `[ERROR RESOLUTION API] ❌ Failed to resolve error: ${resolveResult.error}`
      );
      return NextResponse.json(
        { error: resolveResult.error },
        { status: 500 }
      );
    }

    console.log(`[ERROR RESOLUTION API] ✅ Error ${errorId} resolved`);

    // STEP 4: Optionally clear sale error flag
    if (shouldClearFlag && saleId) {
      const clearResult = await clearSaleErrorFlag(saleId);

      if (!clearResult.success) {
        console.warn(
          `[ERROR RESOLUTION API] ⚠️ Failed to clear sale error flag: ${clearResult.error}`
        );
        // Don't fail the request if clearing flag fails
        return NextResponse.json({
          success: true,
          message: "Error resolved but failed to clear sale error flag",
          errorCleared: false,
          details: clearResult.error,
        });
      }

      console.log(
        `[ERROR RESOLUTION API] ✅ Sale ${saleId} error flag cleared`
      );

      return NextResponse.json({
        success: true,
        message: "Error resolved and sale error flag cleared",
        errorCleared: true,
      });
    }

    // STEP 5: Return success
    return NextResponse.json({
      success: true,
      message: "Error resolved",
      errorCleared: false,
    });
  } catch (error: any) {
    console.error("[ERROR RESOLUTION API] ❌ Failed to resolve error:", error);

    return NextResponse.json(
      {
        error: "Failed to resolve error",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
