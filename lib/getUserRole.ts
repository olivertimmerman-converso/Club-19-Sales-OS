/**
 * Club 19 Sales OS - Server-Side Role Resolution
 *
 * Production-ready role resolution for SSR
 * NEVER crashes - always returns a valid StaffRole
 */

import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { type StaffRole, isValidStaffRole, getDefaultRole } from "./permissions";

/**
 * Get the current user's staff role from Clerk metadata
 *
 * SSR-safe - uses Clerk server APIs only
 * Never throws - always returns a valid StaffRole
 * Defaults to "shopper" on any error
 *
 * @returns StaffRole - User's role (defaults to "shopper")
 */
export async function getUserRole(): Promise<StaffRole> {
  console.log("[getUserRole] 🔍 Starting SSR-safe role resolution");

  try {
    // Get userId from Clerk auth() - SSR optimized
    console.log("[getUserRole] 🔐 Calling Clerk auth()");
    const { userId } = await auth();
    console.log(`[getUserRole] 📋 UserId: ${userId || "(none)"}`);

    // No userId = unauthenticated = shopper
    if (!userId) {
      console.log("[getUserRole] ⚠️  No userId - returning 'shopper' (unauthenticated)");
      return getDefaultRole();
    }

    // Fetch user from Clerk - SSR-safe
    console.log("[getUserRole] 📡 Fetching user from Clerk");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    console.log("[getUserRole] ✅ User fetched successfully");

    // Extract staffRole from publicMetadata (CANONICAL SOURCE)
    const metadata = user?.publicMetadata as { staffRole?: string } | undefined;
    console.log("[getUserRole] 📦 Metadata:", JSON.stringify(metadata, null, 2));

    const rawRole = metadata?.staffRole;
    console.log(`[getUserRole] 📋 Raw staffRole from metadata: "${rawRole}"`);

    // Validate and return
    if (rawRole && isValidStaffRole(rawRole)) {
      console.log(`[getUserRole] ✅ Valid role resolved: "${rawRole}"`);
      return rawRole;
    }

    // Invalid or missing role = default to shopper
    console.log(`[getUserRole] ⚠️  Invalid or missing staffRole - defaulting to "shopper"`);
    return getDefaultRole();

  } catch (error) {
    // NEVER crash the page - log and return default
    console.error("[getUserRole] ❌ Error fetching user role:", error);
    console.error("[getUserRole] 📊 Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined
    });
    console.log("[getUserRole] 🔄 Falling back to 'shopper' due to error");
    return getDefaultRole();
  }
}
