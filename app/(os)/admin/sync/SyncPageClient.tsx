'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, AlertTriangle, ChevronDown, ChevronUp, Info, FileEdit, X, RotateCcw, Archive } from 'lucide-react';

interface Sale {
  id: string;
  xero_invoice_id: string | null;
  xero_invoice_number: string | null;
  sale_amount_inc_vat: number;
  sale_date: string | null;
  buyer_name: string | null;
  internal_notes: string | null;
  buyer: { name: string } | null;
}

interface DismissedSale extends Sale {
  dismissed_at: string | null;
}

interface Shopper {
  id: string;
  name: string;
}

type PeriodFilter = '2026' | 'this-month' | 'last-3-months' | 'all';

interface Props {
  unallocatedSales: Sale[];
  dismissedSales: DismissedSale[];
  shoppers: Shopper[];
  currentPeriod: PeriodFilter;
}

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '2026', label: '2026 only' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'all', label: 'All time' },
];

export function SyncPageClient({ unallocatedSales, dismissedSales, shoppers, currentPeriod }: Props) {
  const router = useRouter();

  const handlePeriodChange = (newPeriod: PeriodFilter) => {
    const url = new URL(window.location.href);
    if (newPeriod === '2026') {
      url.searchParams.delete('period'); // Default, no need to show in URL
    } else {
      url.searchParams.set('period', newPeriod);
    }
    router.push(url.pathname + url.search);
  };
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [allocated, setAllocated] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  // Combined sync function - does both invoices AND payment statuses
  const syncWithXero = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);

    const results: { invoices?: any; payments?: any } = {};

    try {
      // Step 1: Sync invoices (last 60 days)
      setSyncStep('Syncing invoices...');
      const invoicesRes = await fetch('/api/sync/xero-invoices', { method: 'POST' });
      const invoicesData = await invoicesRes.json();
      results.invoices = invoicesData;

      if (!invoicesData.success) {
        throw new Error(invoicesData.details || invoicesData.error || 'Invoice sync failed');
      }

      // Step 2: Update payment statuses
      setSyncStep('Updating payment statuses...');
      const paymentsRes = await fetch('/api/sync/payment-status', { method: 'POST' });
      const paymentsData = await paymentsRes.json();
      results.payments = paymentsData;

      if (!paymentsData.success) {
        throw new Error(paymentsData.details || paymentsData.error || 'Payment status sync failed');
      }

      // Success!
      setSyncResult({
        success: true,
        summary: {
          invoicesNew: results.invoices?.summary?.new || 0,
          invoicesUpdated: results.invoices?.summary?.updated || 0,
          paymentsChecked: results.payments?.summary?.checked || 0,
          paymentsUpdated: results.payments?.summary?.updated || 0,
        },
      });
      setTimeout(() => router.refresh(), 1000);

    } catch (err) {
      console.error('[SYNC] Sync error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMsg);
      setSyncResult({ success: false, error: errorMsg, partial: results });
    } finally {
      setSyncing(false);
      setSyncStep(null);
    }
  };

  // Full historical sync (advanced)
  const fullHistoricalSync = async () => {
    if (!confirm('Full sync will fetch ALL invoices from Xero history and update dates on existing records. This may take several minutes. Continue?')) {
      return;
    }

    setSyncing(true);
    setSyncStep('Running full historical sync...');
    setSyncResult(null);
    setError(null);

    try {
      const res = await fetch('/api/sync/xero-invoices?full=true', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);

      if (data.success) {
        setTimeout(() => router.refresh(), 1000);
      } else {
        const errorMsg = data.details || data.error || 'Sync failed';
        setError(errorMsg);
      }
    } catch (err) {
      console.error('[SYNC] Full sync error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMsg);
      setSyncResult({ success: false, error: errorMsg });
    } finally {
      setSyncing(false);
      setSyncStep(null);
    }
  };

  const allocate = async (saleId: string, shopperId: string) => {
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

      // Refresh after brief delay
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      console.error('[SYNC] Allocation error:', err);
      setError(err instanceof Error ? err.message : 'Allocation failed');
    } finally {
      setAllocating(null);
    }
  };

  const handleDismiss = async (saleId: string) => {
    setDismissing(saleId);
    setError(null);
    try {
      const res = await fetch(`/api/sync/unallocated/${saleId}/dismiss`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Dismiss failed');
      }

      // Mark as dismissed locally
      setDismissed(new Set([...dismissed, saleId]));

      // Refresh after brief delay
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      console.error('[SYNC] Dismiss error:', err);
      setError(err instanceof Error ? err.message : 'Failed to dismiss invoice');
    } finally {
      setDismissing(null);
    }
  };

  const handleRestore = async (saleId: string) => {
    setRestoring(saleId);
    setError(null);
    try {
      const res = await fetch(`/api/sync/unallocated/${saleId}/restore`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || 'Restore failed');
      }

      // Mark as restored locally
      setRestored(new Set([...restored, saleId]));

      // Refresh after brief delay
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      console.error('[SYNC] Restore error:', err);
      setError(err instanceof Error ? err.message : 'Failed to restore invoice');
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
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

  // Filter out already allocated or dismissed sales
  const visibleSales = unallocatedSales.filter(sale => !allocated.has(sale.id) && !dismissed.has(sale.id));

  // Filter out restored dismissed sales
  const visibleDismissedSales = dismissedSales.filter(sale => !restored.has(sale.id));

  return (
    <div className="space-y-6">
      {/* Sync Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-2 text-gray-900">Sync Controls</h2>

        {/* Info note */}
        <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            Invoices sync automatically via webhook. Use this button only if something appears out of sync.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Main sync button */}
          <button
            onClick={syncWithXero}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? (syncStep || 'Syncing...') : 'Sync with Xero'}
          </button>

          {/* Sync result */}
          {syncResult && (
            <div className={`flex items-center gap-2 text-sm font-medium ${syncResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {syncResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {syncResult.success && syncResult.summary ? (
                <span>
                  {syncResult.summary.invoicesNew > 0 && `${syncResult.summary.invoicesNew} new invoices`}
                  {syncResult.summary.invoicesNew > 0 && syncResult.summary.invoicesUpdated > 0 && ', '}
                  {syncResult.summary.invoicesUpdated > 0 && `${syncResult.summary.invoicesUpdated} updated`}
                  {syncResult.summary.paymentsUpdated > 0 && `, ${syncResult.summary.paymentsUpdated} payment statuses updated`}
                  {(syncResult.summary.invoicesNew === 0 && syncResult.summary.invoicesUpdated === 0 && syncResult.summary.paymentsUpdated === 0) && 'Already up to date'}
                </span>
              ) : (
                <span>{syncResult.error || 'Error'}</span>
              )}
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 mb-1">Sync Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              {/* Show Reconnect button if error suggests auth issue */}
              {(error.toLowerCase().includes('xero') &&
                (error.toLowerCase().includes('expired') ||
                 error.toLowerCase().includes('connect') ||
                 error.toLowerCase().includes('unauthorized') ||
                 error.toLowerCase().includes('token'))) && (
                <a
                  href="/api/xero/oauth/authorize"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors whitespace-nowrap"
                >
                  Reconnect Xero
                </a>
              )}
            </div>
          </div>
        )}

        {/* Advanced section */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-3">
                Full historical sync fetches ALL invoices from Xero (not just last 60 days). Only use if you need to backfill historical data.
              </p>
              <button
                onClick={fullHistoricalSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                Full Historical Sync
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Needs Allocation */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {visibleSales.length === 0 ? (
          <div className="p-6 bg-green-50 border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900">All Invoices Allocated</h3>
                  <p className="text-sm text-green-700">
                    All imported invoices for this period have been assigned to shoppers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="period-filter-empty" className="text-sm font-medium text-green-700">
                  Show:
                </label>
                <select
                  id="period-filter-empty"
                  value={currentPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value as PeriodFilter)}
                  className="appearance-none h-9 pl-3 pr-8 py-1.5 bg-white border border-green-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors cursor-pointer"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
                <div>
                  <h2 className="text-lg font-semibold text-amber-900">
                    Unallocated Invoices ({visibleSales.length})
                  </h2>
                  <p className="text-sm text-amber-700">
                    These invoices were imported from Xero and need to be assigned to a shopper.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="period-filter" className="text-sm font-medium text-gray-600">
                  Show:
                </label>
                <select
                  id="period-filter"
                  value={currentPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value as PeriodFilter)}
                  className="appearance-none h-9 pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors cursor-pointer"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
                    <th className="px-4 py-3 text-center text-xs font-medium text-amber-900 uppercase tracking-wider">
                      Actions
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
                              onChange={(e) => allocate(sale.id, e.target.value)}
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
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          {sale.xero_invoice_id ? (
                            <Link
                              href={`/admin/sync/adopt/${sale.xero_invoice_id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-colors"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              Adopt
                            </Link>
                          ) : (
                            <span className="text-gray-400 text-xs">No Xero ID</span>
                          )}
                          <button
                            onClick={() => handleDismiss(sale.id)}
                            disabled={dismissing === sale.id}
                            className="inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Dismiss invoice"
                          >
                            {dismissing === sale.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Dismissed Invoices Section */}
      {(visibleDismissedSales.length > 0 || dismissedSales.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-3">
              <Archive className="w-5 h-5 text-gray-400" />
              <div>
                <h3 className="text-sm font-medium text-gray-700">
                  Dismissed Invoices ({visibleDismissedSales.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Test invoices or duplicates that have been hidden
                </p>
              </div>
            </div>
            {showDismissed ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showDismissed && visibleDismissedSales.length > 0 && (
            <div className="border-t border-gray-200 p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoice #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dismissed
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {visibleDismissedSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(sale.sale_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {sale.xero_invoice_number || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                          {getClientName(sale)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                          {formatCurrency(sale.sale_amount_inc_vat)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400">
                          {formatDate(sale.dismissed_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                          <button
                            onClick={() => handleRestore(sale.id)}
                            disabled={restoring === sale.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {restoring === sale.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showDismissed && visibleDismissedSales.length === 0 && (
            <div className="border-t border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-500">No dismissed invoices</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
