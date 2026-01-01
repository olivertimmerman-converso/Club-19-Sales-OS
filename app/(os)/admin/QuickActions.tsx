'use client';

import { useState } from 'react';
import { RefreshCw, Settings, CheckCircle, AlertCircle } from 'lucide-react';

interface SyncResult {
  success: boolean;
  summary?: {
    checked?: number;
    updated?: number;
  };
  error?: string;
  details?: string;
}

export function QuickActions() {
  const [syncingPayments, setSyncingPayments] = useState(false);
  const [runningMaintenance, setRunningMaintenance] = useState(false);
  const [paymentResult, setPaymentResult] = useState<SyncResult | null>(null);
  const [maintenanceResult, setMaintenanceResult] = useState<SyncResult | null>(null);

  const syncPayments = async () => {
    setSyncingPayments(true);
    setPaymentResult(null);

    try {
      const res = await fetch('/api/sync/payment-status', { method: 'POST' });
      const data = await res.json();
      setPaymentResult(data);

      // Auto-clear success message after 5 seconds
      if (data.success) {
        setTimeout(() => setPaymentResult(null), 5000);
      }
    } catch (err) {
      console.error('[QUICK ACTIONS] Payment sync error:', err);
      setPaymentResult({ success: false, error: 'Sync failed' });
    } finally {
      setSyncingPayments(false);
    }
  };

  const runMaintenance = async () => {
    setRunningMaintenance(true);
    setMaintenanceResult(null);

    try {
      const res = await fetch('/api/finance/daily-maintenance', { method: 'POST' });
      const data = await res.json();
      setMaintenanceResult(data);

      // Auto-clear success message after 5 seconds
      if (data.success) {
        setTimeout(() => setMaintenanceResult(null), 5000);
      }
    } catch (err) {
      console.error('[QUICK ACTIONS] Maintenance error:', err);
      setMaintenanceResult({ success: false, error: 'Maintenance failed' });
    } finally {
      setRunningMaintenance(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sync Xero Payments */}
        <div>
          <button
            onClick={syncPayments}
            disabled={syncingPayments}
            className="w-full flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-8 h-8 text-purple-600 mb-3 ${syncingPayments ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium text-gray-900">
              {syncingPayments ? 'Syncing...' : 'Sync Xero Payments'}
            </span>
            <span className="text-xs text-gray-500 mt-1">Update invoice status</span>
          </button>

          {/* Payment Sync Result */}
          {paymentResult && (
            <div className={`mt-2 p-2 rounded-lg text-xs ${paymentResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <div className="flex items-center gap-1">
                {paymentResult.success ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                <span className="font-medium">
                  {paymentResult.success && paymentResult.summary ? (
                    `${paymentResult.summary.checked || 0} checked, ${paymentResult.summary.updated || 0} updated`
                  ) : (
                    paymentResult.error || paymentResult.details || 'Error'
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Run Maintenance */}
        <div>
          <button
            onClick={runMaintenance}
            disabled={runningMaintenance}
            className="w-full flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Settings className={`w-8 h-8 text-purple-600 mb-3 ${runningMaintenance ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium text-gray-900">
              {runningMaintenance ? 'Running...' : 'Run Maintenance'}
            </span>
            <span className="text-xs text-gray-500 mt-1">Daily cleanup tasks</span>
          </button>

          {/* Maintenance Result */}
          {maintenanceResult && (
            <div className={`mt-2 p-2 rounded-lg text-xs ${maintenanceResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <div className="flex items-center gap-1">
                {maintenanceResult.success ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                <span className="font-medium">
                  {maintenanceResult.success ? 'Completed successfully' : (maintenanceResult.error || maintenanceResult.details || 'Error')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Placeholder buttons for future actions */}
        <button
          className="flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-lg opacity-50 cursor-not-allowed"
          disabled
        >
          <svg
            className="w-8 h-8 text-gray-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          <span className="text-sm font-medium text-gray-900">Coming Soon</span>
          <span className="text-xs text-gray-500 mt-1">Future action</span>
        </button>

        <button
          className="flex flex-col items-center justify-center p-6 bg-white border border-gray-200 rounded-lg opacity-50 cursor-not-allowed"
          disabled
        >
          <svg
            className="w-8 h-8 text-gray-400 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          <span className="text-sm font-medium text-gray-900">Coming Soon</span>
          <span className="text-xs text-gray-500 mt-1">Future action</span>
        </button>
      </div>
    </div>
  );
}
