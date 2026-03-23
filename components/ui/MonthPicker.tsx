/**
 * Club 19 Sales OS - Month Picker Component
 *
 * Client component for selecting month filters
 * Uses URL searchParams for state persistence
 */

"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

interface MonthPickerProps {
  className?: string;
}

export function MonthPicker({ className = "" }: MonthPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentMonth = searchParams.get("month") || "current";

  const EARLIEST_MONTH = new Date(2026, 0, 1); // January 2026

  // Generate month options back to January 2026
  const generateMonthOptions = () => {
    const options: { value: string; label: string }[] = [
      { value: "current", label: "This Month" },
      { value: "last", label: "Last Month" },
      { value: "all", label: "All Time" },
    ];

    const now = new Date();
    for (let i = 2; ; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (date < EARLIEST_MONTH) break;
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      options.push({ value, label });
    }

    return options;
  };

  const options = generateMonthOptions();

  const handleMonthChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      params.delete("month");
    } else {
      params.set("month", value);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  // Get current label
  const getCurrentLabel = () => {
    const option = options.find((opt) => opt.value === currentMonth);
    return option?.label || "This Month";
  };

  return (
    <div className={`relative ${className}`}>
      <select
        value={currentMonth}
        onChange={(e) => handleMonthChange(e.target.value)}
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
        {options.map((option) => (
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
