/**
 * Club 19 Sales OS - Mobile Navigation
 *
 * Renders on screens < md (768px):
 * 1. Fixed top header with hamburger, logo, user button
 * 2. Fixed bottom tab bar with role-aware quick-access tabs
 * 3. Slide-out drawer with full navigation menu
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { type StaffRole } from "@/lib/permissions";
import { getSidebarItemsForRole } from "@/lib/sidebarConfig";
import { SearchOverlay, useSearchShortcut } from "./SearchOverlay";
import {
  Menu,
  X,
  Search,
  PlusCircle,
  Briefcase,
  Hourglass,
  Users,
  LayoutDashboard,
  Calculator,
  FileText,
  Truck,
  Shield,
  Archive,
  RefreshCw,
  HeartPulse,
  Trash2,
  MoreHorizontal,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  PlusCircle,
  Briefcase,
  Hourglass,
  Users,
  Truck,
  FileText,
  Calculator,
  Shield,
  Archive,
  RefreshCw,
  HeartPulse,
  Trash2,
};

interface TabConfig {
  label: string;
  href: string;
  icon: React.ElementType;
}

function getTabsForRole(role: StaffRole): TabConfig[] {
  switch (role) {
    case "shopper":
      return [
        { label: "New Sale", href: "/trade/new", icon: PlusCircle },
        { label: "My Sales", href: "/sales", icon: Briefcase },
      ];
    case "founder":
    case "operations":
      return [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Sales", href: "/sales", icon: Briefcase },
        { label: "Pending", href: "/admin/sync", icon: Hourglass },
        { label: "Clients", href: "/clients", icon: Users },
      ];
    case "finance":
      return [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Sales", href: "/sales", icon: Briefcase },
        { label: "Finance", href: "/finance", icon: Calculator },
        { label: "Invoices", href: "/invoices", icon: FileText },
      ];
    case "superadmin":
    case "admin":
    default:
      return [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Sales", href: "/sales", icon: Briefcase },
        { label: "Pending", href: "/admin/sync", icon: Hourglass },
        { label: "Clients", href: "/clients", icon: Users },
      ];
  }
}

interface MobileNavProps {
  role: StaffRole;
}

export function MobileNav({ role }: MobileNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("viewAs");

  const tabs = getTabsForRole(role);
  const allNavItems = getSidebarItemsForRole(role);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Cmd+K / Ctrl+K to open search
  useSearchShortcut(useCallback(() => setSearchOpen(true), []));

  const buildHref = useCallback(
    (basePath: string) => {
      if (viewAs) return `${basePath}?viewAs=${viewAs}`;
      return basePath;
    },
    [viewAs]
  );

  const isActive = (href: string) => {
    if (href === pathname) return true;
    // Special cases
    if (href === "/admin") return pathname === "/admin";
    if (href === "/trade/new") return pathname.startsWith("/trade");
    // /admin/sync should NOT match /admin prefix for the admin tab
    if (href === "/admin/sync" && pathname.startsWith("/admin/sync")) return true;
    if (href === "/admin/sync") return false;
    return pathname.startsWith(href + "/");
  };

  // For bottom tabs: only highlight if the current path matches one of the tab hrefs
  const isTabActive = (href: string) => {
    // Exact match for tab highlighting (stricter than drawer)
    if (href === pathname) return true;
    if (href === "/trade/new") return pathname.startsWith("/trade");
    if (href === "/admin/sync") return pathname.startsWith("/admin/sync");
    if (href === "/sales") return pathname.startsWith("/sales");
    if (href === "/clients") return pathname.startsWith("/clients");
    if (href === "/finance") return pathname.startsWith("/finance");
    if (href === "/invoices") return pathname.startsWith("/invoices");
    if (href === "/dashboard") return pathname === "/dashboard";
    return false;
  };

  return (
    <>
      {/* ── Mobile Header ── */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 z-30 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        {/* Hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center justify-center w-10 h-10 -ml-1 rounded-lg text-gray-700 active:bg-gray-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>

        {/* Logo */}
        <Link
          href={buildHref("/dashboard")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="relative h-8 w-8 shrink-0">
            <Image
              src="/club19-wordmark.png"
              alt="Club 19 London"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="font-serif text-sm font-light tracking-wide text-gray-900">
            CLUB<span className="mx-0.5 text-gray-400">|</span>19
          </div>
        </Link>

        {/* Search + User Button */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-700 active:bg-gray-100 transition-colors"
            aria-label="Search sales"
          >
            <Search size={20} />
          </button>
          <div className="flex items-center justify-center w-10 h-10">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <nav className="flex items-stretch h-14">
          {tabs.map((tab) => {
            const active = isTabActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={buildHref(tab.href)}
                className={`
                  flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px]
                  transition-colors active:bg-gray-50
                  ${active ? "text-gray-900" : "text-gray-400"}
                `}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span
                  className={`text-[10px] leading-tight ${active ? "font-semibold" : "font-medium"}`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Search Overlay ── */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── Drawer Overlay ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl flex flex-col animate-slide-in-left">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-white/10 shrink-0 bg-club19-navy">
              <Link
                href="/dashboard"
                className="flex items-center gap-2"
                onClick={() => setDrawerOpen(false)}
              >
                <div className="relative h-8 w-8 shrink-0">
                  <Image
                    src="/club19-wordmark.png"
                    alt="Club 19 London"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="flex flex-col leading-tight">
                  <div className="font-serif text-sm font-light tracking-wide text-club19-cream">
                    CLUB<span className="mx-0.5 text-club19-taupe">|</span>19
                  </div>
                  <div className="font-sans text-[8px] uppercase tracking-[0.15em] text-club19-taupe">
                    ATELIER
                  </div>
                </div>
              </Link>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-club19-cream/60 hover:text-club19-cream hover:bg-white/5 transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Role Badge */}
            <div className="px-5 py-3 bg-club19-navy border-b border-white/10">
              <span className="text-xs font-medium text-club19-taupe uppercase tracking-wide">
                {viewAs ? `Viewing as: ${role}` : role}
              </span>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 bg-club19-navy">
              <ul className="space-y-0.5">
                {allNavItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon
                    ? iconMap[item.icon as keyof typeof iconMap]
                    : null;

                  return (
                    <li key={item.href}>
                      <Link
                        href={buildHref(item.href)}
                        onClick={() => setDrawerOpen(false)}
                        className={`
                          flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium
                          transition-colors duration-150 min-h-[44px]
                          ${
                            active
                              ? "bg-white/10 text-club19-cream border-l-2 border-club19-taupe"
                              : "text-club19-cream/70 hover:text-club19-cream hover:bg-white/5 active:bg-white/10"
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

            {/* Drawer Footer */}
            <div className="p-4 border-t border-white/10 shrink-0 bg-club19-navy">
              <p className="text-xs text-club19-taupe text-center">
                Club 19 Atelier
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
