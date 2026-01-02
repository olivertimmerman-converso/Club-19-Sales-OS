import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { hasXeroConnection } from "@/lib/xero-auth";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/xero/status
 * Check if current user has Xero connected
 * Lightweight check without calling Xero API
 *
 * Accessible by: admin, finance, superadmin
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { connected: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check role authorization
    const role = await getUserRole();
    if (!role || (role !== "admin" && role !== "superadmin" && role !== "finance")) {
      logger.error("XERO_STATUS", "Forbidden - insufficient permissions", { role });
      return NextResponse.json(
        { connected: false, error: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    logger.info("XERO_STATUS", "Checking connection", { userId, role });
    const connected = await hasXeroConnection(userId);
    logger.info("XERO_STATUS", "Connection status checked", { userId, connected });

    return NextResponse.json({ connected });
  } catch (error: any) {
    logger.error("XERO_STATUS", "Error checking status", { error });
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 500 }
    );
  }
}
