/**
 * Club 19 Sales OS - Server-Side Role Resolution
 *
 * Server-side helper to get user role from Clerk
 *
 * IMPORTANT: This module uses server-only APIs and should ONLY be imported
 * from Server Components, Server Actions, and API routes.
 *
 * For client components or middleware, import from lib/roleUtils.ts instead.
 */

import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  type Role,
  LEGACY_ALLOWED_ROLES,
  resolveUserRoleFromMetadata
} from "./roleUtils";

/**
 * Get the current user's role from Clerk metadata
 * Server-side only - uses clerkClient()
 *
 * Includes comprehensive error handling and debug logging
 *
 * @returns Role - User's role (defaults to "shopper" if not set)
 */
export async function getUserRole(): Promise<Role> {
  console.log("[getUserRole] 🔍 Starting role resolution");

  try {
    console.log("[getUserRole] 🔐 Calling Clerk auth()");
    const { userId } = await auth();
    console.log(`[getUserRole] 📋 UserId from auth: ${userId || "(none)"}`);

    if (!userId) {
      console.log("[getUserRole] ⚠️  No userId found - returning 'shopper' (unauthenticated)");
      return "shopper";
    }

    console.log("[getUserRole] 📡 Fetching user metadata from Clerk");
    const user = await (await clerkClient()).users.getUser(userId);
    console.log("[getUserRole] ✅ User metadata retrieved");

    const metadata = user?.publicMetadata as { role?: Role; staffRole?: Role } | undefined;
    console.log("[getUserRole] 📦 Metadata:", JSON.stringify(metadata, null, 2));

    // Use unified resolver
    const resolvedRole = resolveUserRoleFromMetadata(metadata);
    console.log(`[getUserRole] ✅ Final resolved role: "${resolvedRole}"`);

    return resolvedRole;
  } catch (error) {
    console.error("[getUserRole] ❌ Error fetching user role:", error);
    console.error("[getUserRole] 📊 Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    console.log("[getUserRole] 🔄 Falling back to 'shopper' role due to error");
    return "shopper";
  }
}

/**
 * Assert that a user role has access to legacy dashboards
 * Redirects to /unauthorised if access denied
 *
 * Server-side only - uses Next.js redirect()
 *
 * @param role - User's role to check
 */
export function assertLegacyAccess(role: Role): void {
  console.log(`[assertLegacyAccess] 🔐 Checking access for role: "${role}"`);
  console.log(`[assertLegacyAccess] 📋 Allowed roles:`, LEGACY_ALLOWED_ROLES);

  if (!LEGACY_ALLOWED_ROLES.includes(role as any)) {
    console.error(`[assertLegacyAccess] ❌ Access DENIED - Role "${role}" not in allowed roles`);
    console.error(`[assertLegacyAccess] 🚫 Redirecting to /unauthorised`);
    redirect("/unauthorised");
  }

  console.log(`[assertLegacyAccess] ✅ Access GRANTED for role: "${role}"`);
}
