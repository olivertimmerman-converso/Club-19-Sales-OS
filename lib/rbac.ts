/**
 * Club 19 Sales OS - Role-Based Access Control
 *
 * Roles:
 * - shopper: Hope, MC (sales team)
 * - admin: Sophie (operations manager)
 * - finance: Alys (finance team)
 * - superadmin: Oliver (full system access)
 */

export type UserRole = 'shopper' | 'admin' | 'finance' | 'superadmin';

export interface RoleConfig {
  allowedRoutes: string[];
  readOnlyRoutes?: string[];
  homepage: string;
  label: string;
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  shopper: {
    allowedRoutes: [
      '/staff',
      '/staff/shopper/dashboard',
      '/staff/shopper/sales',
    ],
    homepage: '/staff/shopper/dashboard',
    label: 'Shopper',
  },
  admin: {
    allowedRoutes: [
      '/staff',
      '/staff/admin/dashboard',
      '/staff/admin/sales',
      '/staff/admin/analytics',
      '/staff/admin/errors',
      '/staff/shopper/dashboard',
      '/staff/shopper/sales',
    ],
    homepage: '/staff/admin/dashboard',
    label: 'Administrator',
  },
  finance: {
    allowedRoutes: [
      '/staff',
      '/staff/finance/dashboard',
      '/staff/finance/commissions',
      '/staff/finance/overdue',
    ],
    readOnlyRoutes: ['/staff/admin/sales'],
    homepage: '/staff/finance/dashboard',
    label: 'Finance',
  },
  superadmin: {
    allowedRoutes: [
      '/staff',
      '/staff/shopper/dashboard',
      '/staff/shopper/sales',
      '/staff/admin/dashboard',
      '/staff/admin/sales',
      '/staff/admin/analytics',
      '/staff/admin/errors',
      '/staff/finance/dashboard',
      '/staff/finance/commissions',
      '/staff/finance/overdue',
      '/staff/superadmin/tools',
    ],
    homepage: '/staff/admin/dashboard',
    label: 'Super Administrator',
  },
};

/**
 * Check if a user role can access a given route
 */
export function canAccess(route: string, role: UserRole): boolean {
  const config = ROLE_CONFIG[role];
  if (!config) return false;

  // Check if route exactly matches an allowed route
  const exactMatch = config.allowedRoutes.some((allowed) => route === allowed);
  if (exactMatch) return true;

  // Check if route is a sub-route of an allowed route
  // IMPORTANT: Exclude '/staff' from prefix matching to prevent access to all staff routes
  const prefixMatch = config.allowedRoutes
    .filter((allowed) => allowed !== '/staff')
    .some((allowed) => route.startsWith(allowed + '/'));
  if (prefixMatch) return true;

  // Check read-only routes
  if (config.readOnlyRoutes) {
    const readOnlyMatch = config.readOnlyRoutes.some(
      (allowed) => route === allowed || route.startsWith(allowed + '/')
    );
    if (readOnlyMatch) return true;
  }

  return false;
}

/**
 * Check if a route is read-only for a given role
 */
export function isReadOnly(route: string, role: UserRole): boolean {
  const config = ROLE_CONFIG[role];
  if (!config.readOnlyRoutes) return false;

  return config.readOnlyRoutes.some(
    (readOnly) => route === readOnly || route.startsWith(readOnly + '/')
  );
}

/**
 * Get the homepage for a given role
 */
export function getHomepage(role: UserRole): string {
  return ROLE_CONFIG[role]?.homepage || '/dashboard';
}

/**
 * Get navigation items for a given role
 */
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

export function getNavigationItems(role: UserRole): NavItem[] {
  const items: NavItem[] = [];

  // Shopper navigation
  if (canAccess('/staff/shopper/dashboard', role)) {
    items.push({
      label: 'Dashboard',
      href: '/staff/shopper/dashboard',
      icon: 'LayoutDashboard',
    });
  }

  if (canAccess('/staff/shopper/sales', role)) {
    items.push({
      label: 'My Sales',
      href: '/staff/shopper/sales',
      icon: 'Briefcase',
    });
  }

  // Admin navigation
  if (canAccess('/staff/admin/dashboard', role)) {
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
  if (canAccess('/staff/finance/dashboard', role)) {
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
  if (canAccess('/staff/superadmin/tools', role)) {
    items.push({
      label: 'System',
      href: '/staff/superadmin/tools',
      icon: 'Settings',
    });
  }

  return items;
}
