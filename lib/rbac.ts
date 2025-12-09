/**
 * Club 19 Sales OS - Role-Based Access Control
 *
 * DEPRECATED: This file re-exports from lib/permissions.ts for backward compatibility
 * New code should import directly from lib/permissions.ts
 *
 * @deprecated Use lib/permissions.ts instead
 */

import {
  type StaffRole,
  canAccessRoute,
  isRouteReadOnly,
  getHomepageForRole,
  getRoleLabel,
} from "./permissions";

/**
 * @deprecated Use StaffRole from lib/permissions.ts instead
 */
export type UserRole = StaffRole;

/**
 * @deprecated This interface is no longer used - permissions are defined in ROUTE_PERMISSIONS
 */
export interface RoleConfig {
  allowedRoutes: string[];
  readOnlyRoutes?: string[];
  homepage: string;
  label: string;
}

/**
 * @deprecated Use ROUTE_PERMISSIONS from lib/permissions.ts instead
 * This exists only for backward compatibility
 */
export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  shopper: {
    allowedRoutes: ['/staff', '/staff/shopper/dashboard', '/staff/shopper/sales'],
    homepage: getHomepageForRole('shopper'),
    label: getRoleLabel('shopper'),
  },
  admin: {
    allowedRoutes: [
      '/staff', '/staff/admin/dashboard', '/staff/admin/sales',
      '/staff/admin/analytics', '/staff/admin/errors',
      '/staff/shopper/dashboard', '/staff/shopper/sales',
    ],
    homepage: getHomepageForRole('admin'),
    label: getRoleLabel('admin'),
  },
  finance: {
    allowedRoutes: [
      '/staff', '/staff/finance/dashboard',
      '/staff/finance/commissions', '/staff/finance/overdue',
    ],
    readOnlyRoutes: ['/staff/admin/sales'],
    homepage: getHomepageForRole('finance'),
    label: getRoleLabel('finance'),
  },
  operations: {
    allowedRoutes: [
      '/staff', '/dashboard', '/sales', '/clients', '/suppliers',
      '/shoppers', '/invoices', '/finance', '/legacy', '/trade',
    ],
    homepage: getHomepageForRole('operations'),
    label: getRoleLabel('operations'),
  },
  superadmin: {
    allowedRoutes: [
      '/staff', '/staff/shopper/dashboard', '/staff/shopper/sales',
      '/staff/admin/dashboard', '/staff/admin/sales', '/staff/admin/analytics',
      '/staff/admin/errors', '/staff/finance/dashboard', '/staff/finance/commissions',
      '/staff/finance/overdue', '/staff/superadmin/tools', '/shoppers',
      '/dashboard', '/sales', '/clients', '/suppliers', '/invoices',
      '/finance', '/legacy', '/trade',
    ],
    homepage: getHomepageForRole('superadmin'),
    label: getRoleLabel('superadmin'),
  },
  founder: {
    allowedRoutes: [
      '/staff', '/dashboard', '/sales', '/clients',
      '/shoppers', '/invoices', '/finance',
    ],
    homepage: getHomepageForRole('founder'),
    label: getRoleLabel('founder'),
  },
};

/**
 * Check if a user role can access a given route
 *
 * @deprecated Use canAccessRoute from lib/permissions.ts instead
 */
export function canAccess(route: string, role: UserRole): boolean {
  return canAccessRoute(role, route);
}

/**
 * Check if a route is read-only for a given role
 *
 * @deprecated Use isRouteReadOnly from lib/permissions.ts instead
 */
export function isReadOnly(route: string, role: UserRole): boolean {
  return isRouteReadOnly(role, route);
}

/**
 * Get the homepage for a given role
 *
 * @deprecated Use getHomepageForRole from lib/permissions.ts instead
 */
export function getHomepage(role: UserRole): string {
  return getHomepageForRole(role);
}

/**
 * @deprecated This will be moved to sidebarConfig.ts
 */
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

/**
 * Get navigation items for a given role
 *
 * @deprecated This will be moved to sidebarConfig.ts
 */
export function getNavigationItems(role: UserRole): NavItem[] {
  const items: NavItem[] = [];

  // Shopper navigation
  if (canAccessRoute(role, '/staff/shopper/dashboard')) {
    items.push({
      label: 'Dashboard',
      href: '/staff/shopper/dashboard',
      icon: 'LayoutDashboard',
    });
  }

  if (canAccessRoute(role, '/staff/shopper/sales')) {
    items.push({
      label: 'My Sales',
      href: '/staff/shopper/sales',
      icon: 'Briefcase',
    });
  }

  // Admin navigation
  if (canAccessRoute(role, '/staff/admin/dashboard')) {
    items.push({
      label: 'Admin',
      href: '/staff/admin/dashboard',
      icon: 'Shield',
      children: [
        { label: 'Dashboard', href: '/staff/admin/dashboard' },
        { label: 'All Sales', href: '/staff/admin/sales' },
        { label: 'Analytics', href: '/staff/admin/analytics' },
        { label: 'Errors', href: '/staff/admin/errors' },
      ],
    });
  }

  // Finance navigation
  if (canAccessRoute(role, '/staff/finance/dashboard')) {
    items.push({
      label: 'Finance',
      href: '/staff/finance/dashboard',
      icon: 'Calculator',
      children: [
        { label: 'Dashboard', href: '/staff/finance/dashboard' },
        { label: 'Commissions', href: '/staff/finance/commissions' },
        { label: 'Overdue', href: '/staff/finance/overdue' },
      ],
    });
  }

  // Superadmin tools
  if (canAccessRoute(role, '/staff/superadmin/tools')) {
    items.push({
      label: 'System',
      href: '/staff/superadmin/tools',
      icon: 'Settings',
    });
  }

  return items;
}
