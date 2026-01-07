/**
 * Club 19 Sales OS - Shopper Dashboard
 *
 * Dashboard for shopper role showing personal KPIs and recent sales
 */

"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { SaleDetailModal } from "@/components/modals/SaleDetailModal";
import {
  getShopperSalesSummary,
  computeShopperMetrics,
  type ShopperMetrics,
} from "@/lib/api/shoppers";
import type { SaleSummary } from "@/lib/api/sales";
import {
  TrendingUp,
  DollarSign,
  Percent,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";

export default function ShopperDashboardPage() {
  const { user } = useUser();
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [metrics, setMetrics] = useState<ShopperMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleSummary | null>(null);

  const fetchData = async () => {
    if (!user?.fullName) {
      setError("Unable to identify user");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const shopperSales = await getShopperSalesSummary(user.fullName);
      const shopperMetrics = computeShopperMetrics(shopperSales);

      setSales(shopperSales);
      setMetrics(shopperMetrics);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <div>
        <PageHeader title="My Dashboard" subtitle="Overview of your current month" />
        <PageSection>
          <LoadingBlock message="Loading your dashboard..." />
        </PageSection>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="My Dashboard" subtitle="Overview of your current month" />
        <PageSection>
          <ErrorBlock message={error} onRetry={fetchData} />
        </PageSection>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  // Sort sales by date (most recent first) and take last 5
  const recentSales = [...sales]
    .sort((a, b) => {
      const dateA = a.invoice_due_date ? new Date(a.invoice_due_date).getTime() : 0;
      const dateB = b.invoice_due_date ? new Date(b.invoice_due_date).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div>
      <TopLoadingBar isLoading={loading} />
      <Breadcrumbs items={[{ label: "Dashboard" }]} />
      <PageHeader
        title="My Dashboard"
        subtitle={`Welcome back, ${user?.firstName || user?.fullName}! Here's your sales overview.`}
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total Sales"
          value={metrics.total_sales}
          icon={ShoppingBag}
          subtitle="this month"
        />
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.total_revenue)}
          icon={DollarSign}
          subtitle="inc VAT"
        />
        <MetricCard
          title="Total Margin"
          value={formatCurrency(metrics.total_margin)}
          icon={TrendingUp}
          subtitle="commissionable"
        />
        <MetricCard
          title="Avg Margin"
          value={formatPercent(metrics.average_margin_percent)}
          icon={Percent}
          subtitle="across all sales"
        />
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard title="Paid Sales" value={metrics.paid_sales} icon={CheckCircle} />
        <MetricCard title="Unpaid Sales" value={metrics.unpaid_sales} icon={XCircle} />
        <MetricCard
          title="Overdue Sales"
          value={metrics.overdue_sales}
          icon={AlertTriangle}
        />
        <MetricCard
          title="Authenticity Issues"
          value={metrics.authenticity_issues}
          icon={Shield}
        />
      </div>

      {/* Recent Sales Table */}
      <PageSection title="Recent Sales">
        {recentSales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No sales yet. Start creating invoices to see them here!</p>
            <Link
              href="/trade/new"
              className="inline-block mt-4 px-6 py-2 bg-[#0A0A0A] text-white rounded-lg hover:bg-[#0A0A0A]/90 transition-colors"
            >
              Create New Sale
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto relative shadow-sm rounded-xl border border-gray-200 bg-white table-scroll-shadow">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Sale Ref
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Buyer
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Amount (Inc VAT)
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Margin %
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Commission
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Due Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale, idx) => (
                  <tr
                    key={sale.sale_id}
                    onClick={() => setSelectedSale(sale)}
                    className="even:bg-gray-50 hover:bg-[#F3DFA2]/10 cursor-pointer transition-colors duration-200"
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{sale.sale_reference}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="text-gray-900">{sale.buyer_name}</span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <StatusBadge
                        status={
                          sale.status as
                            | "draft"
                            | "invoiced"
                            | "paid"
                            | "locked"
                            | "commission_paid"
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <span className="font-medium text-gray-900">
                        {formatCurrency(sale.sale_amount_inc_vat)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          sale.margin_percent > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatPercent(sale.margin_percent)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <span className="font-medium text-[#F3DFA2]">
                        {formatCurrency(sale.commission_amount)}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {sale.invoice_due_date ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">
                            {new Date(sale.invoice_due_date).toLocaleDateString("en-GB")}
                          </span>
                          {sale.is_overdue && (
                            <span className="text-xs text-red-600 font-semibold">
                              {sale.days_overdue} days overdue
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {recentSales.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              href="/staff/shopper/sales"
              className="inline-block px-6 py-2 text-[#0A0A0A] border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              View All Sales
            </Link>
          </div>
        )}
      </PageSection>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          isOpen={!!selectedSale}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </div>
  );
}
