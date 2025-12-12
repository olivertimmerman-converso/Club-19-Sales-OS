/**
 * Club 19 Sales OS - Global Sidebar
 *
 * Vertical navigation sidebar with role-based menu items
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type StaffRole, canAccessRoute } from "@/lib/permissions";
import { getSidebarItemsForRole } from "@/lib/sidebarConfig";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Truck,
  FileText,
  Calculator,
  Shield,
  Archive,
  PlusCircle,
} from "lucide-react";

const iconMap = {
  LayoutDashboard,
  Briefcase,
  Users,
  Truck,
  FileText,
  Calculator,
  Shield,
  Archive,
  PlusCircle,
};

interface SidebarProps {
  role: StaffRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = getSidebarItemsForRole(role);
  const showSalesAtelier = canAccessRoute(role, "/trade");

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo / Brand */}
      <div className="h-16 flex items-center justify-center border-b border-gray-200">
        <h1 className="font-serif text-xl font-semibold tracking-wide text-gray-900">
          Club 19
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon
              ? iconMap[item.icon as keyof typeof iconMap]
              : null;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${
                      isActive
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }
                  `}
                >
                  {Icon && <Icon size={18} />}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sales Atelier - Bottom positioned above role badge */}
      {showSalesAtelier && (
        <div className="p-4 border-t border-gray-200">
          <Link
            href="/trade/new"
            className={`
              flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${
                pathname === "/trade/new" || pathname.startsWith("/trade/")
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }
            `}
          >
            <PlusCircle size={18} />
            <span>Sales Atelier</span>
          </Link>
        </div>
      )}

      {/* Footer / Role Badge */}
      <div className="p-4 border-t border-gray-200">
        <div className="px-4 py-2 rounded-lg bg-gray-50 text-center">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {role}
          </span>
        </div>
      </div>
    </aside>
  );
}
