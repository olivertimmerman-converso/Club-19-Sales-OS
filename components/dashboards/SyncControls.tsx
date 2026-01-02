'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import * as logger from '@/lib/logger';

interface SyncResult {
  success: boolean;
  summary?: {
    total?: number;
    new?: number;
    updated?: number;
    skipped?: number;
    checked?: number;
    errors?: number;
  };
  error?: string;
  details?: string;
}

export function SyncControls({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncType, setSyncType] = useState<'invoices' | 'payments' | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const syncInvoices = async () => {
    setSyncing(true);
    setSyncType('invoices');
    setLastResult(null);

    try {
      const res = await fetch('/api/sync/xero-invoices', { method: 'POST' });
      const data = await res.json();
      setLastResult(data);
      if (data.success && onSyncComplete) {
        // Delay refresh to allow user to see success message
        setTimeout(() => onSyncComplete(), 1000);
      }
    } catch (err) {
      logger.error('DASHBOARD', 'Invoice sync error', { err: err as any } as any);
      setLastResult({ success: false, error: 'Sync failed' });
    } finally {
      setSyncing(false);
      setSyncType(null);
    }
  };

  const syncPayments = async () => {
    setSyncing(true);
    setSyncType('payments');
    setLastResult(null);

    try {
      const res = await fetch('/api/sync/payment-status', { method: 'POST' });
      const data = await res.json();
      setLastResult(data);
      if (data.success && onSyncComplete) {
        // Delay refresh to allow user to see success message
        setTimeout(() => onSyncComplete(), 1000);
      }
    } catch (err) {
      logger.error('DASHBOARD', 'Payment sync error', { err: err as any } as any);
      setLastResult({ success: false, error: 'Sync failed' });
    } finally {
      setSyncing(false);
      setSyncType(null);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={syncInvoices}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <RefreshCw className={`w-4 h-4 ${syncing && syncType === 'invoices' ? 'animate-spin' : ''}`} />
        {syncing && syncType === 'invoices' ? 'Syncing...' : 'Sync Invoices'}
      </button>

      <button
        onClick={syncPayments}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <RefreshCw className={`w-4 h-4 ${syncing && syncType === 'payments' ? 'animate-spin' : ''}`} />
        {syncing && syncType === 'payments' ? 'Updating...' : 'Update Payments'}
      </button>

      {lastResult && (
        <div className={`flex items-center gap-2 text-sm font-medium ${lastResult.success ? 'text-green-600' : 'text-red-600'}`}>
          {lastResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {lastResult.success && lastResult.summary ? (
            <span>
              {lastResult.summary.new !== undefined && lastResult.summary.new > 0 && `${lastResult.summary.new} new`}
              {lastResult.summary.new !== undefined && lastResult.summary.new > 0 && lastResult.summary.updated !== undefined && lastResult.summary.updated > 0 && ', '}
              {lastResult.summary.updated !== undefined && lastResult.summary.updated > 0 && `${lastResult.summary.updated} updated`}
              {lastResult.summary.checked !== undefined && `${lastResult.summary.checked} checked`}
              {(lastResult.summary.new === 0 && lastResult.summary.updated === 0 && lastResult.summary.checked === 0) && 'No changes'}
            </span>
          ) : (
            <span>{lastResult.error || lastResult.details || 'Error'}</span>
          )}
        </div>
      )}
    </div>
  );
}
