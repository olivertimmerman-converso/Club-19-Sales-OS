/**
 * Club 19 Sales OS - Global Sidebar
 *
 * Vertical navigation sidebar with role-based menu items
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { type StaffRole } from "@/lib/permissions";
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
  RefreshCw,
  HeartPulse,
  Hourglass,
  Trash2,
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
  RefreshCw,
  HeartPulse,
  Hourglass,
  Trash2,
};

interface SidebarProps {
  role: StaffRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = getSidebarItemsForRole(role);

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo / Brand */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
          {/* Club 19 Circular Wordmark */}
          <div className="relative h-10 w-10 shrink-0">
            <Image
              src="/club19-wordmark.png"
              alt="Club 19 London"
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Text Lockup */}
          <div className="flex flex-col leading-tight">
            <div className="font-serif text-base font-light leading-tight tracking-wide text-gray-900">
              CLUB<span className="mx-1 text-gray-400">|</span>19
            </div>
            <div className="font-sans text-[9px] uppercase tracking-[0.15em] text-gray-500">
              SALES OS
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {items.map((item) => {
            // Special handling for specific routes:
            // - /admin: only exact match (don't highlight when on /admin/sync)
            // - /trade/new: highlight for all /trade/* routes
            let isActive = false;
            if (item.href === "/admin") {
              isActive = pathname === "/admin";
            } else if (item.href === "/trade/new") {
              isActive = pathname.startsWith("/trade");
            } else {
              isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            }
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
