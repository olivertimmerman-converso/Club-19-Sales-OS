/**
 * Club 19 Sales OS - Sidebar Configuration
 *
 * Role-based navigation configuration
 * Derives permissions from lib/permissions.ts (single source of truth)
 */

import { type StaffRole, canAccessRoute } from "./permissions";

export interface SidebarItem {
  label: string;
  href: string;
  icon?: string;
}

/**
 * All possible sidebar items
 * Actual visibility is determined by canAccessRoute() from permissions.ts
 */
const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard",
  },
  {
    label: "Sales",
    href: "/sales",
    icon: "Briefcase",
  },
  {
    label: "Clients",
    href: "/clients",
    icon: "Users",
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: "Truck",
  },
  {
    label: "Shoppers",
    href: "/shoppers",
    icon: "Users",
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: "FileText",
  },
  {
    label: "Finance",
    href: "/finance",
    icon: "Calculator",
  },
  {
    label: "Legacy Data",
    href: "/legacy",
    icon: "Archive",
  },
  {
    label: "Admin",
    href: "/admin",
    icon: "Shield",
  },
];

/**
 * Get sidebar items allowed for a specific role
 *
 * Uses canAccessRoute() from permissions.ts to determine visibility
 */
export function getSidebarItemsForRole(role: StaffRole): SidebarItem[] {
  return ALL_SIDEBAR_ITEMS.filter((item) => canAccessRoute(role, item.href));
}

/**
 * @deprecated Use getSidebarItemsForRole instead
 * This exists only for backward compatibility
 */
export const sidebarConfig: Record<string, SidebarItem & { roles: StaffRole[] }> = {
  dashboard: {
    label: "Dashboard",
    href: "/dashboard",
    roles: ["shopper", "admin", "finance", "superadmin", "founder", "operations"],
    icon: "LayoutDashboard",
  },
  sales: {
    label: "Sales",
    href: "/sales",
    roles: ["shopper", "admin", "finance", "superadmin", "founder", "operations"],
    icon: "Briefcase",
  },
  clients: {
    label: "Clients",
    href: "/clients",
    roles: ["shopper", "admin", "finance", "superadmin", "founder", "operations"],
    icon: "Users",
  },
  suppliers: {
    label: "Suppliers",
    href: "/suppliers",
    roles: ["admin", "finance", "superadmin", "operations"],
    icon: "Truck",
  },
  shoppers: {
    label: "Shoppers",
    href: "/shoppers",
    roles: ["superadmin", "founder", "operations"],
    icon: "Users",
  },
  invoices: {
    label: "Invoices",
    href: "/invoices",
    roles: ["admin", "finance", "superadmin", "founder", "operations"],
    icon: "FileText",
  },
  finance: {
    label: "Finance",
    href: "/finance",
    roles: ["admin", "finance", "superadmin", "founder", "operations"],
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
    roles: ["superadmin", "admin", "finance", "operations"],
    icon: "Archive",
  },
};
