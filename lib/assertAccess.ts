/**
 * Club 19 Sales OS - Access Control & RBAC
 *
 * Production-ready authorization system
 */

import { redirect } from "next/navigation";
import { type StaffRole } from "./roleTypes";

/**
 * Check if a role can access a specific route
 *
 * @param pathname - The route path to check
 * @param role - User's staff role
 * @returns true if access granted, false otherwise
 */
export function canAccessRoute(pathname: string, role: StaffRole): boolean {
  console.log(`[RBAC] 🔐 Checking access: pathname="${pathname}", role="${role}"`);

  // Superadmin has access to everything
  if (role === "superadmin") {
    console.log(`[RBAC] ✅ GRANTED: superadmin has full access`);
    return true;
  }

  // Admin access - full OS except system config
  if (role === "admin") {
    const systemConfigRoutes = ["/admin/system", "/rbac", "/env"];
    const isSystemConfig = systemConfigRoutes.some(route => pathname.startsWith(route));

    if (isSystemConfig) {
      console.log(`[RBAC] ❌ DENIED: admin cannot access system config routes`);
      return false;
    }

    console.log(`[RBAC] ✅ GRANTED: admin has access to this route`);
    return true;
  }

  // Finance access - finance, invoices, legacy, dashboard
  if (role === "finance") {
    const financeAllowedRoutes = [
      "/finance",
      "/invoices",
      "/legacy",
      "/dashboard",
    ];

    const hasAccess = financeAllowedRoutes.some(route => pathname.startsWith(route));

    if (hasAccess) {
      console.log(`[RBAC] ✅ GRANTED: finance has access to this route`);
      return true;
    }

    console.log(`[RBAC] ❌ DENIED: finance role cannot access "${pathname}"`);
    return false;
  }

  // Shopper access - very restricted
  if (role === "shopper") {
    const shopperAllowedRoutes = [
      "/staff",                    // Staff navigation hub
      "/staff/shopper/dashboard",  // Shopper staff dashboard
      "/staff/shopper/sales",      // Shopper sales management
      "/sales",
      "/legacy/my-sales",
      "/dashboard/shopper",
    ];

    const hasAccess = shopperAllowedRoutes.some(route => pathname.startsWith(route));

    if (hasAccess) {
      console.log(`[RBAC] ✅ GRANTED: shopper has access to this route`);
      return true;
    }

    console.log(`[RBAC] ❌ DENIED: shopper role cannot access "${pathname}"`);
    return false;
  }

  // Default deny
  console.log(`[RBAC] ❌ DENIED: unknown role or no match`);
  return false;
}

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
  console.log(`[assertAccess] 🔒 Asserting access for role="${role}" to pathname="${pathname}"`);

  if (!canAccessRoute(pathname, role)) {
    console.error(`[assertAccess] 🚫 ACCESS DENIED - Redirecting to /unauthorised`);
    redirect("/unauthorised");
  }

  console.log(`[assertAccess] ✅ Access granted`);
}

/**
 * Check if role can access legacy dashboards
 *
 * Legacy access: superadmin, admin, finance
 *
 * @param role - User's staff role
 * @returns true if can access legacy, false otherwise
 */
export function canAccessLegacy(role: StaffRole): boolean {
  const allowedRoles: StaffRole[] = ["superadmin", "admin", "finance"];
  return allowedRoles.includes(role);
}

/**
 * Assert legacy access - throws redirect if denied
 *
 * @param role - User's staff role
 * @throws Redirect to /unauthorised if access denied
 */
export function assertLegacyAccess(role: StaffRole): void {
  console.log(`[assertLegacyAccess] 🔐 Checking legacy access for role="${role}"`);

  if (!canAccessLegacy(role)) {
    console.error(`[assertLegacyAccess] ❌ DENIED - Role "${role}" cannot access legacy dashboards`);
    console.error(`[assertLegacyAccess] 🚫 Redirecting to /unauthorised`);
    redirect("/unauthorised");
  }

  console.log(`[assertLegacyAccess] ✅ Legacy access granted`);
}
