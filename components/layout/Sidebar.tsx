/**
 * Club 19 Sales OS - Staff Interface Sidebar
 *
 * Black + Gold premium sidebar navigation
 * Role-based menu items using RBAC system
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useNavigationItems, useUserRole } from "@/lib/rbac-client";
import { ROLE_CONFIG } from "@/lib/rbac";
import { useState } from "react";
import {
  LayoutDashboard,
  Briefcase,
  DollarSign,
  Shield,
  Calculator,
  Settings,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Briefcase,
  DollarSign,
  Shield,
  Calculator,
  Settings,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const navItems = useNavigationItems();
  const role = useUserRole();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const roleLabel = role ? ROLE_CONFIG[role]?.label : "Guest";

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href) ? prev.filter((item) => item !== href) : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    if (href === pathname) return true;
    if (pathname.startsWith(href + "/")) return true;
    return false;
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-[#0A0A0A] border-r border-[#F3DFA2]/20
          transform transition-transform duration-300 ease-in-out z-50
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[#F3DFA2]/20">
            <Link href="/staff/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
              {/* Club 19 Logo */}
              <div className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden bg-white/5">
                <Image
                  src="/club19-wordmark.png"
                  alt="Club 19 London"
                  fill
                  className="object-contain p-1"
                  priority
                />
              </div>

              {/* Text Lockup */}
              <div className="flex flex-col leading-tight">
                <div className="font-serif text-lg font-light leading-tight tracking-wide text-[#F3DFA2]">
                  CLUB<span className="mx-1 text-[#F3DFA2]/40">|</span>19
                </div>
                <div className="font-sans text-[9px] uppercase tracking-[0.15em] text-[#F3DFA2]/60 mt-0.5">
                  SALES OS
                </div>
              </div>
            </Link>
            <button
              onClick={onClose}
              className="lg:hidden text-[#F3DFA2] hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Role Badge */}
          <div className="px-6 py-4 bg-[#F3DFA2]/5">
            <div className="text-xs text-[#F3DFA2]/60 uppercase tracking-wide">
              Role
            </div>
            <div className="text-sm font-semibold text-[#F3DFA2] mt-1">
              {roleLabel}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon ? iconMap[item.icon] : LayoutDashboard;
              const active = isActive(item.href);
              const hasChildren = item.children && item.children.length > 0;
              const isExpanded = expandedItems.includes(item.href);

              return (
                <div key={item.href}>
                  {/* Parent Item */}
                  {hasChildren ? (
                    <button
                      onClick={() => toggleExpanded(item.href)}
                      className={`
                        w-full flex items-center justify-between px-4 py-3 rounded-lg
                        transition-all duration-200
                        ${
                          active
                            ? "bg-[#F3DFA2]/10 text-[#F3DFA2] border border-[#F3DFA2]/30"
                            : "text-[#F3DFA2]/70 hover:bg-[#F3DFA2]/5 hover:text-[#F3DFA2]"
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={20} />
                        <span className="font-medium">{item.label}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg
                        transition-all duration-200
                        ${
                          active
                            ? "bg-[#F3DFA2]/10 text-[#F3DFA2] border border-[#F3DFA2]/30"
                            : "text-[#F3DFA2]/70 hover:bg-[#F3DFA2]/5 hover:text-[#F3DFA2]"
                        }
                      `}
                    >
                      <Icon size={20} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )}

                  {/* Child Items */}
                  {hasChildren && isExpanded && (
                    <div className="mt-2 ml-4 space-y-1 border-l border-[#F3DFA2]/20 pl-4">
                      {item.children?.map((child) => {
                        const childActive = isActive(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onClose}
                            className={`
                              block px-4 py-2 rounded-lg text-sm
                              transition-all duration-200
                              ${
                                childActive
                                  ? "bg-[#F3DFA2]/10 text-[#F3DFA2] font-medium"
                                  : "text-[#F3DFA2]/60 hover:bg-[#F3DFA2]/5 hover:text-[#F3DFA2]"
                              }
                            `}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-6 border-t border-[#F3DFA2]/20">
            <p className="text-xs text-[#F3DFA2]/40 text-center">
              Club 19 Sales OS v1.0
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
