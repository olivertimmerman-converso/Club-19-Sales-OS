import Link from "next/link";
import { notFound } from "next/navigation";
import { XataClient } from "@/src/xata";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Sale Detail Page
 *
 * Displays full information about a specific sale
 */

const xata = new XataClient();

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch sale record from Xata
  const sale = await xata.db.Sales
    .select([
      '*',
      'buyer.name',
      'supplier.name',
      'shopper.name',
      'introducer.name',
    ])
    .filter({ id })
    .getFirst();

  // Handle not found
  if (!sale) {
    notFound();
  }

  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return '£0';
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

  // Calculate margin percentage
  const marginPercent = sale.sale_amount_inc_vat
    ? ((sale.gross_margin || 0) / sale.sale_amount_inc_vat) * 100
    : 0;

  // Calculate total costs
  const totalCosts = (sale.buy_price || 0) + (sale.shipping_cost || 0) + (sale.card_fees || 0) + (sale.direct_costs || 0);

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
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/sales"
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
          Back to Sales
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            {sale.sale_reference || `Sale #${id.slice(0, 8)}`}
          </h1>
          <div className="flex items-center gap-3">
            {getStatusBadge(sale.invoice_status)}
            <span className="text-sm text-gray-500">
              {formatDate(sale.sale_date)}
            </span>
          </div>
        </div>
        {sale.xero_invoice_url && (
          <a
            href={sale.xero_invoice_url}
            target="_blank"
            rel="noopener noreferrer"
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
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            View in Xero
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Item Details Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Item Details</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Brand</dt>
              <dd className="mt-1 text-sm text-gray-900">{sale.brand || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Category</dt>
              <dd className="mt-1 text-sm text-gray-900">{sale.category || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="mt-1 text-sm text-gray-900">{sale.item_title || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Quantity</dt>
              <dd className="mt-1 text-sm text-gray-900">{sale.quantity || 1}</dd>
            </div>
          </dl>
        </div>

        {/* Parties Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Parties</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Buyer</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {sale.buyer?.name || '—'}
              </dd>
            </div>
            {sale.supplier?.name && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Supplier</dt>
                <dd className="mt-1 text-sm text-gray-900">{sale.supplier.name}</dd>
              </div>
            )}
            {sale.shopper?.name && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Shopper</dt>
                <dd className="mt-1 text-sm text-gray-900">{sale.shopper.name}</dd>
              </div>
            )}
            {sale.introducer?.name && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Introducer</dt>
                <dd className="mt-1 text-sm text-gray-900">{sale.introducer.name}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Financial Breakdown Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Revenue</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Sale Price (inc VAT)</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.sale_amount_inc_vat)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Sale Price (ex VAT)</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.sale_amount_ex_vat)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Costs */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Costs</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Buy Price</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.buy_price)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Shipping Cost</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.shipping_cost)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Card Fees</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.card_fees)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Direct Costs</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.direct_costs)}
                  </dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <dt className="text-sm font-medium text-gray-600">Total Costs</dt>
                  <dd className="text-sm font-semibold text-gray-900">
                    {formatCurrency(totalCosts)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Margin - Full Width Highlighted */}
            <div className="md:col-span-2 bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-green-900">Gross Margin</h3>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(sale.gross_margin)}
                  </div>
                  <div className="text-sm text-green-600">
                    {marginPercent.toFixed(1)}% margin
                  </div>
                </div>
              </div>
              {sale.commissionable_margin && (
                <div className="flex justify-between pt-2 border-t border-green-200">
                  <dt className="text-sm text-green-800">Commissionable Margin</dt>
                  <dd className="text-sm font-medium text-green-900">
                    {formatCurrency(sale.commissionable_margin)}
                  </dd>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Invoice & Payment Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice & Payment</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Invoice Details</h3>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm text-gray-600">Xero Invoice #</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">
                    {sale.xero_invoice_number || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">Invoice Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(sale.sale_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">Invoice Status</dt>
                  <dd className="mt-1">
                    {getStatusBadge(sale.invoice_status)}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Payment Status</h3>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm text-gray-600">Payment Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(sale.invoice_paid_date) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">Xero Payment Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(sale.xero_payment_date) || '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Commission</h3>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm text-gray-600">Commission Locked</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {sale.commission_locked ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Locked
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Unlocked
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">Commission Paid</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {sale.commission_paid ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Unpaid
                      </span>
                    )}
                  </dd>
                </div>
                {sale.commission_amount && (
                  <div>
                    <dt className="text-sm text-gray-600">Commission Amount</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-900">
                      {formatCurrency(sale.commission_amount)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>

        {/* Internal Notes (if present) */}
        {sale.internal_notes && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Internal Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{sale.internal_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
