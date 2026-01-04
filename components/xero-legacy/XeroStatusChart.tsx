/**
 * Club 19 Sales OS - Xero Status Chart
 *
 * Pie chart showing invoice status breakdown
 */

"use client";

import { InvoiceStatusData } from "@/lib/xeroLegacyData";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

interface XeroStatusChartProps {
  data: InvoiceStatusData[];
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
];

export function XeroStatusChart({ data }: XeroStatusChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status Breakdown</h3>
        <div className="flex items-center justify-center h-64 text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status Breakdown</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="status"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name }) => name}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
