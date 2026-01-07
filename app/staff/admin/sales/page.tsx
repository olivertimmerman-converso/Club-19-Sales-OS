/**
 * Club 19 Sales OS - Admin Sales List
 *
 * Complete sales list with advanced filtering and search
 */

"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuthenticityBadge } from "@/components/ui/AuthenticityBadge";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { SaleDetailModal } from "@/components/modals/SaleDetailModal";
import { getSalesSummary } from "@/lib/api/sales";
import type { SaleSummary } from "@/lib/api/sales";
import { Search, AlertCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function AdminSalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleSummary | null>(null);

  // Filter states - initialize from URL
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "all");
  const [buyerTypeFilter, setBuyerTypeFilter] = useState<string>(searchParams.get("buyer_type") || "all");
  const [authenticityRiskFilter, setAuthenticityRiskFilter] = useState<string>(searchParams.get("auth") || "all");

  // Update URL when filters change
  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!value || value === "all" || value.trim() === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.push(`?${params.toString()}`);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const summaryData = await getSalesSummary();
      setSales(summaryData.sales);
    } catch (err: any) {
      setError(err.message || "Failed to load sales data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Client-side filtering
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Search filter (buyer or supplier)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesBuyer = sale.buyer_name.toLowerCase().includes(query);
        const matchesSupplier = sale.supplier_name.toLowerCase().includes(query);
        if (!matchesBuyer && !matchesSupplier) return false;
      }

      // Status filter
      if (statusFilter !== "all" && sale.status !== statusFilter) {
        return false;
      }

      // Buyer type filter
      if (buyerTypeFilter !== "all" && sale.buyer_type !== buyerTypeFilter) {
        return false;
      }

      // Authenticity risk filter
      if (authenticityRiskFilter !== "all" && sale.authenticity_risk !== authenticityRiskFilter) {
        return false;
      }

      return true;
    });
  }, [sales, searchQuery, statusFilter, buyerTypeFilter, authenticityRiskFilter]);

  // Sort by date descending
  const sortedSales = useMemo(() => {
    return [...filteredSales].sort((a, b) => {
      const dateA = a.invoice_due_date ? new Date(a.invoice_due_date).getTime() : 0;
      const dateB = b.invoice_due_date ? new Date(b.invoice_due_date).getTime() : 0;
      return dateB - dateA;
    });
  }, [filteredSales]);

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

  // Check if sale has economics_sanity errors
  const hasEconomicsSanityError = (sale: SaleSummary) => {
    return Object.keys(sale.error_groups).some((key) => key === "economics_sanity");
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          title="All Sales"
          subtitle="View and manage all sales across the organization"
        />
        <PageSection>
          <LoadingBlock message="Loading sales data..." />
        </PageSection>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          title="All Sales"
          subtitle="View and manage all sales across the organization"
        />
        <PageSection>
          <ErrorBlock message={error} onRetry={fetchData} />
        </PageSection>
      </div>
    );
  }

  return (
    <div>
      <TopLoadingBar isLoading={loading} />
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/staff/admin/dashboard" },
          { label: "All Sales" },
        ]}
      />
      <PageHeader
        title="All Sales"
        subtitle={`${sales.length} total sales • ${filteredSales.length} shown`}
        actions={
          <Link
            href="/trade/new"
            className="px-4 py-2 bg-[#0A0A0A] text-white rounded-lg hover:bg-[#0A0A0A]/90 transition-colors font-medium"
          >
            Create New Sale
          </Link>
        }
      />

      {/* Filters */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search by buyer or supplier..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                updateFilters("search", e.target.value);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F3DFA2] focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              updateFilters("status", e.target.value);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F3DFA2] focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
            <option value="locked">Locked</option>
            <option value="commission_paid">Commission Paid</option>
          </select>

          {/* Buyer Type Filter */}
          <select
            value={buyerTypeFilter}
            onChange={(e) => {
              setBuyerTypeFilter(e.target.value);
              updateFilters("buyer_type", e.target.value);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F3DFA2] focus:border-transparent"
          >
            <option value="all">All Buyer Types</option>
            <option value="end_client">End Client</option>
            <option value="b2b">B2B</option>
          </select>

          {/* Authenticity Risk Filter */}
          <select
            value={authenticityRiskFilter}
            onChange={(e) => {
              setAuthenticityRiskFilter(e.target.value);
              updateFilters("auth", e.target.value);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F3DFA2] focus:border-transparent"
          >
            <option value="all">All Authenticity Risks</option>
            <option value="clean">Clean</option>
            <option value="missing_receipt">Missing Receipt</option>
            <option value="not_verified">Not Verified</option>
            <option value="high_risk">High Risk</option>
          </select>
        </div>
        <div className="mt-4 text-right">
          <button
            onClick={() => {
              router.push(window.location.pathname);
              setSearchQuery("");
              setStatusFilter("all");
              setBuyerTypeFilter("all");
              setAuthenticityRiskFilter("all");
            }}
            className="text-sm text-gray-600 hover:text-black underline"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Sales Table */}
      <PageSection>
        {sortedSales.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">
              {sales.length === 0
                ? "No sales yet. Start creating invoices to see them here!"
                : "No sales match your filters."}
            </p>
            {sales.length === 0 && (
              <Link
                href="/trade/new"
                className="inline-block px-6 py-2 bg-[#0A0A0A] text-white rounded-lg hover:bg-[#0A0A0A]/90 transition-colors"
              >
                Create New Sale
              </Link>
            )}
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
                    Supplier
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs whitespace-nowrap">
                    Status
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
                {sortedSales.map((sale, idx) => {
                  const hasErrors = sale.errors.length > 0 || sale.warnings.length > 0;
                  const errorCount = sale.errors.length + sale.warnings.length;
                  const hasEconSanityError = hasEconomicsSanityError(sale);

                  return (
                    <tr
                      key={sale.sale_id}
                      onClick={() => setSelectedSale(sale)}
                      className="even:bg-gray-50 hover:bg-[#F3DFA2]/10 cursor-pointer transition-colors duration-200"
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{sale.sale_reference}</span>
                          {hasEconSanityError && (
                            <span title="Economics sanity warning">
                              <AlertTriangle
                                size={16}
                                className="text-orange-600"
                              />
                            </span>
                          )}
                        </div>
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
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">
                            {formatDate(sale.invoice_due_date)}
                          </span>
                          {sale.is_overdue && (
                            <span className="text-xs text-red-600 font-semibold">
                              {sale.days_overdue} days overdue
                            </span>
                          )}
                        </div>
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
                            <AlertCircle size={16} className="text-red-600" />
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
