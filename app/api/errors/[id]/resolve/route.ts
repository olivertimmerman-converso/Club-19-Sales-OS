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
// POST HANDLER
// ============================================================================

interface ResolveErrorRequest {
  adminEmail: string;
  notes?: string;
  clearSaleErrorFlag?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: errorId } = await params;

  logger.info("ERRORS", "POST request for error resolution", { errorId });

  // STEP 0: Rate limiting
  const rateLimitResponse = withRateLimit(req, RATE_LIMITS.errors);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // STEP 1: Check authentication and authorization
    const { userId } = await auth();
    if (!userId) {
      logger.error("ERRORS", "Unauthorized - no userId");
      return NextResponse.json(
        { error: "Unauthorized", message: "Please sign in" },
        { status: 401 }
      );
    }

    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin")) {
      logger.error("ERRORS", "Forbidden - insufficient permissions", { role });
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    logger.info("ERRORS", "Authorized for error resolution", { role });

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

    logger.info("ERRORS", "Error resolution request details", {
      adminEmail,
      shouldClearFlag
    });

    // STEP 2: Fetch the error to get the sale ID
    const error = await xata().db.Errors.read(errorId);

    if (!error) {
      logger.error("ERRORS", "Error record not found", { errorId });
      return NextResponse.json({ error: "Error not found" }, { status: 404 });
    }

    const saleId = error.sale?.id;

    // STEP 3: Resolve the error
    const resolveResult = await resolveError(errorId, adminEmail, notes);

    if (!resolveResult.success) {
      logger.error("ERRORS", "Failed to resolve error", {
        errorId,
        error: resolveResult.error
      });
      return NextResponse.json(
        { error: resolveResult.error },
        { status: 500 }
      );
    }

    logger.info("ERRORS", "Error resolved successfully", { errorId });

    // STEP 4: Optionally clear sale error flag
    if (shouldClearFlag && saleId) {
      const clearResult = await clearSaleErrorFlag(saleId);

      if (!clearResult.success) {
        logger.warn("ERRORS", "Failed to clear sale error flag", {
          saleId,
          error: clearResult.error
        });
        // Don't fail the request if clearing flag fails
        return NextResponse.json({
          success: true,
          message: "Error resolved but failed to clear sale error flag",
          errorCleared: false,
          details: clearResult.error,
        });
      }

      logger.info("ERRORS", "Sale error flag cleared", { saleId });

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
    logger.error("ERRORS", "Failed to resolve error", {
      error,
      message: error.message
    });

    return NextResponse.json(
      {
        error: "Failed to resolve error",
        details: error.message || error,
      },
      { status: 500 }
    );
  }
}
