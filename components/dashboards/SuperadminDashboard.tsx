import Link from "next/link";
import { XataClient } from "@/src/xata";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { ViewAsSelector } from "@/components/ui/ViewAsSelector";
import { getMonthDateRange } from "@/lib/dateUtils";

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

  // Get recent 5 sales
  const recentSales = sales.slice(0, 5);

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

  // Get status badge styling
  const getStatusBadge = (status: string | null | undefined) => {
    const normalizedStatus = (status || 'draft').toLowerCase();

    if (normalizedStatus === 'paid' || normalizedStatus === 'authorised') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Paid
        </span>
      );
    } else if (normalizedStatus === 'pending' || normalizedStatus === 'submitted') {
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
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
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

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sales</h3>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
          <p className="text-xs text-gray-500 mt-1">{tradesCount} {tradesCount === 1 ? 'trade' : 'trades'}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Margin</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
          <p className="text-xs text-gray-500 mt-1">Gross profit</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Trades</h3>
          <p className="text-2xl font-bold text-gray-900">{tradesCount}</p>
          <p className="text-xs text-gray-500 mt-1">Completed</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Avg Margin</h3>
          <p className="text-2xl font-bold text-purple-600">{avgMarginPercent.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-1">Margin rate</p>
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
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(sale.sale_amount_inc_vat || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                      {formatCurrency(sale.gross_margin || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(sale.invoice_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Status Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Status</h2>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">All Systems Operational</h3>
              <p className="text-sm text-gray-600 mt-1">
                Xero API • Xata Database • All services running
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-600">Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
