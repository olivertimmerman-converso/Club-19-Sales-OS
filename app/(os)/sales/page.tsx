import Link from "next/link";
import { XataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Sales Overview
 *
 * Displays all sales from the Xata database
 * Shoppers see only their own sales, others see all sales
 */

const xata = new XataClient();

interface SalesPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  try {
    // Get role for filtering
    const role = await getUserRole();
    console.log('[SalesPage] Role:', role);

    // Get month filter
    const params = await searchParams;
    const monthParam = params.month || "current";
    console.log('[SalesPage] Month param:', monthParam);

    const dateRange = getMonthDateRange(monthParam);
    console.log('[SalesPage] Date range:', dateRange);

    // Query Sales table from Xata
    let query = xata.db.Sales
      .select([
        'id',
        'sale_reference',
        'sale_date',
        'brand',
        'item_title',
        'sale_amount_inc_vat',
        'gross_margin',
        'xero_invoice_number',
        'invoice_status',
        'currency',
        'buyer.name',
        'shopper_name',
      ]);

    // Filter for shoppers - only show their own sales
    if (role === 'shopper') {
      console.log('[SalesPage] Fetching current user for shopper...');
      const currentUser = await getCurrentUser();
      console.log('[SalesPage] Current user:', currentUser?.fullName);
      if (currentUser?.fullName) {
        query = query.filter({ shopper_name: currentUser.fullName });
      }
    }

    // Apply date range filter if specified
    if (dateRange) {
      console.log('[SalesPage] Applying date range filter');
      query = query.filter({
        sale_date: {
          $ge: dateRange.start,
          $le: dateRange.end,
        },
      });
    }

    console.log('[SalesPage] Executing query...');
    const sales = await query.sort('sale_date', 'desc').getAll();
    console.log('[SalesPage] Sales count:', sales.length);

  // Format currency
  const formatCurrency = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (!amount) return '—';
    const curr = currency || 'GBP';
    const symbol = curr === 'GBP' ? '£' : curr === 'EUR' ? '€' : '$';
    return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

  // Format status badge
  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return <span className="text-gray-400">—</span>;

    const statusColors: Record<string, string> = {
      'DRAFT': 'bg-gray-100 text-gray-700',
      'SUBMITTED': 'bg-blue-100 text-blue-700',
      'AUTHORISED': 'bg-green-100 text-green-700',
      'PAID': 'bg-green-100 text-green-700',
      'VOIDED': 'bg-red-100 text-red-700',
    };

    const colorClass = statusColors[status] || 'bg-gray-100 text-gray-700';

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Sales</h1>
          <p className="text-gray-600">
            {sales.length} sale{sales.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
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

      {/* Sales Table */}
      {sales.length === 0 ? (
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
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Sale Ref
                  </th>
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
                    Buyer
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
                    Sale Amount
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Margin
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Invoice #
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-sm font-medium text-purple-600 hover:text-purple-900"
                      >
                        {sale.sale_reference || '—'}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sale.sale_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.buyer?.name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.brand || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {sale.item_title || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(sale.sale_amount_inc_vat, sale.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(sale.gross_margin, sale.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.xero_invoice_number || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getStatusBadge(sale.invoice_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
  } catch (error) {
    console.error('[SalesPage] Error:', error);
    console.error('[SalesPage] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[SalesPage] Error message:', error instanceof Error ? error.message : String(error));

    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-semibold text-red-900 mb-2">Error loading sales</h1>
          <p className="text-sm text-red-700 mb-4">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <details className="text-xs text-red-600">
            <summary className="cursor-pointer font-medium">Error details</summary>
            <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto">
              {error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
