/**
 * Club 19 Sales OS - Supplier Contribution Chart
 *
 * Bar chart showing top suppliers by sales
 */

"use client";

import { SupplierData } from "@/lib/legacyData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SupplierContributionChartProps {
  data: SupplierData[];
}

export function SupplierContributionChart({ data }: SupplierContributionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Suppliers</h3>
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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Suppliers</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            tickFormatter={(value: number) => formatCurrency(value)}
          />
          <YAxis
            type="category"
            dataKey="supplier"
            stroke="#6b7280"
            style={{ fontSize: "11px" }}
            width={120}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [formatCurrency(value), "Sales"]}
          />
          <Legend />
          <Bar dataKey="sales" fill="#6366f1" name="Sales" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
