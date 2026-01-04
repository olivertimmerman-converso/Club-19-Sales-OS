"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrandingThemeMapping } from '@/lib/branding-theme-mappings';

interface Sale {
  id: string;
  sale_reference: string | null;
  source: string | null;
  xero_invoice_number: string | null;
  xero_invoice_url: string | null;
  xero_invoice_id: string | null;
  sale_date: string | null;
  sale_amount_inc_vat: number;
  sale_amount_ex_vat: number;
  currency: string;
  brand: string | null;
  category: string | null;
  item_title: string | null;
  quantity: number;
  buy_price: number;
  shipping_cost: number;
  card_fees: number;
  direct_costs: number;
  gross_margin: number;
  commissionable_margin: number | null;
  branding_theme: string | null;
  invoice_status: string | null;
  invoice_paid_date: string | null;
  xero_payment_date: string | null;
  commission_locked: boolean;
  commission_paid: boolean;
  commission_amount: number | null;
  internal_notes: string | null;
  buyer: { id: string; name: string } | null;
  shopper: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  introducer: { id: string; name: string } | null;
}

interface Shopper {
  id: string;
  name: string;
}

interface XeroImport {
  id: string;
  xero_invoice_number: string;
  sale_date: string | null;
  sale_amount_inc_vat: number;
  currency: string;
  buyer_name: string;
}

interface SaleDetailClientProps {
  sale: Sale;
  shoppers: Shopper[];
  userRole: string | null;
  unallocatedXeroImports: XeroImport[];
}

/**
 * Helper function to interpret branding_theme and provide VAT logic explanation
 * Now supports both Xero branding theme GUIDs and friendly names
 */
function getVATLogicExplanation(brandingTheme: string | null, effectiveVATPercent: number) {
  // Get mapping from the branding theme mappings file
  const mapping = getBrandingThemeMapping(brandingTheme);

  if (!mapping) {
    return {
      accountCode: null,
      treatment: "Unknown",
      explanation: brandingTheme
        ? `Unrecognized branding theme ID: "${brandingTheme}". This theme may need to be added to lib/branding-theme-mappings.ts`
        : "No branding theme specified",
      expectedVAT: null,
      hasDiscrepancy: false,
      themeName: null,
    };
  }

  // Check for discrepancy (allow 0.5% tolerance for rounding)
  const hasDiscrepancy = mapping.expectedVAT !== null && Math.abs(effectiveVATPercent - mapping.expectedVAT) > 0.5;

  return {
    accountCode: mapping.accountCode,
    treatment: mapping.treatment,
    explanation: mapping.explanation,
    expectedVAT: mapping.expectedVAT,
    hasDiscrepancy,
    themeName: mapping.name,
  };
}

export function SaleDetailClient({ sale, shoppers, userRole, unallocatedXeroImports }: SaleDetailClientProps) {
  const router = useRouter();
  const [selectedShopperId, setSelectedShopperId] = useState(sale.shopper?.id || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Xero linking state
  const [selectedXeroImportId, setSelectedXeroImportId] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  const hasChanges = selectedShopperId !== (sale.shopper?.id || '');

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/sales/${sale.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopper: selectedShopperId || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update sale');
      }

      setSaveSuccess(true);

      // Refresh the page data after a short delay to show success message
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error) {
      console.error('Error updating sale:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to update sale');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedShopperId(sale.shopper?.id || '');
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleLinkXero = async () => {
    if (!selectedXeroImportId) return;

    setIsLinking(true);
    setLinkError(null);
    setLinkSuccess(false);

    try {
      const response = await fetch(`/api/sales/${sale.id}/link-xero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          xeroImportId: selectedXeroImportId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to link Xero invoice');
      }

      const data = await response.json();
      setLinkSuccess(true);

      // Refresh the page data after a short delay to show success message
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error('Error linking Xero invoice:', error);
      setLinkError(error instanceof Error ? error.message : 'Failed to link Xero invoice');
    } finally {
      setIsLinking(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return '£0';
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

  // Calculate margin percentage
  const marginPercent = sale.sale_amount_inc_vat
    ? ((sale.gross_margin || 0) / sale.sale_amount_inc_vat) * 100
    : 0;

  // Calculate total costs
  const totalCosts = sale.buy_price + sale.shipping_cost + sale.card_fees + sale.direct_costs;

  // Calculate effective VAT percentage and get VAT logic explanation
  const effectiveVATPercent = sale.sale_amount_ex_vat > 0
    ? (((sale.sale_amount_inc_vat - sale.sale_amount_ex_vat) / sale.sale_amount_ex_vat) * 100)
    : 0;
  const vatLogic = getVATLogicExplanation(sale.branding_theme, effectiveVATPercent);

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
    <div>
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
            {sale.sale_reference || `Sale #${sale.id.slice(0, 8)}`}
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

      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800">Sale updated successfully!</p>
        </div>
      )}
      {saveError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">{saveError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Item Details Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Item Details</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Invoice #</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {sale.xero_invoice_number || sale.sale_reference || '—'}
              </dd>
            </div>
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

        {/* Parties Card with Editable Shopper */}
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

            {/* Editable Shopper Dropdown */}
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">Shopper (Editable)</dt>
              <dd className="mt-1">
                <select
                  value={selectedShopperId}
                  onChange={(e) => {
                    setSelectedShopperId(e.target.value);
                    setSaveSuccess(false);
                    setSaveError(null);
                  }}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                  disabled={isSaving}
                >
                  <option value="">— Unassigned —</option>
                  {shoppers.map((shopper) => (
                    <option key={shopper.id} value={shopper.id}>
                      {shopper.name}
                    </option>
                  ))}
                </select>
              </dd>
            </div>

            {sale.introducer?.name && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Introducer</dt>
                <dd className="mt-1 text-sm text-gray-900">{sale.introducer.name}</dd>
              </div>
            )}
          </dl>

          {/* Action Buttons */}
          {hasChanges && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* VAT & Tax Information Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">VAT & Tax Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* VAT Breakdown */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">VAT Breakdown</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Sale (inc VAT)</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.sale_amount_inc_vat)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">Sale (ex VAT)</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatCurrency(sale.sale_amount_ex_vat)}
                  </dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <dt className="text-sm font-semibold text-gray-700">VAT Amount (20%)</dt>
                  <dd className="text-sm font-semibold text-gray-900">
                    {formatCurrency(sale.sale_amount_inc_vat - sale.sale_amount_ex_vat)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Tax Treatment */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Tax Treatment</h3>
              <dl className="space-y-2">
                {vatLogic.themeName && (
                  <div>
                    <dt className="text-sm text-gray-600">Branding Theme</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {vatLogic.themeName}
                    </dd>
                  </div>
                )}
                {vatLogic.accountCode && (
                  <div>
                    <dt className="text-sm text-gray-600">Account Code</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {vatLogic.accountCode}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-600">Tax Treatment</dt>
                  <dd className="text-sm font-medium text-gray-900">{vatLogic.treatment}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">Currency</dt>
                  <dd className="text-sm font-medium text-gray-900">{sale.currency}</dd>
                </div>
                {sale.source && (
                  <div>
                    <dt className="text-sm text-gray-600">Source</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {sale.source === 'atelier' ? 'Sales Atelier' : sale.source === 'xero_import' ? 'Xero Import' : sale.source}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* VAT Analysis */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">VAT Analysis</h3>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm text-gray-600">Effective VAT %</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {sale.sale_amount_ex_vat > 0
                      ? `${effectiveVATPercent.toFixed(1)}%`
                      : '—'}
                  </dd>
                </div>
                {vatLogic.expectedVAT !== null && (
                  <div>
                    <dt className="text-sm text-gray-600">Expected VAT %</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {vatLogic.expectedVAT.toFixed(1)}%
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-600">Status</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {vatLogic.hasDiscrepancy ? (
                      <span className="text-red-600">⚠️ Discrepancy</span>
                    ) : (
                      <span className="text-green-600">✓ Correct</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* VAT Logic Explanation */}
          {vatLogic.explanation && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                <span className="font-semibold">VAT Logic:</span> {vatLogic.explanation}
              </p>
            </div>
          )}

          {/* VAT Discrepancy Warning */}
          {vatLogic.hasDiscrepancy && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">
                <span className="font-semibold">⚠️ VAT Discrepancy:</span> The effective VAT rate ({effectiveVATPercent.toFixed(1)}%) does not match the expected rate ({vatLogic.expectedVAT?.toFixed(1)}%) for this tax treatment. This may indicate an error in the sale record.
              </p>
            </div>
          )}

          {/* VAT Warning if inc_vat = ex_vat */}
          {Math.abs(sale.sale_amount_inc_vat - sale.sale_amount_ex_vat) < 0.01 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Note:</span> Sale amounts (inc VAT) and (ex VAT) are identical. This may indicate that VAT has not been calculated for this sale.
              </p>
            </div>
          )}
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

        {/* Link to Xero Invoice (Superadmin only, Atelier sales) */}
        {userRole === 'superadmin' && sale.source === 'atelier' && unallocatedXeroImports.length > 0 && (
          <div className="bg-blue-50 rounded-lg border border-blue-200 shadow-sm p-6 lg:col-span-2">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <div className="flex-1">
                {sale.xero_invoice_id ? (
                  <>
                    <h2 className="text-lg font-semibold text-blue-900 mb-1">Re-link to Different Xero Invoice</h2>
                    <div className="mb-3 bg-blue-100 border border-blue-300 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-900">
                        Currently linked: <span className="font-bold">{sale.xero_invoice_number}</span>
                      </p>
                    </div>
                    <p className="text-sm text-blue-700 mb-4">
                      Need to link to a different invoice? This is useful when a manual invoice was sent before the Atelier record was created. The old invoice will remain in Xero as a Draft.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-blue-900 mb-1">Link to Xero Invoice</h2>
                    <p className="text-sm text-blue-700 mb-4">
                      This sale was created via Sales Atelier. If there&apos;s a duplicate invoice in Xero that was sent manually, you can link this record to that invoice for payment tracking.
                    </p>
                  </>
                )}

                {linkSuccess && (
                  <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-800">Successfully linked to Xero invoice! The duplicate has been removed from reporting.</p>
                  </div>
                )}
                {linkError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-800">{linkError}</p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <select
                    value={selectedXeroImportId}
                    onChange={(e) => {
                      setSelectedXeroImportId(e.target.value);
                      setLinkError(null);
                      setLinkSuccess(false);
                    }}
                    className="flex-1 rounded-md border-blue-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    disabled={isLinking}
                  >
                    <option value="">Select Xero Invoice...</option>
                    {unallocatedXeroImports.map((imp) => (
                      <option key={imp.id} value={imp.id}>
                        {imp.xero_invoice_number} - {imp.buyer_name} - £{imp.sale_amount_inc_vat.toLocaleString('en-GB')} ({formatDate(imp.sale_date)})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleLinkXero}
                    disabled={!selectedXeroImportId || isLinking}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLinking ? (sale.xero_invoice_id ? 'Re-linking...' : 'Linking...') : (sale.xero_invoice_id ? 'Re-link Invoice' : 'Link Invoice')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
