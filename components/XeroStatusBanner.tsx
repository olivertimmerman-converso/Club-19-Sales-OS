/**
 * Club 19 Sales OS - Xero Status Banner
 *
 * Shows a warning banner when Xero is disconnected.
 * Only visible to admin/superadmin/finance/operations roles.
 */

"use client";

import { useEffect, useState } from "react";

interface XeroStatusBannerProps {
  role: string | null;
}

export function XeroStatusBanner({ role }: XeroStatusBannerProps) {
  const [xeroStatus, setXeroStatus] = useState<{
    connected: boolean;
    checked: boolean;
    error?: string;
  }>({ connected: true, checked: false });

  // Only check Xero status for roles that need to know
  const shouldCheck = role && ['admin', 'superadmin', 'finance', 'operations', 'founder'].includes(role);

  useEffect(() => {
    if (!shouldCheck) return;

    async function checkXeroStatus() {
      try {
        const response = await fetch('/api/health/xero');
        const data = await response.json();
        setXeroStatus({
          connected: data.healthy === true,
          checked: true,
          error: data.message,
        });
      } catch (error) {
        // If health check fails, assume disconnected
        setXeroStatus({
          connected: false,
          checked: true,
          error: 'Failed to check Xero status',
        });
      }
    }

    checkXeroStatus();

    // Re-check every 5 minutes
    const interval = setInterval(checkXeroStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [shouldCheck]);

  // Don't show banner if:
  // - Role doesn't need to know
  // - Haven't checked yet
  // - Xero is connected
  if (!shouldCheck || !xeroStatus.checked || xeroStatus.connected) {
    return null;
  }

  return (
    <div className="bg-red-600 text-white text-center py-2 px-4">
      <span className="font-medium">
        Xero is disconnected. Invoices cannot be created.
      </span>
      {role === 'superadmin' || role === 'admin' || role === 'founder' ? (
        <a
          href="/api/xero/oauth/authorize"
          className="underline ml-2 hover:text-red-100"
        >
          Reconnect now
        </a>
      ) : (
        <span className="ml-2 text-red-200">
          Please contact an admin to reconnect.
        </span>
      )}
    </div>
  );
}
