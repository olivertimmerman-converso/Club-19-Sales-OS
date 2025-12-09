/**
 * Club 19 Sales OS - View As Selector Component
 *
 * Allows superadmin to preview different user role experiences
 * Client component for role switching via URL params
 */

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

interface ViewAsOption {
  value: string;
  label: string;
}

const VIEW_AS_OPTIONS: ViewAsOption[] = [
  { value: "superadmin", label: "Superadmin" },
  { value: "founder", label: "Founder" },
  { value: "operations", label: "Operations (Alys)" },
  { value: "shopper-hope", label: "Shopper (Hope)" },
  { value: "shopper-mc", label: "Shopper (MC)" },
];

export function ViewAsSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentView = searchParams.get("viewAs") || "superadmin";

  const handleViewChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "superadmin") {
      params.delete("viewAs");
    } else {
      params.set("viewAs", value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  // Get current label
  const getCurrentLabel = () => {
    const option = VIEW_AS_OPTIONS.find((opt) => opt.value === currentView);
    return option?.label || "Superadmin";
  };

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">
        Viewing as:
      </label>
      <div className="relative">
        <select
          value={currentView}
          onChange={(e) => handleViewChange(e.target.value)}
          className="
            appearance-none
            pl-3 pr-8 py-1.5
            bg-white border border-gray-300 rounded-md
            text-sm font-medium text-gray-700
            hover:bg-gray-50 hover:border-gray-400
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
            transition-colors
            cursor-pointer
          "
        >
          {VIEW_AS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
          size={14}
        />
      </div>
    </div>
  );
}
