'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getInvoiceStatusDisplay } from '@/lib/invoice-status';

interface ClientDetailClientProps {
  client: {
    id: string;
    name: string | null;
    email: string | null;
    owner: { id: string; name: string } | null;
    owner_changed_at: string | null;
    owner_changed_by: string | null;
  };
  shoppers: { id: string; name: string }[];
  userRole: string | null;
  stats: {
    totalSpend: number;
    totalMargin: number;
    tradesCount: number;
    totalSales: number;
  };
  sales: Array<{
    id: string;
    sale_date: string | null;
    item_title: string | null;
    brand: string | null;
    sale_amount_inc_vat: number;
    gross_margin: number;
    xero_invoice_number: string | null;
    invoice_status: string | null;
    currency: string | null;
    source: string | null;
  }>;
}

export function ClientDetailClient({
  client,
  shoppers,
  userRole,
  stats,
  sales,
}: ClientDetailClientProps) {
  const router = useRouter();
  const [selectedOwner, setSelectedOwner] = useState<string>(client.owner?.id || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const isSuperadmin = userRole === 'superadmin';

  // Format currency
  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format datetime for tooltip
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Check if sale is paid
  const isPaid = (status: string | null) => {
    return status?.toUpperCase() === 'PAID';
  };

  // Format status badge — colours and labels live in lib/invoice-status.ts.
  const getStatusBadge = (status: string | null) => {
    if (!status) return <span className="text-gray-400">—</span>;
    const { label, colorClass } = getInvoiceStatusDisplay(status);
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
      >
        {label}
      </span>
    );
  };

  // Show toast notification
  const showNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // Auto-save owner change
  const handleOwnerChange = async (newOwnerId: string) => {
    setSelectedOwner(newOwnerId);
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: newOwnerId || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update owner');
      }

      const ownerName = newOwnerId
        ? shoppers.find(s => s.id === newOwnerId)?.name || 'Unknown'
        : 'Unassigned';
      showNotification(`Owner updated to ${ownerName}`);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to update owner');
      // Revert selection on error
      setSelectedOwner(client.owner?.id || '');
    } finally {
      setIsSaving(false);
    }
  };

  // Get owner display name
  const getOwnerDisplay = () => {
    if (selectedOwner) {
      return shoppers.find(s => s.id === selectedOwner)?.name || client.owner?.name || 'Unknown';
    }
    return null;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      <div
        className={`fixed top-4 right-4 z-50 transform transition-all duration-300 ease-out ${
          showToast ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      </div>

      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/clients"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Clients
        </Link>
      </div>

      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Client Name */}
            <h1 className="text-3xl font-semibold text-gray-900">
              {client.name || 'Unnamed Client'}
            </h1>

            {/* Client Info Row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Email */}
              {client.email && (
                <span className="text-gray-500 text-sm">{client.email}</span>
              )}

              {/* Divider */}
              {client.email && (
                <span className="text-gray-300">·</span>
              )}

              {/* Owner Badge/Dropdown */}
              {isSuperadmin ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">Managed by</span>
                  <div className="relative">
                    <select
                      value={selectedOwner}
                      onChange={(e) => handleOwnerChange(e.target.value)}
                      disabled={isSaving}
                      className={`appearance-none bg-transparent border-0 text-sm font-medium cursor-pointer focus:ring-0 focus:outline-none pr-6 py-0 ${
                        selectedOwner ? 'text-purple-600' : 'text-gray-400 italic'
                      } ${isSaving ? 'opacity-50' : ''}`}
                      style={{ paddingLeft: 0 }}
                    >
                      <option value="" className="text-gray-500">Unassigned</option>
                      {shoppers.map((shopper) => (
                        <option key={shopper.id} value={shopper.id} className="text-gray-900">
                          {shopper.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none">
                      {isSaving ? (
                        <svg className="animate-spin h-3 w-3 text-purple-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  {/* Last changed tooltip */}
                  {client.owner_changed_at && (
                    <div className="group relative">
                      <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        Changed {formatDateTime(client.owner_changed_at)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">Managed by</span>
                  {client.owner ? (
                    <span className="text-sm font-medium text-purple-600">{client.owner.name}</span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Unassigned</span>
                  )}
                </div>
              )}
            </div>

            {/* Error message */}
            {saveError && (
              <p className="mt-2 text-sm text-red-600">{saveError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500">Total Spend</h3>
            <div className="p-2 bg-purple-50 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.totalSpend)}</p>
          <p className="text-xs text-gray-500 mt-2">From {stats.tradesCount} paid invoice{stats.tradesCount !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500">Total Margin</h3>
            <div className="p-2 bg-green-50 rounded-lg">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(stats.totalMargin)}</p>
          <p className="text-xs text-gray-500 mt-2">
            {stats.totalSpend > 0 ? `${((stats.totalMargin / stats.totalSpend) * 100).toFixed(1)}% margin rate` : 'No sales yet'}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500">Sales Activity</h3>
            <div className="p-2 bg-blue-50 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.tradesCount}</p>
          <p className="text-xs text-gray-500 mt-2">
            {stats.totalSales > stats.tradesCount
              ? `${stats.totalSales - stats.tradesCount} pending payment`
              : 'All invoices paid'}
          </p>
        </div>
      </div>

      {/* Purchase History Section */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Purchase History</h2>
          {sales.length > 0 && (
            <span className="text-sm text-gray-500">{stats.totalSales} transaction{stats.totalSales !== 1 ? 's' : ''}</span>
          )}
        </div>

        {sales.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="h-8 w-8 text-gray-400"
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
            </div>
            <h3 className="text-sm font-medium text-gray-900">No purchases yet</h3>
            <p className="mt-1 text-sm text-gray-500">This client has not made any purchases.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Brand
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Margin
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Invoice
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sales.map((sale) => {
                    const paid = isPaid(sale.invoice_status);
                    return (
                      <tr
                        key={sale.id}
                        className={`hover:bg-gray-50/50 transition-colors ${!paid ? 'bg-gray-50/30' : ''}`}
                      >
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-600' : 'text-gray-400'}`}
                        >
                          {formatDate(sale.sale_date)}
                        </td>
                        <td className="px-6 py-4 text-sm max-w-xs">
                          <Link
                            href={`/sales/${sale.id}`}
                            className={`block truncate font-medium ${
                              paid
                                ? 'text-gray-900 hover:text-purple-600'
                                : 'text-gray-400 hover:text-gray-600'
                            } transition-colors`}
                          >
                            {sale.item_title || '—'}
                          </Link>
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-600' : 'text-gray-400'}`}
                        >
                          {sale.brand || '—'}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${paid ? 'text-gray-900' : 'text-gray-400'}`}
                        >
                          {formatCurrency(sale.sale_amount_inc_vat)}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${paid ? 'text-green-600' : 'text-gray-400'}`}
                        >
                          {formatCurrency(sale.gross_margin)}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm ${paid ? 'text-gray-500' : 'text-gray-400'}`}
                        >
                          {sale.xero_invoice_number || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(sale.invoice_status)}
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
