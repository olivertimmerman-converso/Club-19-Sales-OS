import Link from "next/link";
import { notFound } from "next/navigation";
import { XataClient } from "@/src/xata";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Client Detail Page
 *
 * Displays a single client's profile and complete purchase history
 */

const xata = new XataClient();

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch buyer record from Xata
  const buyer = await xata.db.Buyers
    .select(['*'])
    .filter({ id })
    .getFirst();

  // Handle not found
  if (!buyer) {
    notFound();
  }

  // Fetch all sales for this client (show all in table, but filter for metrics)
  const sales = await xata.db.Sales
    .select([
      'id',
      'sale_date',
      'item_title',
      'brand',
      'sale_amount_inc_vat',
      'gross_margin',
      'xero_invoice_number',
      'invoice_status',
      'currency',
      'deleted_at',
    ])
    .filter({
      $all: [
        { 'buyer.id': id },
        { deleted_at: { $is: null } }
      ]
    })
    .sort('sale_date', 'desc')
    .getAll();

  // Filter to PAID invoices only for metrics
  const paidSales = sales.filter(sale =>
    sale.invoice_status?.toUpperCase() === 'PAID'
  );

  // Calculate totals from PAID invoices only
  const totalSpend = paidSales.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
  const totalMargin = paidSales.reduce((sum, sale) => sum + (sale.gross_margin || 0), 0);
  const tradesCount = paidSales.length;

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

  // Format status badge (matching sales page)
  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return <span className="text-gray-400">—</span>;

    const statusColors: Record<string, string> = {
      'DRAFT': 'bg-gray-100 text-gray-700',
      'SUBMITTED': 'bg-blue-100 text-blue-700',
      'AUTHORISED': 'bg-yellow-100 text-yellow-800',
      'PAID': 'bg-green-100 text-green-700',
      'VOIDED': 'bg-red-100 text-red-700',
    };

    const statusLabels: Record<string, string> = {
      'AUTHORISED': 'Awaiting Payment',
    };

    const colorClass = statusColors[status] || 'bg-gray-100 text-gray-700';
    const label = statusLabels[status] || status;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {label}
      </span>
    );
  };

  // Check if sale is paid (for visual styling)
  const isPaid = (status: string | null | undefined) => {
    return status?.toUpperCase() === 'PAID';
  };

  return (
    <div className="p-6">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/clients"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Clients
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            {buyer.name || 'Unnamed Client'}
          </h1>
          {buyer.email && (
            <p className="text-gray-600">{buyer.email}</p>
          )}
        </div>
        <Link
          href="#"
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Edit Client
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Spend</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalSpend)}</p>
          <p className="text-xs text-gray-500 mt-1">Paid invoices only</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Margin</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
          <p className="text-xs text-gray-500 mt-1">Paid invoices only</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Paid Sales</h3>
          <p className="text-2xl font-bold text-gray-900">{tradesCount}</p>
          <p className="text-xs text-gray-500 mt-1">{sales.length} total ({sales.length - tradesCount} unpaid)</p>
        </div>
      </div>

      {/* Purchase History Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Purchase History</h2>

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
            <h3 className="mt-2 text-sm font-medium text-gray-900">No purchases yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              This client has not made any purchases.
            </p>
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
                      Date
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
                      Brand
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
                  {sales.map((sale) => {
                    const paid = isPaid(sale.invoice_status);
                    return (
                      <tr
                        key={sale.id}
                        className={`hover:bg-gray-50 transition-colors ${!paid ? 'opacity-50 bg-gray-50' : ''}`}
                        title={!paid ? 'Not counted in totals (unpaid)' : ''}
                      >
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-500' : 'text-gray-400'}`}>
                          {formatDate(sale.sale_date)}
                        </td>
                        <td className={`px-6 py-4 text-sm max-w-xs truncate ${paid ? 'text-gray-900' : 'text-gray-400'}`}>
                          <Link
                            href={`/sales/${sale.id}`}
                            className={paid ? 'text-purple-600 hover:text-purple-900' : 'text-gray-400 hover:text-gray-600'}
                          >
                            {sale.item_title || '—'}
                          </Link>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-900' : 'text-gray-400'}`}>
                          {sale.brand || '—'}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${paid ? 'text-gray-900' : 'text-gray-400'}`}>
                          {formatCurrency(sale.sale_amount_inc_vat || 0)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${paid ? 'text-green-600' : 'text-gray-400'}`}>
                          {formatCurrency(sale.gross_margin || 0)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-500' : 'text-gray-400'}`}>
                          {sale.xero_invoice_number || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(sale.invoice_status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
