import Link from "next/link";
// ORIGINAL XATA: import { XataClient } from "@/src/xata";
// ORIGINAL XATA: import type { SalesRecord } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers, buyers, suppliers, introducers } from "@/db/schema";
import { eq, and, or, gte, lte, desc, ne, isNull, isNotNull } from "drizzle-orm";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { ViewAsSelector } from "@/components/ui/ViewAsSelector";
import { getMonthDateRange } from "@/lib/dateUtils";
import { effectiveInvoiceValue } from "@/lib/economics";
// import { DashboardClientWrapper } from "./DashboardClientWrapper"; // Temporarily disabled

/**
 * Club 19 Sales OS - Superadmin Dashboard
 *
 * Server component that displays real metrics from the Sales table
 */

// ORIGINAL XATA: const xata = new XataClient();

interface SuperadminDashboardProps {
  monthParam?: string;
}

export async function SuperadminDashboard({ monthParam = "current" }: SuperadminDashboardProps) {
  // Get date range for filtering
  const dateRange = getMonthDateRange(monthParam);

  // Get current month name for display
  const currentDate = dateRange ? dateRange.start : new Date();
  const monthName = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // ORIGINAL XATA:
  // let salesQuery = xata.db.Sales
  //   .select([
  //     'sale_amount_inc_vat',
  //     'gross_margin',
  //     'commissionable_margin',
  //     'currency',
  //     'sale_date',
  //     'brand',
  //     'category',
  //     'item_title',
  //     'sale_reference',
  //     'invoice_status',
  //     'commission_paid',
  //     'commission_locked',
  //     'shopper.name',
  //     'shopper.id',
  //     'buyer.name',
  //     'supplier.id',
  //     'xero_invoice_number',
  //     'xero_payment_date',
  //     'invoice_paid_date',
  //     'needs_allocation',
  //     'dismissed',
  //     'id',
  //     'source',
  //     'deleted_at',
  //     'shipping_method',
  //     'shipping_cost_confirmed',
  //     'buy_price',
  //     'has_introducer',
  //     'introducer.id',
  //     'introducer.name',
  //     'introducer_commission',
  //   ]);
  // if (dateRange) {
  //   salesQuery = salesQuery.filter({
  //     sale_date: {
  //       $ge: dateRange.start,
  //       $le: dateRange.end,
  //     },
  //   });
  // }
  // const allSalesRaw = await salesQuery.sort('sale_date', 'desc').getMany({ pagination: { size: 200 } });

  // Commission timing: prefer completedAt, fall back to saleDate for legacy data
  const whereConditions = dateRange
    ? or(
        and(gte(sales.completedAt, dateRange.start), lte(sales.completedAt, dateRange.end)),
        and(isNull(sales.completedAt), gte(sales.saleDate, dateRange.start), lte(sales.saleDate, dateRange.end))
      )
    : undefined;

  // Pre-compute last month date range for parallel query
  const needsLastMonth = monthParam === "current" || !monthParam;
  const now = new Date();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Run both queries in parallel
  const [allSalesRaw, lastMonthSalesRaw] = await Promise.all([
    db.query.sales.findMany({
      where: whereConditions,
      with: { shopper: true, buyer: true, supplier: true, introducer: true },
      orderBy: [desc(sales.saleDate)],
      limit: 200,
    }),
    needsLastMonth
      ? db.query.sales.findMany({
          where: or(
            and(gte(sales.completedAt, lastMonthStart), lte(sales.completedAt, lastMonthEnd)),
            and(isNull(sales.completedAt), gte(sales.saleDate, lastMonthStart), lte(sales.saleDate, lastMonthEnd))
          ),
          limit: 1000,
        })
      : Promise.resolve([]),
  ]);

  // Filter out xero_import, deleted, needs_allocation, dismissed, and ongoing
  // sales. Also exclude CREDITED / DRAFT / VOIDED at the invoice_status layer
  // so credit-noted, unsent, and cancelled invoices drop out of headline
  // revenue. (DELETED-status rows are handled by the existing source-based
  // filter for ~76 of 78, and the remaining 2 atelier-source DELETED rows
  // are a separate workstream — see Phase 1 notes.)
  const salesData = allSalesRaw.filter(sale =>
    sale.source !== 'xero_import' &&
    !sale.deletedAt &&
    !sale.needsAllocation &&
    !sale.dismissed &&
    sale.status !== 'ongoing' &&
    sale.invoiceStatus !== 'CREDITED' &&
    sale.invoiceStatus !== 'DRAFT' &&
    sale.invoiceStatus !== 'VOIDED'
  );

  // Calculate metrics. effectiveInvoiceValue = AmountPaid + AmountDue;
  // partial-credit cases land here at their reduced (post-credit) value.
  const total = salesData.reduce((sum, sale) => sum + effectiveInvoiceValue(sale), 0);
  const margin = salesData.reduce((sum, sale) => sum + (sale.grossMargin || 0), 0);
  const totalSales = total;
  const totalMargin = margin;
  const tradesCount = salesData.length;
  const avgMarginPercent = total > 0 ? (margin / total) * 100 : 0;

  // Calculate last month's metrics for trend comparison
  let lastMonthData = null;
  if (needsLastMonth && lastMonthSalesRaw.length > 0) {
    const lastMonthSales = lastMonthSalesRaw.filter(sale =>
      sale.source !== 'xero_import' &&
      !sale.deletedAt &&
      sale.status !== 'ongoing' &&
      sale.invoiceStatus !== 'CREDITED' &&
      sale.invoiceStatus !== 'DRAFT' &&
      sale.invoiceStatus !== 'VOIDED'
    );

    const lastTotal = lastMonthSales.reduce((sum, sale) => sum + effectiveInvoiceValue(sale), 0);
    const lastMargin = lastMonthSales.reduce((sum, sale) => sum + (sale.grossMargin || 0), 0);
    lastMonthData = {
      totalSales: lastTotal,
      totalMargin: lastMargin,
      tradesCount: lastMonthSales.length,
      avgMarginPercent: lastTotal > 0 ? (lastMargin / lastTotal) * 100 : 0,
    };
  }

  // Get month name for section header (e.g., "January" from "January 2026")
  const monthNameOnly = currentDate.toLocaleDateString('en-GB', { month: 'long' });

  // Calculate metrics for new sections
  // Pending shipping count
  const pendingShippingSales = salesData.filter(sale =>
    sale.shippingMethod === 'to_be_shipped' && !sale.shippingCostConfirmed
  );
  const pendingShippingCount = pendingShippingSales.length;

  // Helper to get list of missing fields for a sale
  const getMissingFields = (sale: typeof salesData[0]) => {
    const missing: string[] = [];
    if (!sale.brand || sale.brand === 'Unknown') missing.push('brand');
    if (!sale.category || sale.category === 'Unknown') missing.push('category');
    if (!sale.buyPrice || sale.buyPrice === 0) missing.push('buy price');
    if (!sale.supplier?.id) missing.push('supplier');
    // Introducer checks: if has_introducer is true, must have introducer assigned and commission set
    if (sale.hasIntroducer && !sale.introducer?.id) missing.push('introducer');
    if (sale.hasIntroducer && (!sale.introducerCommission || sale.introducerCommission === 0)) missing.push('introducer commission');
    return missing;
  };

  // Helper to check if a sale is incomplete (missing required data)
  const isIncomplete = (sale: typeof salesData[0]) => {
    return getMissingFields(sale).length > 0;
  };

  // Sales needing attention: DRAFT status OR needs_allocation OR overdue (>30 days AUTHORISED) OR pending shipping OR incomplete
  const salesNeedingAttention = salesData.filter(sale => {
    if (sale.invoiceStatus === 'DRAFT' || sale.needsAllocation) return true;
    if (sale.shippingMethod === 'to_be_shipped' && !sale.shippingCostConfirmed) return true;
    if (isIncomplete(sale)) return true;
    if (sale.invoiceStatus === 'AUTHORISED') {
      const saleDate = sale.saleDate ? new Date(sale.saleDate) : null;
      if (saleDate) {
        const daysOld = Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysOld > 30;
      }
    }
    return false;
  });

  // Unpaid invoices: AUTHORISED status
  const unpaidInvoices = salesData.filter(sale => sale.invoiceStatus === 'AUTHORISED');
  const unpaidTotal = unpaidInvoices.reduce((sum, sale) => sum + effectiveInvoiceValue(sale), 0);

  // Shopper leaderboard (this month only)
  // Uses gross_margin to match the margin shown in the sales table
  const shopperStats = salesData.reduce((acc: any, sale) => {
    const shopperId = sale.shopper?.id;
    const shopperName = sale.shopper?.name || 'Unknown';
    if (!shopperId) return acc;

    if (!acc[shopperId]) {
      acc[shopperId] = {
        id: shopperId,
        name: shopperName,
        salesCount: 0,
        totalMargin: 0,
      };
    }

    acc[shopperId].salesCount++;
    // Use gross_margin to match the table column (not commissionable_margin)
    acc[shopperId].totalMargin += (sale.grossMargin || 0);

    return acc;
  }, {});

  const shopperLeaderboard = Object.values(shopperStats)
    .sort((a: any, b: any) => b.totalMargin - a.totalMargin)
    .slice(0, 5);

  // TEMPORARILY DISABLED: Xero sync functionality
  // const unallocatedSalesRaw = await xata.db.Sales
  //   .filter({ needs_allocation: true })
  //   .select(['id', 'xero_invoice_number', 'sale_date', 'sale_amount_inc_vat', 'buyer_name', 'internal_notes', 'buyer.name'])
  //   .getMany();
  // const unallocatedSales = unallocatedSalesRaw.map(sale => ({
  //   id: sale.id,
  //   xero_invoice_number: sale.xero_invoice_number,
  //   sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
  //   sale_amount_inc_vat: sale.sale_amount_inc_vat,
  //   buyer_name: sale.buyer_name,
  //   internal_notes: sale.internal_notes,
  //   buyer: sale.buyer ? { name: sale.buyer.name } : null,
  // }));
  // const shoppersRaw = await xata.db.Shoppers
  //   .select(['id', 'name'])
  //   .sort('name', 'asc')
  //   .getMany();
  // const shoppers = shoppersRaw.map(shopper => ({
  //   id: shopper.id,
  //   name: shopper.name,
  // }));

  // Format currency
  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format date
  const formatDate = (date: Date | null | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Get trend indicator - only show when baseline is meaningful
  const getTrendIndicator = (current: number, previous: number | null, isCurrency: boolean = false) => {
    if (!previous || !lastMonthData) return null;

    // Don't show misleading percentages when baseline is too small
    // For currency: require at least £1000 baseline
    // For counts: require at least 5 items baseline
    const minBaseline = isCurrency ? 1000 : 5;
    if (previous < minBaseline) {
      return null; // Let the fallback text show instead
    }

    const percentChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    if (Math.abs(percentChange) < 0.5) {
      return (
        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <span>→</span> No change
        </p>
      );
    }

    const isPositive = percentChange > 0;
    return (
      <p className={`text-xs mt-1 flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        <span>{isPositive ? '↑' : '↓'}</span>
        {Math.abs(percentChange).toFixed(1)}% vs last month
      </p>
    );
  };

  // Get status badge styling with improved logic
  const getStatusBadge = (sale: any) => {
    // Priority 1: Commission paid
    if (sale.commissionPaid) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Paid
        </span>
      );
    }

    // Priority 2: Commission locked
    if (sale.commissionLocked) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Locked
        </span>
      );
    }

    // Priority 3: Invoice status
    const normalizedStatus = (sale.invoiceStatus || 'draft').toUpperCase();

    if (normalizedStatus === 'PAID') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Paid
        </span>
      );
    } else if (normalizedStatus === 'AUTHORISED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          Awaiting Payment
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Draft
        </span>
      );
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Dashboard
          </h1>
          <p className="text-gray-600">
            Full system access and administration • {monthName} ·{" "}
            <Link
              href="/team-performance"
              className="text-gray-700 underline decoration-gray-300 hover:decoration-gray-700"
            >
              Team performance →
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ViewAsSelector />
          <MonthPicker />
          <Link
            href="/trade/new"
            className="inline-flex items-center px-6 h-12 border border-transparent text-sm font-semibold rounded-lg shadow-lg text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200 transform hover:scale-105"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create New Sale
          </Link>
        </div>
      </div>

      {/* TEMPORARILY DISABLED: Xero Sync Controls */}
      {/* <div className="mb-6">
        <DashboardClientWrapper
          unallocatedSales={unallocatedSales}
          shoppers={shoppers}
        />
      </div> */}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-500">Total Sales</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
          {getTrendIndicator(totalSales, lastMonthData?.totalSales || null, true) || (
            <p className="text-xs text-gray-500 mt-1">{tradesCount} {tradesCount === 1 ? 'sale' : 'sales'}</p>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-500">Total Margin</h3>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
          {getTrendIndicator(totalMargin, lastMonthData?.totalMargin || null, true) || (
            <p className="text-xs text-gray-500 mt-1">Gross profit</p>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-500">Sales Count</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{tradesCount}</p>
          {getTrendIndicator(tradesCount, lastMonthData?.tradesCount || null, false) || (
            <p className="text-xs text-gray-500 mt-1">This month</p>
          )}
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-500">Avg Margin</h3>
          </div>
          <p className="text-2xl font-bold text-purple-600">{avgMarginPercent.toFixed(1)}%</p>
          {getTrendIndicator(avgMarginPercent, lastMonthData?.avgMarginPercent || null, false) || (
            <p className="text-xs text-gray-500 mt-1">Margin rate</p>
          )}
        </div>
      </div>

      {/* Pending Shipping Alert */}
      {pendingShippingCount > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📦</span>
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  {pendingShippingCount} {pendingShippingCount === 1 ? 'sale' : 'sales'} awaiting shipping cost confirmation
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Margins are preliminary until shipping costs are confirmed
                </p>
              </div>
            </div>
            <Link
              href="/sales"
              className="px-4 py-2 text-sm font-medium text-amber-900 hover:text-amber-700 transition-colors"
            >
              View Sales →
            </Link>
          </div>
        </div>
      )}

      {/* Sales This Month Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">{monthNameOnly} Sales</h2>
          <Link
            href="/sales"
            className="text-sm font-medium text-purple-600 hover:text-purple-900 transition-colors"
          >
            View All Sales →
          </Link>
        </div>

        {salesData.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No sales yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first sale.
            </p>
            <div className="mt-6">
              <Link
                href="/trade/new"
                className="inline-flex items-center px-6 h-12 border border-transparent text-sm font-semibold rounded-lg shadow-lg text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200 transform hover:scale-105"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Create New Sale
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Brand
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Item
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Shopper
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Amount
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Margin
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {salesData.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sale.saleDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.brand || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        {sale.itemTitle || '—'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {sale.shopper?.name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(sale.saleAmountIncVat || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                      {formatCurrency(sale.grossMargin || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {getStatusBadge(sale)}
                        {isIncomplete(sale) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" title={`Missing: ${getMissingFields(sale).join(', ')}`}>
                            ⚠️
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Items Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Sales Needing Attention */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 rounded-lg">
                  <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <Link href="/sales" className="text-base font-semibold text-gray-900 hover:text-purple-600 transition-colors">
                  Needs Attention
                </Link>
              </div>
              {salesNeedingAttention.length > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                  {salesNeedingAttention.length}
                </span>
              )}
            </div>
          </div>
          <div className="p-4">
            {salesNeedingAttention.length === 0 ? (
              <div className="text-center py-4">
                <div className="p-2 bg-green-50 rounded-full w-10 h-10 mx-auto flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {salesNeedingAttention.slice(0, 4).map((sale) => {
                  // Determine issue type for badge
                  const issues: { label: string; color: string }[] = [];
                  if (sale.invoiceStatus === 'DRAFT') {
                    issues.push({ label: 'Draft', color: 'bg-gray-100 text-gray-700' });
                  }
                  if (sale.needsAllocation) {
                    issues.push({ label: 'Allocate', color: 'bg-orange-100 text-orange-700' });
                  }
                  if (sale.shippingMethod === 'to_be_shipped' && !sale.shippingCostConfirmed) {
                    issues.push({ label: 'Shipping', color: 'bg-blue-100 text-blue-700' });
                  }
                  if (isIncomplete(sale)) {
                    const missing = getMissingFields(sale);
                    if (missing.includes('buy price')) {
                      issues.push({ label: 'Buy Price', color: 'bg-red-100 text-red-700' });
                    } else if (missing.includes('supplier')) {
                      issues.push({ label: 'Supplier', color: 'bg-amber-100 text-amber-700' });
                    } else if (missing.length > 0) {
                      issues.push({ label: 'Incomplete', color: 'bg-amber-100 text-amber-700' });
                    }
                  }
                  const saleDate = sale.saleDate ? new Date(sale.saleDate) : null;
                  const daysOld = saleDate ? Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  if (sale.invoiceStatus === 'AUTHORISED' && daysOld > 30) {
                    issues.push({ label: 'Overdue', color: 'bg-red-100 text-red-700' });
                  }

                  return (
                    <Link
                      key={sale.id}
                      href={`/sales/${sale.id}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {sale.itemTitle || sale.saleReference || sale.xeroInvoiceNumber || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{sale.brand || 'No brand'}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {issues.slice(0, 2).map((issue, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${issue.color}`}
                            >
                              {issue.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {salesNeedingAttention.length > 4 && (
                  <Link
                    href="/sales"
                    className="block text-center text-sm font-medium text-purple-600 hover:text-purple-900 py-2"
                  >
                    View all {salesNeedingAttention.length} →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Unpaid Invoices */}
        <div className={`rounded-xl border shadow-sm overflow-hidden ${unpaidTotal > 0 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
          <div className={`px-5 py-4 border-b ${unpaidTotal > 0 ? 'border-yellow-200 bg-yellow-100/50' : 'border-gray-100 bg-gray-50/50'}`}>
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${unpaidTotal > 0 ? 'bg-yellow-200' : 'bg-gray-100'}`}>
                <svg className={`w-4 h-4 ${unpaidTotal > 0 ? 'text-yellow-700' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <Link href="/sales" className="text-base font-semibold text-gray-900 hover:text-purple-600 transition-colors">
                Unpaid Invoices
              </Link>
            </div>
          </div>
          <div className="p-4">
            {unpaidInvoices.length === 0 ? (
              <div className="text-center py-4">
                <div className="p-2 bg-green-50 rounded-full w-10 h-10 mx-auto flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 font-medium">All paid up!</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-4 pb-3 border-b border-yellow-200/50">
                  <p className="text-3xl font-bold text-yellow-700">{formatCurrency(unpaidTotal)}</p>
                  <p className="text-xs text-yellow-600 mt-1">{unpaidInvoices.length} {unpaidInvoices.length === 1 ? 'invoice' : 'invoices'} awaiting payment</p>
                </div>
                <div className="space-y-2">
                  {unpaidInvoices.slice(0, 3).map((sale) => {
                    const saleDate = sale.saleDate ? new Date(sale.saleDate) : null;
                    const daysOld = saleDate ? Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    const isOverdue = daysOld > 30;

                    return (
                      <Link
                        key={sale.id}
                        href={`/sales/${sale.id}`}
                        className={`block p-3 rounded-lg transition-colors ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'bg-white/60 hover:bg-white'}`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {sale.xeroInvoiceNumber || sale.saleReference}
                            </p>
                            <p className="text-xs text-gray-500">{sale.buyer?.name || 'Unknown'}</p>
                          </div>
                          <div className="ml-2 text-right">
                            <p className="font-medium text-gray-900">{formatCurrency(sale.saleAmountIncVat || 0)}</p>
                            <p className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {daysOld} {daysOld === 1 ? 'day' : 'days'} {isOverdue && '⚠️'}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  {unpaidInvoices.length > 3 && (
                    <Link
                      href="/sales"
                      className="block text-center text-sm font-medium text-purple-600 hover:text-purple-900 py-2"
                    >
                      View all {unpaidInvoices.length} →
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Shopper Leaderboard */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-100 rounded-lg">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Leaderboard</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{monthNameOnly} margins</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {shopperLeaderboard.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No sales this month</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shopperLeaderboard.map((shopper: any, index: number) => (
                  <div
                    key={shopper.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-50 to-amber-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      index === 0 ? 'bg-yellow-400 text-yellow-900 shadow-sm' :
                      index === 1 ? 'bg-gray-300 text-gray-700' :
                      index === 2 ? 'bg-orange-300 text-orange-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-gray-900 truncate ${index === 0 ? 'font-semibold' : ''}`}>
                        {shopper.name}
                      </p>
                      <p className="text-[10px] text-gray-500">{shopper.salesCount} {shopper.salesCount === 1 ? 'sale' : 'sales'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${index === 0 ? 'text-yellow-700' : 'text-green-600'}`}>
                        {formatCurrency(shopper.totalMargin)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Status - Compact Status Bar */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>All systems operational</span>
          <span className="text-gray-300">•</span>
          <span>Xero API</span>
          <span className="text-gray-300">•</span>
          <span>Drizzle ORM</span>
        </div>
      </div>
    </div>
  );
}
