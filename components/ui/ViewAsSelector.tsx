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
  { value: "superadmin", label: "Superadmin (Ollie)" },
  { value: "founder", label: "Founder (Sophie)" },
  { value: "operations", label: "Operations (Alys)" },
  { value: "shopper-hope-peverell", label: "Shopper (Hope)" },
  { value: "shopper-mary-clair-bromfield", label: "Shopper (MC)" },
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
    return option?.label || "Superadmin (Ollie)";
  };

  return (
    <div className="relative">
      <select
        value={currentView}
        onChange={(e) => handleViewChange(e.target.value)}
        className="
          appearance-none
          h-10 pl-4 pr-10 py-2 min-w-[180px]
          bg-white border border-gray-200 rounded-lg
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
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500"
        size={16}
      />
    </div>
  );
}
