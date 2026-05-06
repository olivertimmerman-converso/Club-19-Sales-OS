import Link from "next/link";
// ORIGINAL XATA: import { XataClient } from "@/src/xata";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getInvoiceStatusDisplay } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Invoices Page
 *
 * Displays all invoices created through Deal Studio
 * Restricted: Admin + Finance + Superadmin
 */

// ORIGINAL XATA: const xata = new XataClient();

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // Get filter from URL params
  const statusFilter = status || 'all';

  // ORIGINAL XATA:
  // // Fetch all sales (each sale = one invoice)
  // const allSales = await xata.db.Sales
  //   .select([
  //     'id',
  //     'xero_invoice_number',
  //     'xero_invoice_id',
  //     'xero_invoice_url',
  //     'invoice_status',
  //     'sale_date',
  //     'sale_amount_inc_vat',
  //     'brand',
  //     'item_title',
  //     'buyer.name',
  //   ])
  //   .sort('sale_date', 'desc')
  //   .getAll();

  // Fetch sales (each sale = one invoice) — limited to 500 most recent
  const allSales = await db.query.sales.findMany({
    with: {
      buyer: true,
    },
    orderBy: [desc(sales.saleDate)],
    limit: 500,
  });

  // Filter sales based on status
  const filteredSales = statusFilter === 'all'
    ? allSales
    : statusFilter === 'draft'
    ? allSales.filter(sale => sale.invoiceStatus === 'DRAFT')
    : statusFilter === 'awaiting'
    ? allSales.filter(sale =>
        sale.invoiceStatus === 'AUTHORISED' || sale.invoiceStatus === 'SUBMITTED'
      )
    : statusFilter === 'paid'
    ? allSales.filter(sale => sale.invoiceStatus === 'PAID')
    : allSales;

  // Calculate summary stats
  const totalInvoices = allSales.length;
  const totalValue = allSales.reduce((sum, sale) =>
    sum + (sale.saleAmountIncVat || 0), 0
  );
  const draftCount = allSales.filter(sale => sale.invoiceStatus === 'DRAFT').length;
  const awaitingCount = allSales.filter(sale =>
    sale.invoiceStatus === 'AUTHORISED' || sale.invoiceStatus === 'SUBMITTED'
  ).length;
  const paidCount = allSales.filter(sale => sale.invoiceStatus === 'PAID').length;

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

  // Format status badge — colours and labels live in lib/invoice-status.ts.
  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return <span className="text-gray-400">—</span>;
    const { label, colorClass } = getInvoiceStatusDisplay(status);
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Invoices</h1>
          <p className="text-gray-600">
            Invoice management and tracking from Deal Studio
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Invoices</h3>
          <p className="text-2xl font-bold text-gray-900">{totalInvoices}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Value</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalValue)}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Draft</h3>
          <p className="text-2xl font-bold text-gray-700">{draftCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Awaiting Payment</h3>
          <p className="text-2xl font-bold text-yellow-600">{awaitingCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Paid</h3>
          <p className="text-2xl font-bold text-green-600">{paidCount}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <Link
              href="/invoices"
              className={`${
                statusFilter === 'all'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              All ({totalInvoices})
            </Link>
            <Link
              href="/invoices?status=draft"
              className={`${
                statusFilter === 'draft'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Draft ({draftCount})
            </Link>
            <Link
              href="/invoices?status=awaiting"
              className={`${
                statusFilter === 'awaiting'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Awaiting Payment ({awaitingCount})
            </Link>
            <Link
              href="/invoices?status=paid"
              className={`${
                statusFilter === 'paid'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Paid ({paidCount})
            </Link>
          </nav>
        </div>
      </div>

      {/* Invoices Table */}
      {filteredSales.length === 0 ? (
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">No invoices found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter === 'all'
              ? 'No invoices have been created yet.'
              : `No invoices with status "${statusFilter}".`}
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
                    Invoice #
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
                    Client
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
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sale.xeroInvoiceUrl ? (
                        <a
                          href={sale.xeroInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-purple-600 hover:text-purple-900"
                        >
                          {sale.xeroInvoiceNumber || '—'}
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-gray-900">
                          {sale.xeroInvoiceNumber || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sale.saleDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.buyer?.name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {sale.brand && sale.itemTitle
                        ? `${sale.brand} - ${sale.itemTitle}`
                        : sale.brand || sale.itemTitle || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(sale.saleAmountIncVat || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(sale.invoiceStatus)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {sale.xeroInvoiceUrl ? (
                        <a
                          href={sale.xeroInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-purple-600 hover:text-purple-900"
                        >
                          View in Xero
                          <svg
                            className="ml-1 w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
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
}
