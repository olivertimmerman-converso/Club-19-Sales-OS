import Link from "next/link";
import { XataClient } from "@/src/xata";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { ViewAsSelector } from "@/components/ui/ViewAsSelector";
import { getMonthDateRange } from "@/lib/dateUtils";
import { DashboardClientWrapper } from "./DashboardClientWrapper";

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

  // Query Sales table for metrics
  let salesQuery = xata.db.Sales
    .select([
      'sale_amount_inc_vat',
      'gross_margin',
      'currency',
      'sale_date',
      'brand',
      'item_title',
      'sale_reference',
      'invoice_status',
      'commission_paid',
      'commission_locked',
      'shopper.name',
      'id',
    ]);

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
  const totalSales = sales.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
  const totalMargin = sales.reduce((sum, sale) => sum + (sale.gross_margin || 0), 0);
  const tradesCount = sales.length;
  const avgMarginPercent = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0;

  // Calculate last month's metrics for trend comparison (only if viewing current month)
  let lastMonthData = null;
  if (monthParam === "current" || !monthParam) {
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const lastMonthSales = await xata.db.Sales
      .select(['sale_amount_inc_vat', 'gross_margin'])
      .filter({
        sale_date: {
          $ge: lastMonthStart,
          $le: lastMonthEnd,
        },
      })
      .getMany({ pagination: { size: 1000 } });

    const lastMonthTotalSales = lastMonthSales.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
    const lastMonthTotalMargin = lastMonthSales.reduce((sum, sale) => sum + (sale.gross_margin || 0), 0);
    const lastMonthTradesCount = lastMonthSales.length;
    const lastMonthAvgMarginPercent = lastMonthTotalSales > 0 ? (lastMonthTotalMargin / lastMonthTotalSales) * 100 : 0;

    lastMonthData = {
      totalSales: lastMonthTotalSales,
      totalMargin: lastMonthTotalMargin,
      tradesCount: lastMonthTradesCount,
      avgMarginPercent: lastMonthAvgMarginPercent,
    };
  }

  // Get recent 5 sales
  const recentSales = sales.slice(0, 5);

  // Query unallocated sales (for Xero sync system)
  const unallocatedSalesRaw = await xata.db.Sales
    .filter({ needs_allocation: true })
    .select(['id', 'xero_invoice_number', 'sale_date', 'sale_amount_inc_vat', 'buyer_name', 'internal_notes', 'buyer.name'])
    .getMany();

  // Serialize unallocated sales for client component (convert Date to string)
  const unallocatedSales = unallocatedSalesRaw.map(sale => ({
    id: sale.id,
    xero_invoice_number: sale.xero_invoice_number,
    sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
    sale_amount_inc_vat: sale.sale_amount_inc_vat,
    buyer_name: sale.buyer_name,
    internal_notes: sale.internal_notes,
    buyer: sale.buyer ? { name: sale.buyer.name } : null,
  }));

  // Query all shoppers (for allocation dropdown)
  const shoppersRaw = await xata.db.Shoppers
    .select(['id', 'name'])
    .sort('name', 'asc')
    .getMany();

  // Serialize shoppers for client component
  const shoppers = shoppersRaw.map(shopper => ({
    id: shopper.id,
    name: shopper.name,
  }));

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
          Pending
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
            Full system access and administration
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

      {/* Xero Sync Controls */}
      <div className="mb-6">
        <DashboardClientWrapper
          unallocatedSales={unallocatedSales}
          shoppers={shoppers}
        />
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sales</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
          {getTrendIndicator(totalSales, lastMonthData?.totalSales || null) || (
            <p className="text-xs text-gray-500 mt-1">{tradesCount} {tradesCount === 1 ? 'trade' : 'trades'}</p>
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
          <h3 className="text-sm font-medium text-gray-500 mb-2">Trades</h3>
          <p className="text-2xl font-bold text-gray-900">{tradesCount}</p>
          {getTrendIndicator(tradesCount, lastMonthData?.tradesCount || null) || (
            <p className="text-xs text-gray-500 mt-1">Completed</p>
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
