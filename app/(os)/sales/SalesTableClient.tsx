"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

interface Sale {
  id: string;
  sale_reference: string | null;
  sale_date: string | null;
  brand: string | null;
  item_title: string | null;
  sale_amount_inc_vat: number | null;
  gross_margin: number | null;
  xero_invoice_number: string | null;
  invoice_status: string | null;
  currency: string | null;
  buyer: { name: string } | null;
  shopper: { id: string; name: string } | null;
  is_payment_plan: boolean;
  payment_plan_instalments: number | null;
  shipping_cost_confirmed: boolean | null;
  has_introducer: boolean;
  introducer: { id: string; name: string } | null;
}

interface Shopper {
  id: string;
  name: string;
}

interface SalesTableClientProps {
  sales: Sale[];
  shoppers: Shopper[];
  userRole: string | null;
  isDeletedSection?: boolean;
}

export function SalesTableClient({ sales, shoppers, userRole, isDeletedSection = false }: SalesTableClientProps) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleShopperChange = async (saleId: string, shopperId: string) => {
    setUpdating(saleId);
    setError(null);

    try {
      const response = await fetch(`/api/sales/${saleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopper: shopperId || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update shopper');
      }

      // Refresh the page data after a short delay
      setTimeout(() => {
        router.refresh();
      }, 500);
    } catch (err) {
      console.error('Error updating shopper:', err);
      setError(err instanceof Error ? err.message : 'Failed to update shopper');
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (saleId: string) => {
    if (!confirm('Delete this sale? It can be restored later from the Deleted Sales page.')) {
      return;
    }

    setDeleting(saleId);
    setError(null);

    try {
      const response = await fetch(`/api/sales/${saleId}/delete`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete sale');
      }

      // Refresh the page
      router.refresh();
    } catch (err) {
      console.error('Error deleting sale:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete sale');
      setDeleting(null);
    }
  };

  // Format currency
  const formatCurrency = (amount: number | null | undefined, currency: string | null | undefined) => {
    if (!amount) return '—';
    const curr = currency || 'GBP';
    const symbol = curr === 'GBP' ? '£' : curr === 'EUR' ? '€' : '$';
    return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format date
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-GB', {
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

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

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
                  Shopper
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
                {userRole === 'superadmin' && !isDeletedSection && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sales.map((sale) => (
                <tr
                  key={sale.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-sm font-medium text-purple-600 hover:text-purple-900"
                      >
                        {sale.sale_reference || '—'}
                      </Link>
                      {!sale.shipping_cost_confirmed && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                          title="Delivery cost pending confirmation"
                        >
                          📦 Delivery TBC
                        </span>
                      )}
                      {(sale.has_introducer || sale.introducer) && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          title={`Introducer: ${sale.introducer?.name || 'Set'}`}
                        >
                          🤝
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(sale.sale_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sale.buyer?.name || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <select
                        value={sale.shopper?.id || ''}
                        onChange={(e) => handleShopperChange(sale.id, e.target.value)}
                        disabled={updating === sale.id}
                        className="appearance-none h-8 pl-2 pr-8 py-1 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Select shopper...</option>
                        {shoppers.map((shopper) => (
                          <option key={shopper.id} value={shopper.id}>
                            {shopper.name}
                          </option>
                        ))}
                      </select>
                      {updating === sale.id && (
                        <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                      )}
                    </div>
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
                    <div className="flex items-center gap-2">
                      {getStatusBadge(sale.invoice_status)}
                      {sale.is_payment_plan && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Payment Plan {sale.payment_plan_instalments ? `(${sale.payment_plan_instalments})` : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  {userRole === 'superadmin' && !isDeletedSection && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        disabled={deleting === sale.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting === sale.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
