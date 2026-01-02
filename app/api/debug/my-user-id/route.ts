/**
 * Debug endpoint to get current user's Clerk ID
 *
 * Usage: Navigate to /api/debug/my-user-id while logged in
 * Copy the user ID and set it as XERO_SYSTEM_USER_ID in .env.local
 */

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import * as logger from "@/lib/logger";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({
        error: "Not authenticated",
        message: "Please sign in first",
      }, { status: 401 });
    }

    // Get user details
    const user = await clerkClient.users.getUser(userId);

    return NextResponse.json({
      userId,
      email: user.emailAddresses[0]?.emailAddress,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      message: "Copy this userId and set it as XERO_SYSTEM_USER_ID in your .env.local file",
    });
  } catch (error) {
    logger.error("DEBUG", "Failed to get user ID", { error: error as any });
    return NextResponse.json({
      error: "Failed to get user ID",
    }, { status: 500 });
  }
}
