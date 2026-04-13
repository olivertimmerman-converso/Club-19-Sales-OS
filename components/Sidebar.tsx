/**
 * Club 19 Atelier - Global Sidebar
 *
 * Vertical navigation sidebar with role-based menu items
 * Navy background with cream/taupe text — luxury brand feel
 * Respects "View As" mode when superadmin is viewing as another role
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
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

/**
 * Map viewAs URL param values to StaffRole
 * Used when superadmin is viewing as another role
 */
function mapViewAsToRole(viewAs: string | null): StaffRole | null {
  if (!viewAs) return null;

  switch (viewAs) {
    case "founder":
      return "founder";
    case "operations":
      return "operations";
    case "shopper-hope-peverell":
    case "shopper-mary-clair-bromfield":
    case "shopper-hope":
    case "shopper-mc":
    case "shopper-hope-sherwin":
      return "shopper";
    default:
      return null;
  }
}

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
  const searchParams = useSearchParams();

  // When superadmin uses "View As", show sidebar for the viewed role
  const viewAs = searchParams.get("viewAs");
  const viewAsRole = role === "superadmin" ? mapViewAsToRole(viewAs) : null;
  const effectiveRole = viewAsRole || role;

  const items = getSidebarItemsForRole(effectiveRole);

  // Incomplete sales badge — fetch once on mount for shopper role
  const [incompleteCount, setIncompleteCount] = useState(0);
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (effectiveRole !== "shopper" || fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/sales/incomplete")
      .then((r) => r.json())
      .then((d) => setIncompleteCount(d.sales?.length || 0))
      .catch(() => {});
  }, [effectiveRole]);

  // Build href with preserved viewAs param
  const buildHref = (basePath: string) => {
    if (viewAs) {
      return `${basePath}?viewAs=${viewAs}`;
    }
    return basePath;
  };

  return (
    <aside className="w-64 bg-club19-navy flex flex-col">
      {/* Logo / Brand */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer" title={viewAs ? "Exit View As mode" : undefined}>
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
            <div className="font-serif text-base font-light leading-tight tracking-wide text-club19-cream">
              CLUB<span className="mx-1 text-club19-taupe">|</span>19
            </div>
            <div className="font-sans text-[9px] uppercase tracking-[0.15em] text-club19-taupe">
              ATELIER
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {items.map((item) => {
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
                  href={buildHref(item.href)}
                  className={`
                    flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150
                    ${
                      isActive
                        ? "bg-white/10 text-club19-cream border-l-2 border-club19-taupe"
                        : "text-club19-cream/70 hover:text-club19-cream hover:bg-white/5"
                    }
                  `}
                >
                  {Icon && <Icon size={18} />}
                  <span className="flex-1">{item.label}</span>
                  {effectiveRole === "shopper" && item.href === "/sales" && incompleteCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                      {incompleteCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer / Role Badge */}
      <div className="p-4 border-t border-white/10">
        <div className="px-4 py-2 rounded-lg bg-white/5 text-center">
          <span className="text-xs font-medium text-club19-taupe uppercase tracking-wide">
            {viewAsRole ? `Viewing as: ${effectiveRole}` : role}
          </span>
        </div>
      </div>
    </aside>
  );
}
