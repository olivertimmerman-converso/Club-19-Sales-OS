/**
 * Club 19 Atelier - Metric Card Component
 *
 * KPI card for dashboard metrics with taupe accent
 */

import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

export function MetricCard({ title, value, icon: Icon, subtitle, trend }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-club19-warmgrey p-5 sm:p-6 shadow-subtle hover:shadow-md transition-shadow duration-150">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-sans font-medium text-club19-taupe mb-1">{title}</p>
          <p className="text-3xl font-serif font-semibold text-club19-navy mb-1">{value}</p>
          {subtitle && <p className="text-xs font-sans text-club19-taupe">{subtitle}</p>}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={`text-xs font-medium ${
                  trend.isPositive ? "text-green-700" : "text-red-700"
                }`}
              >
                {trend.value}
              </span>
              <span className="text-xs text-club19-taupe">vs last month</span>
            </div>
          )}
        </div>
        <div className="w-12 h-12 bg-club19-cream rounded-xl flex items-center justify-center">
          <Icon size={24} className="text-club19-taupe" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
