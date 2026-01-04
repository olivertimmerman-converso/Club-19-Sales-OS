import Link from "next/link";
import { XataClient } from "@/src/xata";
import type { SalesRecord } from "@/src/xata";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { ViewAsSelector } from "@/components/ui/ViewAsSelector";
import { getMonthDateRange } from "@/lib/dateUtils";
// import { DashboardClientWrapper } from "./DashboardClientWrapper"; // Temporarily disabled

/**
 * Club 19 Sales OS - Superadmin Dashboard
 *
 * Server component that displays real metrics from the Sales table
 */

const xata = new XataClient();

interface SuperadminDashboardProps {
  monthParam?: string;
}

export async function SuperadminDashboard({ monthParam = "current" }: SuperadminDashboardProps) {
  // Get date range for filtering
  const dateRange = getMonthDateRange(monthParam);

  // Get current month name for display
  const currentDate = dateRange ? dateRange.start : new Date();
  const monthName = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Query Sales table for metrics (exclude xero_import records)
  let salesQuery = xata.db.Sales
    .select([
      'sale_amount_inc_vat',
      'gross_margin',
      'commissionable_margin',
      'currency',
      'sale_date',
      'brand',
      'item_title',
      'sale_reference',
      'invoice_status',
      'commission_paid',
      'commission_locked',
      'shopper.name',
      'shopper.id',
      'buyer.name',
      'xero_invoice_number',
      'xero_payment_date',
      'invoice_paid_date',
      'needs_allocation',
      'id',
    ])
    .filter({
      $all: [
        { source: { $isNot: 'xero_import' } },
        { deleted_at: { $is: null } }
      ]
    });

  // Apply date range filter if specified
  if (dateRange) {
    salesQuery = salesQuery.filter({
      sale_date: {
        $ge: dateRange.start,
        $le: dateRange.end,
      },
    });
  }

  // Limit to 200 recent sales for dashboard performance
  const sales = await salesQuery.sort('sale_date', 'desc').getMany({ pagination: { size: 200 } });

  // Calculate metrics
  const total = sales.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
  const margin = sales.reduce((sum, sale) => sum + (sale.gross_margin || 0), 0);
  const totalSales = total;
  const totalMargin = margin;
  const tradesCount = sales.length;
  const avgMarginPercent = total > 0 ? (margin / total) * 100 : 0;

  // Calculate last month's metrics for trend comparison (only if viewing current month)
  let lastMonthData = null;
  if (monthParam === "current" || !monthParam) {
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const lastMonthSales = await xata.db.Sales
      .select(['sale_amount_inc_vat', 'gross_margin'])
      .filter({
        $all: [
          {
            sale_date: {
              $ge: lastMonthStart,
              $le: lastMonthEnd,
            }
          },
          { source: { $isNot: 'xero_import' } },
          { deleted_at: { $is: null } }
        ]
      })
      .getMany({ pagination: { size: 1000 } });

    const lastTotal = lastMonthSales.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
    const lastMargin = lastMonthSales.reduce((sum, sale) => sum + (sale.gross_margin || 0), 0);
    lastMonthData = {
      totalSales: lastTotal,
      totalMargin: lastMargin,
      tradesCount: lastMonthSales.length,
      avgMarginPercent: lastTotal > 0 ? (lastMargin / lastTotal) * 100 : 0,
    };
  }

  // Get recent 5 sales
  const recentSales = sales.slice(0, 5);

  // Calculate metrics for new sections
  // Sales needing attention: DRAFT status OR needs_allocation OR overdue (>30 days AUTHORISED)
  const salesNeedingAttention = sales.filter(sale => {
    if (sale.invoice_status === 'DRAFT' || sale.needs_allocation) return true;
    if (sale.invoice_status === 'AUTHORISED') {
      const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;
      if (saleDate) {
        const daysOld = Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysOld > 30;
      }
    }
    return false;
  });

  // Unpaid invoices: AUTHORISED status
  const unpaidInvoices = sales.filter(sale => sale.invoice_status === 'AUTHORISED');
  const unpaidTotal = unpaidInvoices.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);

  // Shopper leaderboard (this month only)
  const shopperStats = sales.reduce((acc: any, sale) => {
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
    acc[shopperId].totalMargin += (sale.commissionable_margin || sale.gross_margin || 0);

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

  // Get trend indicator
  const getTrendIndicator = (current: number, previous: number | null) => {
    if (!previous || !lastMonthData) return null;

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
    if (sale.commission_paid) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Paid
        </span>
      );
    }

    // Priority 2: Commission locked
    if (sale.commission_locked) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Locked
        </span>
      );
    }

    // Priority 3: Invoice status
    const normalizedStatus = (sale.invoice_status || 'draft').toUpperCase();

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
            Full system access and administration • {monthName}
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
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sales</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
          {getTrendIndicator(totalSales, lastMonthData?.totalSales || null) || (
            <p className="text-xs text-gray-500 mt-1">{tradesCount} {tradesCount === 1 ? 'sale' : 'sales'}</p>
          )}
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Margin</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
          {getTrendIndicator(totalMargin, lastMonthData?.totalMargin || null) || (
            <p className="text-xs text-gray-500 mt-1">Gross profit</p>
          )}
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Sales</h3>
          <p className="text-2xl font-bold text-gray-900">{tradesCount}</p>
          {getTrendIndicator(tradesCount, lastMonthData?.tradesCount || null) || (
            <p className="text-xs text-gray-500 mt-1">This month</p>
          )}
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Avg Margin</h3>
          <p className="text-2xl font-bold text-purple-600">{avgMarginPercent.toFixed(1)}%</p>
          {getTrendIndicator(avgMarginPercent, lastMonthData?.avgMarginPercent || null) || (
            <p className="text-xs text-gray-500 mt-1">Margin rate</p>
          )}
        </div>
      </div>

      {/* Recent Sales Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Recent Sales</h2>
          <Link
            href="/sales"
            className="text-sm font-medium text-purple-600 hover:text-purple-900 transition-colors"
          >
            View All Sales →
          </Link>
        </div>

        {recentSales.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
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
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
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
                {recentSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sale.sale_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.brand || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        {sale.item_title || '—'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {sale.shopper?.name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(sale.sale_amount_inc_vat || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                      {formatCurrency(sale.gross_margin || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(sale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Sections Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Sales Needing Attention */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <Link href="/sales" className="text-lg font-semibold text-gray-900 hover:text-purple-600 transition-colors">
              Sales Needing Attention
            </Link>
            {salesNeedingAttention.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                {salesNeedingAttention.length}
              </span>
            )}
          </div>
          {salesNeedingAttention.length === 0 ? (
            <p className="text-sm text-gray-500">All sales are up to date</p>
          ) : (
            <div className="space-y-3">
              {salesNeedingAttention.slice(0, 3).map((sale) => (
                <Link
                  key={sale.id}
                  href={`/sales/${sale.id}`}
                  className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {sale.sale_reference || sale.xero_invoice_number || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{sale.brand || 'No brand'}</p>
                    </div>
                    <div className="ml-2">
                      {sale.invoice_status === 'DRAFT' && (
                        <span className="text-xs text-gray-600">Draft</span>
                      )}
                      {sale.needs_allocation && (
                        <span className="text-xs text-orange-600">Needs allocation</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {salesNeedingAttention.length > 3 && (
                <Link
                  href="/sales"
                  className="block text-center text-sm font-medium text-purple-600 hover:text-purple-900 pt-2"
                >
                  View all {salesNeedingAttention.length} →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Unpaid Invoices */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="mb-4">
            <Link href="/sales" className="text-lg font-semibold text-gray-900 hover:text-purple-600 transition-colors block mb-1">
              Unpaid Invoices
            </Link>
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(unpaidTotal)}</p>
            <p className="text-xs text-gray-500 mt-1">{unpaidInvoices.length} {unpaidInvoices.length === 1 ? 'invoice' : 'invoices'}</p>
          </div>
          {unpaidInvoices.length === 0 ? (
            <p className="text-sm text-gray-500">No unpaid invoices</p>
          ) : (
            <div className="space-y-2">
              {unpaidInvoices.slice(0, 3).map((sale) => {
                const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;
                const daysOld = saleDate ? Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

                return (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="block p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {sale.xero_invoice_number || sale.sale_reference}
                        </p>
                        <p className="text-xs text-gray-500">{sale.buyer?.name || 'Unknown'}</p>
                      </div>
                      <div className="ml-2 text-right">
                        <p className="font-medium text-gray-900">{formatCurrency(sale.sale_amount_inc_vat || 0)}</p>
                        <p className="text-xs text-gray-500">{daysOld} {daysOld === 1 ? 'day' : 'days'}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Shopper Leaderboard */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Shopper Leaderboard</h3>
            <p className="text-xs text-gray-500">Top performers this month</p>
          </div>
          {shopperLeaderboard.length === 0 ? (
            <p className="text-sm text-gray-500">No sales this month</p>
          ) : (
            <div className="space-y-3">
              {shopperLeaderboard.map((shopper: any, index: number) => (
                <div key={shopper.id} className="flex items-center gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-100 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{shopper.name}</p>
                    <p className="text-xs text-gray-500">{shopper.salesCount} {shopper.salesCount === 1 ? 'sale' : 'sales'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{formatCurrency(shopper.totalMargin)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <span>Xata Database</span>
        </div>
      </div>
    </div>
  );
}
