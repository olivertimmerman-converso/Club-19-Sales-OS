import Link from "next/link";
import { notFound } from "next/navigation";
import { XataClient } from "@/src/xata";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Supplier Detail Page
 *
 * Displays a single supplier's profile and complete trade history
 */

const xata = new XataClient();

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch supplier record from Xata
  const supplier = await xata.db.Suppliers
    .select(['*'])
    .filter({ id })
    .getFirst();

  // Handle not found
  if (!supplier) {
    notFound();
  }

  // Fetch all sales for this supplier (show all in table, but filter for metrics)
  const sales = await xata.db.Sales
    .select([
      'id',
      'sale_date',
      'item_title',
      'brand',
      'buy_price',
      'sale_amount_inc_vat',
      'gross_margin',
      'buyer.name',
      'invoice_status',
      'deleted_at',
    ])
    .filter({
      $all: [
        { 'supplier.id': id },
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
  const totalSourced = paidSales.reduce((sum, sale) => sum + (sale.buy_price || 0), 0);
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

  // Check if sale is paid (for visual styling)
  const isPaid = (status: string | null | undefined) => {
    return status?.toUpperCase() === 'PAID';
  };

  return (
    <div className="p-6">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/suppliers"
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
          Back to Suppliers
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            {supplier.name || 'Unnamed Supplier'}
          </h1>
          {supplier.email && (
            <p className="text-gray-600">{supplier.email}</p>
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
          Edit Supplier
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sourced</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalSourced)}</p>
          <p className="text-xs text-gray-500 mt-1">Paid trades only</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Margin Generated</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
          <p className="text-xs text-gray-500 mt-1">Paid trades only</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Paid Trades</h3>
          <p className="text-2xl font-bold text-gray-900">{tradesCount}</p>
          <p className="text-xs text-gray-500 mt-1">{sales.length} total ({sales.length - tradesCount} unpaid)</p>
        </div>
      </div>

      {/* Trade History Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Trade History</h2>

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
            <h3 className="mt-2 text-sm font-medium text-gray-900">No trades yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              This supplier has not been used in any trades.
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
                      Buy Price
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Sale Price
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
                      Client
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
                          {formatCurrency(sale.buy_price || 0)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${paid ? 'text-gray-900' : 'text-gray-400'}`}>
                          {formatCurrency(sale.sale_amount_inc_vat || 0)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${paid ? 'text-green-600' : 'text-gray-400'}`}>
                          {formatCurrency(sale.gross_margin || 0)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-500' : 'text-gray-400'}`}>
                          {sale.buyer?.name || '—'}
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
