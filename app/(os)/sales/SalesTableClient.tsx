"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { getInvoiceStatusDisplay } from '@/lib/invoice-status';

interface Sale {
  id: string;
  sale_reference: string | null;
  sale_date: string | null;
  brand: string | null;
  category: string | null;
  item_title: string | null;
  buy_price: number | null;
  sale_amount_inc_vat: number | null;
  gross_margin: number | null;
  xero_invoice_number: string | null;
  invoice_status: string | null;
  currency: string | null;
  status: string | null;
  buyer: { name: string } | null;
  shopper: { id: string; name: string } | null;
  supplier: { id: string } | null;
  is_payment_plan: boolean;
  payment_plan_instalments: number | null;
  shipping_cost_confirmed: boolean | null;
  has_introducer: boolean;
  introducer: { id: string; name: string } | null;
  introducer_commission: number | null;
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
  const searchParams = useSearchParams();
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scroll fade indicator for horizontal table overflow
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const scrollHintDismissed = useRef(false);

  const handleTableScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const canScrollMore = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setShowScrollFade(canScrollMore);
    // Dismiss hint once user starts scrolling — don't bring it back
    if (el.scrollLeft > 0 && !scrollHintDismissed.current) {
      scrollHintDismissed.current = true;
      setShowScrollHint(false);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const overflows = el.scrollWidth > el.clientWidth;
      const canScrollMore = overflows && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setShowScrollFade(canScrollMore);
      // Show hint only if table overflows and user hasn't scrolled yet
      if (overflows && !scrollHintDismissed.current && el.scrollLeft === 0) {
        setShowScrollHint(true);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [sales]);

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

  // Helper to get list of missing fields for a sale
  const getMissingFields = (sale: Sale) => {
    const missing: string[] = [];
    if (!sale.brand || sale.brand === 'Unknown') missing.push('brand');
    if (!sale.category || sale.category === 'Unknown') missing.push('category');
    if (!sale.buy_price || sale.buy_price === 0) missing.push('buy price');
    if (!sale.supplier?.id) missing.push('supplier');
    // Introducer checks: if has_introducer is true, must have introducer assigned and commission set
    if (sale.has_introducer && !sale.introducer?.id) missing.push('introducer');
    if (sale.has_introducer && (!sale.introducer_commission || sale.introducer_commission === 0)) missing.push('introducer commission');
    return missing;
  };

  // Check if sale is missing required data
  const isIncomplete = (sale: Sale) => {
    return getMissingFields(sale).length > 0;
  };

  // Client-side status filtering
  const statusFilter = searchParams.get("status") || "all";
  const filteredSales = statusFilter === "all"
    ? sales
    : sales.filter((sale) => {
        switch (statusFilter) {
          case "needs-attention":
            return isIncomplete(sale);
          case "completed":
            return !isIncomplete(sale) && sale.status !== "ongoing";
          case "ongoing":
            return sale.status === "ongoing";
          default:
            return true;
        }
      });

  // Build returnTo param so the detail page can navigate back with filters preserved
  const returnToParams = searchParams.toString();
  const returnToSuffix = returnToParams ? `?returnTo=${encodeURIComponent('?' + returnToParams)}` : '';

  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {filteredSales.length === 0 && sales.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">No sales match the selected filter.</p>
        </div>
      )}

      {/* ── Mobile Card View ── */}
      <div className="md:hidden space-y-3">
        {filteredSales.map((sale) => (
          <Link
            key={sale.id}
            href={`/sales/${sale.id}${returnToSuffix}`}
            className="block bg-white rounded-lg border border-gray-200 shadow-sm p-3 active:bg-gray-50 transition-colors"
          >
            {/* Row 1: Invoice # + amount */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {sale.xero_invoice_number && (
                  <span className="text-xs font-mono text-gray-500">
                    {sale.xero_invoice_number}
                  </span>
                )}
                <span className="font-semibold text-sm text-purple-600">
                  {sale.sale_reference || '—'}
                </span>
              </div>
              <span className="font-semibold text-sm text-gray-900">
                {formatCurrency(sale.sale_amount_inc_vat, sale.currency)}
              </span>
            </div>
            {/* Row 2: Buyer name */}
            <div className="text-sm text-gray-700 mb-0.5">
              {sale.buyer?.name || '—'}
            </div>
            {/* Row 3: Brand + shopper */}
            {(sale.brand || sale.shopper?.name) && (
              <div className="text-xs text-gray-500 mb-1">
                {[sale.brand, sale.shopper?.name].filter(Boolean).join(' · ')}
              </div>
            )}
            {/* Row 4: Date + status + badges */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {formatDate(sale.sale_date)}
              </span>
              <div className="flex items-center gap-1.5">
                {isIncomplete(sale) && (
                  <span className="text-amber-500 text-xs">⚠️</span>
                )}
                {sale.is_payment_plan && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                    Plan
                  </span>
                )}
                {getStatusBadge(sale.invoice_status)}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Desktop Table View ── */}
      <div className="hidden md:block bg-white rounded-lg border border-gray-200 shadow-sm relative">
        <div
          ref={scrollRef}
          onScroll={handleTableScroll}
          className="overflow-x-auto custom-scrollbar"
        >
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
              {filteredSales.map((sale) => (
                <tr
                  key={sale.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {sale.xero_invoice_number || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sales/${sale.id}${returnToSuffix}`}
                        className="text-sm font-medium text-purple-600 hover:text-purple-900"
                      >
                        {sale.sale_reference || '—'}
                      </Link>
                      {(sale.has_introducer || sale.introducer) && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          title={`Introducer: ${sale.introducer?.name || 'Set'}`}
                        >
                          Introducer
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(sale.invoice_status)}
                      {sale.is_payment_plan && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Payment Plan {sale.payment_plan_instalments ? `(${sale.payment_plan_instalments})` : ''}
                        </span>
                      )}
                      {isIncomplete(sale) && (
                        <span
                          className="text-amber-500"
                          title={`Missing: ${getMissingFields(sale).join(', ')}`}
                        >
                          ⚠️
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
        {showScrollFade && (
          <div
            className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none"
            style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.95))' }}
          />
        )}
        {showScrollHint && (
          <div className="absolute right-3 top-3 pointer-events-none z-10">
            <span className="text-[11px] text-gray-400 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full border border-gray-200/60 tracking-wide">
              Scroll &#8594;
            </span>
          </div>
        )}
      </div>
    </>
  );
}
