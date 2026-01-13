/**
 * Club 19 Sales OS - Unified Permissions System
 *
 * SINGLE SOURCE OF TRUTH for all access control
 * All other files (assertAccess, rbac, sidebarConfig, middleware) import from here
 */

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export type StaffRole =
  | "superadmin"   // Oliver - full system access
  | "founder"      // Founders - business operations access
  | "operations"   // Alys - operations manager
  | "admin"        // Sophie - administrator
  | "finance"      // Finance team - financial data access
  | "shopper";     // Hope, MC - sales team

export const ALL_ROLES: readonly StaffRole[] = [
  "superadmin",
  "founder",
  "operations",
  "admin",
  "finance",
  "shopper",
] as const;

export function isValidStaffRole(role: unknown): role is StaffRole {
  return typeof role === "string" && ALL_ROLES.includes(role as StaffRole);
}

export function getDefaultRole(): StaffRole {
  return "shopper";
}

// ============================================================================
// ROUTE PERMISSIONS
// ============================================================================

/**
 * Route permission configuration
 * Maps each route to the roles that can access it
 */
export const ROUTE_PERMISSIONS: Record<string, {
  allowedRoles: readonly StaffRole[];
  readOnlyRoles?: readonly StaffRole[];
  description: string;
}> = {
  // ============================================================================
  // MAIN OS ROUTES (app/(os)/*)
  // ============================================================================
  "/dashboard": {
    allowedRoles: ["superadmin", "founder", "operations", "admin", "finance", "shopper"],
    description: "Main dashboard - accessible to all roles",
  },
  "/sales": {
    allowedRoles: ["superadmin", "founder", "operations", "admin", "finance", "shopper"],
    description: "Sales list and detail pages",
  },
  "/clients": {
    allowedRoles: ["superadmin", "founder", "operations", "admin", "finance", "shopper"],
    description: "Client (buyer) management",
  },
  "/suppliers": {
    allowedRoles: ["superadmin", "operations", "admin", "finance"],
    description: "Supplier management",
  },
  "/shoppers": {
    allowedRoles: ["superadmin", "founder", "operations"],
    description: "Shopper (sales team) management",
  },
  "/invoices": {
    allowedRoles: ["superadmin", "founder", "operations", "admin", "finance"],
    description: "Invoice management",
  },
  "/finance": {
    allowedRoles: ["superadmin", "founder", "operations", "admin", "finance"],
    description: "Financial overview and reports",
  },
  "/legacy": {
    allowedRoles: ["superadmin", "operations", "admin", "finance"],
    description: "Sales Sheet Data (legacy_trades table)",
  },
  "/legacy-xero": {
    allowedRoles: ["superadmin", "operations", "admin", "finance"],
    description: "Legacy Xero Data (xero_import Sales records)",
  },
  "/trade": {
    allowedRoles: ["superadmin", "founder", "operations", "shopper"],
    description: "Sales Atelier / Deal Studio",
  },
  "/xero-health": {
    allowedRoles: ["superadmin", "admin", "operations"],
    description: "Xero integration health dashboard",
  },

  // ============================================================================
  // STAFF PORTAL ROUTES (app/staff/*)
  // ============================================================================
  "/staff": {
    allowedRoles: ["superadmin", "admin", "finance", "shopper"],
    description: "Staff navigation hub",
  },
  "/staff/shopper/dashboard": {
    allowedRoles: ["superadmin", "admin", "shopper"],
    description: "Shopper staff dashboard",
  },
  "/staff/shopper/sales": {
    allowedRoles: ["superadmin", "admin", "shopper"],
    description: "Shopper sales management",
  },
  "/staff/admin/dashboard": {
    allowedRoles: ["superadmin", "admin"],
    description: "Admin staff dashboard",
  },
  "/staff/admin/sales": {
    allowedRoles: ["superadmin", "admin"],
    readOnlyRoles: ["finance"],
    description: "Admin sales overview (finance can view read-only)",
  },
  "/staff/admin/analytics": {
    allowedRoles: ["superadmin", "admin"],
    description: "Admin analytics dashboard",
  },
  "/staff/admin/errors": {
    allowedRoles: ["superadmin", "admin"],
    description: "Error tracking and resolution",
  },
  "/staff/finance/dashboard": {
    allowedRoles: ["superadmin", "finance"],
    description: "Finance staff dashboard",
  },
  "/staff/finance/commissions": {
    allowedRoles: ["superadmin", "finance"],
    description: "Commission calculations and payouts",
  },
  "/staff/finance/overdue": {
    allowedRoles: ["superadmin", "finance"],
    description: "Overdue payments tracking",
  },
  "/staff/superadmin/tools": {
    allowedRoles: ["superadmin"],
    description: "Superadmin system tools",
  },

  // ============================================================================
  // ADMIN ROUTES
  // ============================================================================
  "/admin": {
    allowedRoles: ["superadmin"],
    description: "System administration",
  },
  "/admin/deleted-sales": {
    allowedRoles: ["superadmin"],
    description: "Deleted Sales (soft-deleted records with restore functionality)",
  },
  "/admin/sync": {
    allowedRoles: ["superadmin", "operations", "founder"],
    description: "Xero sync management and invoice allocation",
  },
  "/admin/sync/adopt": {
    allowedRoles: ["superadmin", "operations", "founder", "admin"],
    description: "Adopt unallocated Xero invoices into full Sale records",
  },
};

// ============================================================================
// PERMISSION CHECKING FUNCTIONS
// ============================================================================

/**
 * Check if a role can access a specific route
 *
 * Handles:
 * - Exact route matches
 * - Sub-route matching (e.g., /sales/[id] matches /sales permission)
 * - Special case: /staff doesn't grant access to all /staff/* routes
 *
 * @param role - The user's staff role
 * @param pathname - The route to check access for
 * @returns true if role can access the route, false otherwise
 */
export function canAccessRoute(role: StaffRole, pathname: string): boolean {
  // Superadmin has access to everything
  if (role === "superadmin") {
    return true;
  }

  // Find matching permission entry
  for (const [route, config] of Object.entries(ROUTE_PERMISSIONS)) {
    // Exact match
    if (pathname === route) {
      return config.allowedRoles.includes(role) ||
             (config.readOnlyRoles?.includes(role) ?? false);
    }

    // Sub-route match (e.g., /sales/123 matches /sales permission)
    // EXCEPTION: /staff doesn't grant access to /staff/* routes
    if (route !== "/staff" && pathname.startsWith(route + "/")) {
      return config.allowedRoles.includes(role) ||
             (config.readOnlyRoles?.includes(role) ?? false);
    }
  }

  return false;
}

/**
 * Check if a route is read-only for a specific role
 *
 * @param role - The user's staff role
 * @param pathname - The route to check
 * @returns true if role has read-only access, false otherwise
 */
export function isRouteReadOnly(role: StaffRole, pathname: string): boolean {
  for (const [route, config] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === route || (route !== "/staff" && pathname.startsWith(route + "/"))) {
      return config.readOnlyRoles?.includes(role) ?? false;
    }
  }
  return false;
}

/**
 * Get all routes accessible by a specific role
 *
 * @param role - The user's staff role
 * @returns Array of route paths the role can access
 */
export function getRoutesForRole(role: StaffRole): string[] {
  if (role === "superadmin") {
    return Object.keys(ROUTE_PERMISSIONS);
  }

  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([_, config]) =>
      config.allowedRoles.includes(role) ||
      (config.readOnlyRoles?.includes(role) ?? false)
    )
    .map(([route]) => route);
}

/**
 * Get the homepage for a specific role
 *
 * @param role - The user's staff role
 * @returns The default landing page for this role
 */
export function getHomepageForRole(role: StaffRole): string {
  switch (role) {
    case "superadmin":
    case "admin":
      return "/staff/admin/dashboard";
    case "finance":
      return "/staff/finance/dashboard";
    case "shopper":
      return "/staff/shopper/dashboard";
    case "operations":
    case "founder":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

/**
 * Get a human-readable label for a role
 *
 * @param role - The user's staff role
 * @returns Display label for the role
 */
export function getRoleLabel(role: StaffRole): string {
  const labels: Record<StaffRole, string> = {
    superadmin: "Super Administrator",
    founder: "Founder",
    operations: "Operations Manager",
    admin: "Administrator",
    finance: "Finance",
    shopper: "Shopper",
  };
  return labels[role];
}

// ============================================================================
// LEGACY ACCESS CONTROL
// ============================================================================

/**
 * Check if a role can access legacy dashboards
 *
 * @param role - The user's staff role
 * @returns true if role can access legacy data, false otherwise
 */
export function canAccessLegacy(role: StaffRole): boolean {
  return canAccessRoute(role, "/legacy");
}
