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

  // Generate last 12 months options
  const generateMonthOptions = () => {
    const options: { value: string; label: string }[] = [
      { value: "current", label: "This Month" },
      { value: "last", label: "Last Month" },
      { value: "all", label: "All Time" },
    ];

    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });

      // Skip if this is current month (already have "This Month")
      if (i === 0) continue;

      // Skip if this is last month (already have "Last Month")
      if (i === 1) continue;

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
          h-10 pl-3 pr-10 py-2
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
