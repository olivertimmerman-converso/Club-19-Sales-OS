/**
 * Club 19 Sales OS - Server-Side Role Resolution
 *
 * Production-ready role resolution for SSR
 * NEVER crashes - always returns a valid StaffRole
 */

import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { type StaffRole, isValidStaffRole, getDefaultRole } from "./permissions";
import * as logger from "./logger";

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
  logger.info("AUTH", "Starting SSR-safe role resolution");

  try {
    // Get userId from Clerk auth() - SSR optimized
    logger.debug("AUTH", "Calling Clerk auth()");
    const { userId } = await auth();
    logger.debug("AUTH", "UserId retrieved", { userId: userId || "(none)" });

    // No userId = unauthenticated = shopper
    if (!userId) {
      logger.info("AUTH", "No userId - returning 'shopper' (unauthenticated)");
      return getDefaultRole();
    }

    // Fetch user from Clerk - SSR-safe
    logger.debug("AUTH", "Fetching user from Clerk");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    logger.debug("AUTH", "User fetched successfully");

    // Extract staffRole from publicMetadata (CANONICAL SOURCE)
    const metadata = user?.publicMetadata as { staffRole?: string } | undefined;
    logger.debug("AUTH", "Metadata extracted", { metadata });

    const rawRole = metadata?.staffRole;
    logger.debug("AUTH", "Raw staffRole from metadata", { rawRole });

    // Validate and return
    if (rawRole && isValidStaffRole(rawRole)) {
      logger.info("AUTH", "Valid role resolved", { role: rawRole });
      return rawRole;
    }

    // Invalid or missing role = default to shopper
    logger.info("AUTH", "Invalid or missing staffRole - defaulting to 'shopper'");
    return getDefaultRole();

  } catch (error) {
    // NEVER crash the page - log and return default
    logger.error("AUTH", "Error fetching user role", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined
    });
    logger.info("AUTH", "Falling back to 'shopper' due to error");
    return getDefaultRole();
  }
}
