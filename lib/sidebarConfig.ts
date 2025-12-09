/**
 * Club 19 Sales OS - Sidebar Configuration
 *
 * Role-based navigation configuration
 */

import { type StaffRole } from "./roleTypes";

export interface SidebarItem {
  label: string;
  href: string;
  roles: StaffRole[];
  icon?: string;
}

export const sidebarConfig: Record<string, SidebarItem> = {
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

/**
 * Get sidebar items allowed for a specific role
 */
export function getSidebarItemsForRole(role: StaffRole): SidebarItem[] {
  return Object.values(sidebarConfig).filter((item) =>
    item.roles.includes(role)
  );
}
