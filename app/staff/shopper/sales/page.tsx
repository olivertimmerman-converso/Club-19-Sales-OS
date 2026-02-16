/**
 * Club 19 Sales OS - Shopper Sales List
 *
 * Full list of sales for shopper with filters and sorting
 * Includes "Claimable Sales" section for self-claiming unallocated invoices
 */

"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSection } from "@/components/ui/PageSection";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuthenticityBadge } from "@/components/ui/AuthenticityBadge";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { SaleDetailModal } from "@/components/modals/SaleDetailModal";
import { getShopperSalesList } from "@/lib/api/shoppers";
import type { SaleSummary } from "@/lib/api/sales";
import { Search, AlertCircle, CheckCircle, Inbox, ClipboardList, PartyPopper } from "lucide-react";
import Link from "next/link";
import { getCompletionColor } from "@/lib/completeness";

// Type for claimable sales from API
interface ClaimableSale {
  id: string;
  xero_invoice_number: string | null;
  xero_invoice_id: string | null;
  sale_date: string | null;
  sale_amount_inc_vat: number;
  currency: string;
  buyer_name: string;
  buyer_id: string | null;
  buyer_has_owner: boolean;
  invoice_status: string | null;
}

// Type for incomplete sales from API
interface IncompleteSale {
  id: string;
  sale_reference: string | null;
  xero_invoice_number: string | null;
  sale_date: string | null;
  sale_amount_inc_vat: number;
  currency: string;
  buyer_name: string;
  buyer_id: string | null;
  completeness: {
    percentage: number;
    missing_fields: string[];
    missing_required: string[];
  };
}

export default function ShopperSalesPage() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleSummary | null>(null);

  // Claimable sales state
  const [claimableSales, setClaimableSales] = useState<ClaimableSale[]>([]);
  const [claimableLoading, setClaimableLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Incomplete sales state
  const [incompleteSales, setIncompleteSales] = useState<IncompleteSale[]>([]);
  const [incompleteLoading, setIncompleteLoading] = useState(true);

  // Filter states - initialize from URL
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "all");
  const [buyerTypeFilter, setBuyerTypeFilter] = useState<string>(searchParams.get("buyer_type") || "all");

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

  // Fetch claimable sales
  const fetchClaimableSales = useCallback(async () => {
    try {
      setClaimableLoading(true);
      const response = await fetch("/api/sales/claimable");
      if (!response.ok) {
        throw new Error("Failed to fetch claimable sales");
      }
      const data = await response.json();
      setClaimableSales(data.sales || []);
    } catch (err: any) {
      console.error("Error fetching claimable sales:", err);
      // Don't show error to user - just hide the section
      setClaimableSales([]);
    } finally {
      setClaimableLoading(false);
    }
  }, []);

  // Fetch incomplete sales
  const fetchIncompleteSales = useCallback(async () => {
    try {
      setIncompleteLoading(true);
      const response = await fetch("/api/sales/incomplete");
      if (!response.ok) {
        throw new Error("Failed to fetch incomplete sales");
      }
      const data = await response.json();
      setIncompleteSales(data.sales || []);
    } catch (err: any) {
      console.error("Error fetching incomplete sales:", err);
      // Don't show error to user - just hide the section
      setIncompleteSales([]);
    } finally {
      setIncompleteLoading(false);
    }
  }, []);

  // Fetch shopper's own sales
  const fetchData = useCallback(async () => {
    if (!user?.fullName) {
      setError("Unable to identify user");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const shopperSales = await getShopperSalesList(user.fullName);
      setSales(shopperSales);
    } catch (err: any) {
      setError(err.message || "Failed to load sales data");
    } finally {
      setLoading(false);
    }
  }, [user?.fullName]);

  // Claim a sale
  const handleClaim = async (saleId: string) => {
    setClaimingId(saleId);
    setClaimError(null);
    setClaimSuccess(null);

    try {
      const response = await fetch(`/api/sales/${saleId}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to claim sale");
      }

      // Success! Remove from claimable list and refresh main sales
      setClaimableSales((prev) => prev.filter((s) => s.id !== saleId));
      setClaimSuccess("Sale claimed successfully!");

      // Refresh the main sales list and incomplete list
      fetchData();
      fetchIncompleteSales();

      // Clear success message after 3 seconds
      setTimeout(() => setClaimSuccess(null), 3000);
    } catch (err: any) {
      setClaimError(err.message || "Failed to claim sale");
      // Clear error after 5 seconds
      setTimeout(() => setClaimError(null), 5000);
    } finally {
      setClaimingId(null);
    }
  };

  useEffect(() => {
    fetchData();
    fetchClaimableSales();
    fetchIncompleteSales();
  }, [fetchData, fetchClaimableSales, fetchIncompleteSales]);

  // Client-side filtering
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesRef = sale.sale_reference.toLowerCase().includes(query);
        const matchesBuyer = sale.buyer_name.toLowerCase().includes(query);
        if (!matchesRef && !matchesBuyer) return false;
      }

      // Status filter
      if (statusFilter !== "all" && sale.status !== statusFilter) {
        return false;
      }

      // Buyer type filter
      if (buyerTypeFilter !== "all" && sale.buyer_type !== buyerTypeFilter) {
        return false;
      }

      return true;
    });
  }, [sales, searchQuery, statusFilter, buyerTypeFilter]);

  // Sort by date descending
  const sortedSales = useMemo(() => {
    return [...filteredSales].sort((a, b) => {
      const dateA = a.invoice_due_date ? new Date(a.invoice_due_date).getTime() : 0;
      const dateB = b.invoice_due_date ? new Date(b.invoice_due_date).getTime() : 0;
      return dateB - dateA;
    });
  }, [filteredSales]);

  const formatCurrency = (value: number, currency: string = "GBP") => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="My Sales" subtitle="View and manage all your sales" />
        <PageSection>
          <LoadingBlock message="Loading your sales..." />
        </PageSection>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="My Sales" subtitle="View and manage all your sales" />
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
          { label: "Dashboard", href: "/staff/shopper/dashboard" },
          { label: "My Sales" },
        ]}
      />
      <PageHeader
        title="My Sales"
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

      {/* Claimable Sales Section */}
      {!claimableLoading && claimableSales.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Inbox className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Sales to Review
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                  {claimableSales.length}
                </span>
              </h2>
              <p className="text-sm text-gray-600">
                These invoices from Xero might be yours. Claim them to add to your sales.
              </p>
            </div>
          </div>

          {/* Success/Error Messages */}
          {claimSuccess && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700">{claimSuccess}</span>
            </div>
          )}
          {claimError && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-700">{claimError}</span>
            </div>
          )}

          {/* Claimable Sales Table */}
          <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-amber-50/50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs">
                    Invoice
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs">
                    Buyer
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 uppercase tracking-wide text-xs">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 uppercase tracking-wide text-xs">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700 uppercase tracking-wide text-xs">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claimableSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900">
                        {sale.xero_invoice_number || "No Invoice #"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-gray-900 font-medium">{sale.buyer_name}</span>
                        {sale.buyer_has_owner && (
                          <span className="text-xs text-green-600">Your client</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-600">{formatDate(sale.sale_date)}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-medium text-gray-900">
                        {formatCurrency(sale.sale_amount_inc_vat, sale.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {sale.invoice_status || "Unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleClaim(sale.id)}
                        disabled={claimingId === sale.id}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {claimingId === sale.id ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Claiming...
                          </>
                        ) : (
                          "Claim This Sale"
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Incomplete Sales Section */}
      {!incompleteLoading && incompleteSales.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-100 rounded-lg">
              <ClipboardList className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Incomplete Sales
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-800 rounded-full">
                  {incompleteSales.length}
                </span>
              </h2>
              <p className="text-sm text-gray-600">
                These sales need additional data for accurate margin and commission calculations.
              </p>
            </div>
          </div>

          {/* Incomplete Sales Cards */}
          <div className="space-y-3">
            {incompleteSales.map((sale) => (
              <div
                key={sale.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Sale Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {sale.sale_reference || sale.xero_invoice_number || "No Reference"}
                      </span>
                      <span className="text-sm text-gray-500">•</span>
                      <span className="text-sm text-gray-600">{sale.buyer_name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <span>{formatDate(sale.sale_date)}</span>
                      <span>•</span>
                      <span className="font-medium">{formatCurrency(sale.sale_amount_inc_vat, sale.currency)}</span>
                    </div>
                    {/* Missing Fields */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sale.completeness.missing_required.slice(0, 3).map((field) => (
                        <span
                          key={field}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700"
                        >
                          {field}
                        </span>
                      ))}
                      {sale.completeness.missing_required.length > 3 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          +{sale.completeness.missing_required.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Completion Bar & Button */}
                  <div className="flex items-center gap-4">
                    {/* Completion Progress */}
                    <div className="w-24">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Complete</span>
                        <span className="font-medium text-gray-700">{sale.completeness.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getCompletionColor(sale.completeness.percentage)}`}
                          style={{ width: `${sale.completeness.percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Complete Button */}
                    <Link
                      href={`/sales/${sale.id}/complete`}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-slate-600 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors whitespace-nowrap"
                    >
                      Complete Data
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Caught Up Empty State */}
      {!claimableLoading && !incompleteLoading && claimableSales.length === 0 && incompleteSales.length === 0 && (
        <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-green-100 rounded-full mb-4">
              <PartyPopper className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-green-900 mb-2">
              You&apos;re all caught up!
            </h2>
            <p className="text-green-700 max-w-md">
              No pending sales to claim and all your data is complete. Enjoy your day!
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search by sale ref or buyer..."
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
        </div>
        <div className="mt-4 text-right">
          <button
            onClick={() => {
              router.push(window.location.pathname);
              setSearchQuery("");
              setStatusFilter("all");
              setBuyerTypeFilter("all");
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
                    Date
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

                  return (
                    <tr
                      key={sale.sale_id}
                      onClick={() => setSelectedSale(sale)}
                      className="even:bg-gray-50 hover:bg-[#F3DFA2]/10 cursor-pointer transition-colors duration-200"
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-medium text-gray-900">{sale.sale_reference}</span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-medium">{sale.buyer_name}</span>
                          <span className="text-xs text-gray-500">
                            Supplier: {sale.supplier_name}
                          </span>
                        </div>
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
