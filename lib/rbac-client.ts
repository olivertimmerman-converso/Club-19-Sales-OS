/**
 * Club 19 Sales OS - Client-Side RBAC Utilities
 *
 * Client-side version of RBAC utilities for use in Client Components
 * Uses Clerk's useUser hook for client-side role access
 */

"use client";

import { useUser } from "@clerk/nextjs";
import { UserRole, canAccess, getHomepage, getNavigationItems } from "./rbac";

/**
 * Custom hook to get the current user's role from Clerk (client-side)
 *
 * @returns UserRole or null if not authenticated
 */
export function useUserRole(): UserRole | null {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return null;
  }

  // Read role from Clerk publicMetadata
  // Support both 'staffRole' and 'role' fields for production compatibility
  const metadata = user.publicMetadata as { role?: UserRole; staffRole?: UserRole };
  const role = metadata?.staffRole || metadata?.role;

  if (!role) {
    // Default to 'shopper' if no role is set
    return "shopper";
  }

  return role;
}

/**
 * Check if current user's role can access a given route (client-side)
 *
 * @param route - Route to check access for
 * @returns boolean indicating if user can access route
 */
export function useCanAccessRoute(route: string): boolean {
  const role = useUserRole();

  if (!role) {
    return false;
  }

  return canAccess(route, role);
}

/**
 * Get homepage for current user's role (client-side)
 *
 * @returns string path to homepage
 */
export function useHomepage(): string {
  const role = useUserRole();

  if (!role) {
    return "/dashboard";
  }

  return getHomepage(role);
}

/**
 * Get navigation items for current user's role (client-side)
 *
 * @returns NavItem[] array of navigation items
 */
export function useNavigationItems() {
  const role = useUserRole();

  if (!role) {
    return [];
  }

  return getNavigationItems(role);
}
