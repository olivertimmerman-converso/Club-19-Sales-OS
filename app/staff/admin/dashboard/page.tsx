/**
 * Club 19 Sales OS - Admin Dashboard
 *
 * Complete admin dashboard with KPIs, analytics, and latest sales
 */

"use client";

import { useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuthenticityBadge } from "@/components/ui/AuthenticityBadge";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { SaleDetailModal } from "@/components/modals/SaleDetailModal";
import { getSalesSummary, getSalesAnalyticsOverview } from "@/lib/api/sales";
import { getErrorGroups } from "@/lib/api/errors";
import type { SaleSummary, AnalyticsOverview } from "@/lib/api/sales";
import type { ErrorGroupsSummary } from "@/lib/api/errors";
import {
  TrendingUp,
  DollarSign,
  Percent,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  ShoppingBag,
  Users,
  Building2,
  User,
  AlertCircle as AlertCircleIcon,
} from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [errors, setErrors] = useState<ErrorGroupsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleSummary | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, analyticsData, errorsData] = await Promise.all([
        getSalesSummary(),
        getSalesAnalyticsOverview(),
        getErrorGroups(),
      ]);

      setSales(summaryData.sales);
      setAnalytics(analyticsData);
      setErrors(errorsData);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Admin Dashboard"
          subtitle="Overview of all sales operations and team performance"
        />
        <PageSection>
          <LoadingBlock message="Loading dashboard..." />
        </PageSection>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          title="Admin Dashboard"
          subtitle="Overview of all sales operations and team performance"
        />
        <PageSection>
          <ErrorBlock message={error} onRetry={fetchData} />
        </PageSection>
      </div>
    );
  }

  if (!analytics || !errors) {
    return null;
  }

  // Get latest 10 sales sorted by date
  const latestSales = [...sales]
    .sort((a, b) => {
      const dateA = a.invoice_due_date ? new Date(a.invoice_due_date).getTime() : 0;
      const dateB = b.invoice_due_date ? new Date(b.invoice_due_date).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 10);

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

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div>
      <TopLoadingBar isLoading={loading} />
      <Breadcrumbs items={[{ label: "Dashboard" }]} />
      <PageHeader
        title="Admin Dashboard"
        subtitle="Company-wide KPIs, sales analytics, and team performance"
        actions={
          <Link
            href="/trade/new"
            className="px-4 py-2 bg-[#0A0A0A] text-white rounded-lg hover:bg-[#0A0A0A]/90 transition-colors font-medium"
          >
            Create New Sale
          </Link>
        }
      />

      {/* Section A: Sales Performance */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total Sales"
            value={analytics.total_sales_count}
            icon={ShoppingBag}
            subtitle="all time"
          />
          <MetricCard
            title="Total Revenue"
            value={formatCurrency(analytics.total_revenue_inc_vat)}
            icon={DollarSign}
            subtitle="inc VAT"
          />
          <MetricCard
            title="Total Margin"
            value={formatCurrency(analytics.total_margin)}
            icon={TrendingUp}
            subtitle="commissionable"
          />
          <MetricCard
            title="Avg Margin"
            value={formatPercent(analytics.average_margin_percent)}
            icon={Percent}
            subtitle="across all sales"
          />
        </div>
      </div>

      {/* Section B: Payment & Lifecycle */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment & Lifecycle</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Paid Sales"
            value={analytics.count_paid}
            icon={CheckCircle}
            subtitle="completed"
          />
          <MetricCard
            title="Unpaid Sales"
            value={analytics.count_unpaid}
            icon={XCircle}
            subtitle="outstanding"
          />
          <MetricCard
            title="Overdue Sales"
            value={analytics.count_overdue}
            icon={AlertTriangle}
            subtitle="past due date"
          />
          <MetricCard
            title="B2B Sales"
            value={analytics.b2b_sales_count}
            icon={Building2}
            subtitle={`End Client: ${analytics.end_client_sales_count}`}
          />
        </div>
      </div>

      {/* Section C: Authenticity & Errors */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Authenticity & Errors</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="High Risk Items"
            value={analytics.authenticity_high_risk_count}
            icon={Shield}
            subtitle="authenticity issues"
          />
          <MetricCard
            title="Missing Receipts"
            value={analytics.authenticity_missing_receipt_count}
            icon={AlertCircleIcon}
            subtitle="need supplier docs"
          />
          <MetricCard
            title="Total Errors"
            value={errors.total_errors}
            icon={AlertCircleIcon}
            subtitle={`${errors.unresolved_errors} unresolved`}
          />
          <MetricCard
            title="Team Members"
            value={analytics.end_client_sales_count + analytics.b2b_sales_count}
            icon={Users}
            subtitle="active shoppers"
          />
        </div>
      </div>

      {/* Latest 10 Sales Table */}
      <PageSection title="Latest Sales">
        {latestSales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No sales yet. Start creating invoices to see them here!</p>
          </div>
        ) : (
          <>
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
                      Supplier
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                      Amount
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
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                      Authenticity
                    </th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                      Errors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {latestSales.map((sale, idx) => {
                    const errorCount = sale.errors.length + sale.warnings.length;
                    const hasErrors = errorCount > 0;

                    return (
                      <tr
                        key={sale.sale_id}
                        onClick={() => setSelectedSale(sale)}
                        className="even:bg-gray-50 hover:bg-[#F3DFA2]/10 cursor-pointer transition-colors duration-200"
                      >
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="font-medium text-gray-900">
                            {sale.sale_reference}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="text-gray-900">{sale.buyer_name}</span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="text-gray-900">{sale.supplier_name}</span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="text-sm text-gray-600 capitalize">
                            {sale.buyer_type.replace("_", " ")}
                          </span>
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
                          <span className="text-sm text-gray-900">
                            {formatDate(sale.invoice_due_date)}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <AuthenticityBadge
                            authenticity_status={sale.authenticity_status}
                            authenticity_risk={
                              sale.authenticity_risk as
                                | "clean"
                                | "missing_receipt"
                                | "not_verified"
                                | "high_risk"
                            }
                          />
                        </td>
                        <td className="px-4 py-2 text-center whitespace-nowrap">
                          {hasErrors ? (
                            <div className="flex items-center justify-center gap-1">
                              <AlertCircleIcon size={16} className="text-red-600" />
                              <span className="text-sm font-medium text-red-600">
                                {errorCount}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/staff/admin/sales"
                className="inline-block px-6 py-2 text-[#0A0A0A] border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                View All Sales
              </Link>
            </div>
          </>
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
