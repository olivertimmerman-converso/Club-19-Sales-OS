import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { hasXeroConnection } from "@/lib/xero-auth";

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
      console.error(`[XERO STATUS] ❌ Forbidden - insufficient permissions (role: ${role})`);
      return NextResponse.json(
        { connected: false, error: "Admin/Finance access required" },
        { status: 403 }
      );
    }

    console.log(`[XERO STATUS] Checking connection for user: ${userId} (role: ${role})`);
    const connected = await hasXeroConnection(userId);
    console.log(`[XERO STATUS] User ${userId} connected: ${connected}`);

    return NextResponse.json({ connected });
  } catch (error: any) {
    console.error("[XERO STATUS] Error:", error);
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 500 }
    );
  }
}
