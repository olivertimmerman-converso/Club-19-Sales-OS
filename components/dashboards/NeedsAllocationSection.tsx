'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface Sale {
  id: string;
  xero_invoice_number?: string | null;
  sale_date?: string | null; // ISO string from server
  sale_amount_inc_vat?: number | null;
  buyer_name?: string | null;
  internal_notes?: string | null;
  buyer?: {
    name?: string | null;
  } | null;
}

interface Shopper {
  id: string;
  name?: string | null;
}

interface NeedsAllocationSectionProps {
  sales: Sale[];
  shoppers: Shopper[];
  onAllocated?: () => void;
}

export function NeedsAllocationSection({ sales, shoppers, onAllocated }: NeedsAllocationSectionProps) {
  const [allocating, setAllocating] = useState<string | null>(null);
  const [allocated, setAllocated] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleAllocate = async (saleId: string, shopperId: string) => {
    if (!shopperId) return;

    setAllocating(saleId);
    setError(null);

    try {
      const res = await fetch('/api/sales/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId, shopperId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Allocation failed');
      }

      // Mark as allocated
      setAllocated(new Set([...allocated, saleId]));

      // Refresh parent component after a brief delay
      if (onAllocated) {
        setTimeout(() => onAllocated(), 1000);
      }
    } catch (err) {
      console.error('[NEEDS ALLOCATION] Allocation error:', err);
      setError(err instanceof Error ? err.message : 'Allocation failed');
    } finally {
      setAllocating(null);
    }
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return '£0';
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getClientName = (sale: Sale) => {
    // Priority: buyer.name -> buyer_name -> extract from internal_notes
    if (sale.buyer?.name) return sale.buyer.name;
    if (sale.buyer_name) return sale.buyer_name;

    // Try to extract client name from internal_notes
    if (sale.internal_notes) {
      const match = sale.internal_notes.match(/Client:\s*([^.]+)/);
      if (match) return match[1].trim();
    }

    return 'Unknown Client';
  };

  // Filter out already allocated sales
  const visibleSales = sales.filter(sale => !allocated.has(sale.id));

  if (visibleSales.length === 0) {
    return (
      <div className="mb-8 bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold text-green-900">All Invoices Allocated</h3>
            <p className="text-sm text-green-700">All imported invoices have been assigned to shoppers.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          <div>
            <h3 className="text-lg font-semibold text-amber-900">
              Unallocated Invoices ({visibleSales.length})
            </h3>
            <p className="text-sm text-amber-700">
              These invoices were imported from Xero and need to be assigned to a shopper.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-amber-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-amber-900 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">
                  Assign to Shopper
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-amber-100">
              {visibleSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-amber-50 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                    {formatDate(sale.sale_date)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {sale.xero_invoice_number || '—'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 max-w-xs truncate">
                    {getClientName(sale)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                    {formatCurrency(sale.sale_amount_inc_vat)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {allocated.has(sale.id) ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-medium">Allocated</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          onChange={(e) => handleAllocate(sale.id, e.target.value)}
                          disabled={allocating === sale.id}
                          className="appearance-none h-9 pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">Select shopper...</option>
                          {shoppers.map((shopper) => (
                            <option key={shopper.id} value={shopper.id}>
                              {shopper.name}
                            </option>
                          ))}
                        </select>
                        {allocating === sale.id && (
                          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
