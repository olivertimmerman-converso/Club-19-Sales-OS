/**
 * Club 19 Sales OS - Access Control & RBAC
 *
 * Production-ready authorization system
 * All logic delegated to lib/permissions.ts (single source of truth)
 */

import { redirect } from "next/navigation";
import {
  type StaffRole,
  canAccessRoute,
  isRouteReadOnly,
  canAccessLegacy as canAccessLegacyRoute,
} from "./permissions";
import * as logger from "./logger";

/**
 * Check if a role can access a specific route
 *
 * @param pathname - The route path to check
 * @param role - User's staff role
 * @returns true if access granted, false otherwise
 */
export function canAccessRoute_Deprecated(pathname: string, role: StaffRole): boolean {
  logger.info("AUTH", "Checking access", { pathname, role });

  const hasAccess = canAccessRoute(role, pathname);

  if (hasAccess) {
    logger.info("AUTH", "Access GRANTED", { role, pathname });
  } else {
    logger.info("AUTH", "Access DENIED", { role, pathname });
  }

  return hasAccess;
}

// Re-export the main function with the expected name for backward compatibility
export { canAccessRoute };

/**
 * Assert access to a route - throws redirect if denied
 *
 * Use this in page.tsx files for SSR access control
 *
 * @param pathname - The route path to check
 * @param role - User's staff role
 * @throws Redirect to /unauthorised if access denied
 */
export function assertAccess(pathname: string, role: StaffRole): void {
  logger.info("AUTH", "Asserting access", { role, pathname });

  if (!canAccessRoute(role, pathname)) {
    logger.error("AUTH", "ACCESS DENIED - Redirecting to /unauthorised", { role, pathname });
    redirect("/unauthorised");
  }

  logger.info("AUTH", "Access granted", { role, pathname });
}

/**
 * Check if role can access legacy dashboards
 *
 * @param role - User's staff role
 * @returns true if can access legacy, false otherwise
 */
export function canAccessLegacy(role: StaffRole): boolean {
  return canAccessLegacyRoute(role);
}

/**
 * Assert legacy access - throws redirect if denied
 *
 * @param role - User's staff role
 * @throws Redirect to /unauthorised if access denied
 */
export function assertLegacyAccess(role: StaffRole): void {
  logger.info("AUTH", "Checking legacy access", { role });

  if (!canAccessLegacy(role)) {
    logger.error("AUTH", "DENIED - Role cannot access legacy dashboards", { role });
    logger.error("AUTH", "Redirecting to /unauthorised", { role });
    redirect("/unauthorised");
  }

  logger.info("AUTH", "Legacy access granted", { role });
}

/**
 * Check if a route is read-only for a given role
 *
 * @param pathname - The route path to check
 * @param role - User's staff role
 * @returns true if read-only, false otherwise
 */
export function isReadOnly(pathname: string, role: StaffRole): boolean {
  return isRouteReadOnly(role, pathname);
}
