/**
 * Club 19 Sales OS - Sidebar Configuration
 *
 * Role-based navigation configuration
 */

import { Role } from "./getUserRole";

export interface SidebarItem {
  label: string;
  href: string;
  roles: Role[];
  icon?: string;
}

export const sidebarConfig: Record<string, SidebarItem> = {
  dashboard: {
    label: "Dashboard",
    href: "/dashboard",
    roles: ["shopper", "admin", "finance", "superadmin"],
    icon: "LayoutDashboard",
  },
  sales: {
    label: "Sales",
    href: "/sales",
    roles: ["shopper", "admin", "finance", "superadmin"],
    icon: "Briefcase",
  },
  clients: {
    label: "Clients",
    href: "/clients",
    roles: ["shopper", "admin", "finance", "superadmin"],
    icon: "Users",
  },
  suppliers: {
    label: "Suppliers",
    href: "/suppliers",
    roles: ["shopper", "admin", "finance", "superadmin"],
    icon: "Truck",
  },
  invoices: {
    label: "Invoices",
    href: "/invoices",
    roles: ["admin", "finance", "superadmin"],
    icon: "FileText",
  },
  finance: {
    label: "Finance",
    href: "/finance",
    roles: ["admin", "finance", "superadmin"],
    icon: "Calculator",
  },
  admin: {
    label: "Admin",
    href: "/admin",
    roles: ["superadmin"],
    icon: "Shield",
  },
  legacy: {
    label: "Legacy Data",
    href: "/legacy",
    roles: ["admin", "finance", "superadmin"],
    icon: "Archive",
  },
};

/**
 * Get sidebar items allowed for a specific role
 */
export function getSidebarItemsForRole(role: Role): SidebarItem[] {
  return Object.values(sidebarConfig).filter((item) =>
    item.roles.includes(role)
  );
}

/**
 * Check if a user role can access a specific route
 */
export function canAccessRoute(route: string, role: Role): boolean {
  // Find matching sidebar item
  const item = Object.values(sidebarConfig).find(
    (item) => item.href === route || route.startsWith(item.href + "/")
  );

  if (!item) {
    // Route not in sidebar config - allow by default
    return true;
  }

  return item.roles.includes(role);
}
