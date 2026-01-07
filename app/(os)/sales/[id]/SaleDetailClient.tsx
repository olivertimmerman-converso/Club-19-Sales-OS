"use client";

import { useState, useEffect } from 'react';
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
  commission_clawback: boolean;
  commission_clawback_date: string | null;
  commission_clawback_reason: string | null;
  internal_notes: string | null;
  buyer: { id: string; name: string } | null;
  shopper: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  introducer: { id: string; name: string } | null;
  has_introducer: boolean;
  introducer_commission: number | null;
  is_payment_plan: boolean;
  payment_plan_instalments: number | null;
}

interface PaymentInstalment {
  id: string;
  instalment_number: number;
  due_date: string | null;
  amount: number;
  status: string;
  paid_date: string | null;
  xero_invoice_id: string | null;
  xero_invoice_number: string | null;
  notes: string | null;
}

interface Shopper {
  id: string;
  name: string;
}

interface Introducer {
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

  // Fix VAT state
  const [isFixingVAT, setIsFixingVAT] = useState(false);
  const [fixVATError, setFixVATError] = useState<string | null>(null);
  const [fixVATSuccess, setFixVATSuccess] = useState(false);

  // Introducer management state
  const [introducers, setIntroducers] = useState<Introducer[]>([]);
  const [selectedIntroducerId, setSelectedIntroducerId] = useState(sale.introducer?.id || '');
  const [introducerCommission, setIntroducerCommission] = useState(sale.introducer_commission?.toString() || '');
  const [showAddNew, setShowAddNew] = useState(false);
  const [newIntroducerName, setNewIntroducerName] = useState('');
  const [isLoadingIntroducers, setIsLoadingIntroducers] = useState(false);
  const [isSavingIntroducer, setIsSavingIntroducer] = useState(false);
  const [introducerSaveError, setIntroducerSaveError] = useState<string | null>(null);
  const [introducerSaveSuccess, setIntroducerSaveSuccess] = useState(false);

  // Payment plan state
  const [instalments, setInstalments] = useState<PaymentInstalment[]>([]);
  const [isLoadingInstalments, setIsLoadingInstalments] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [showEditInstalmentModal, setShowEditInstalmentModal] = useState(false);
  const [editingInstalment, setEditingInstalment] = useState<PaymentInstalment | null>(null);
  const [numberOfInstalments, setNumberOfInstalments] = useState(3);
  const [planInstalments, setPlanInstalments] = useState<Array<{ due_date: string; amount: string }>>([]);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [isSavingInstalment, setIsSavingInstalment] = useState(false);
  const [paymentPlanError, setPaymentPlanError] = useState<string | null>(null);
  const [paymentPlanSuccess, setPaymentPlanSuccess] = useState<string | null>(null);

  // Commission clawback state
  const [showClawbackModal, setShowClawbackModal] = useState(false);
  const [clawbackReason, setClawbackReason] = useState('');
  const [isProcessingClawback, setIsProcessingClawback] = useState(false);
  const [clawbackError, setClawbackError] = useState<string | null>(null);

  // Fetch introducers on mount
  useEffect(() => {
    const fetchIntroducers = async () => {
      setIsLoadingIntroducers(true);
      try {
        const response = await fetch('/api/introducers');
        if (!response.ok) {
          throw new Error('Failed to fetch introducers');
        }
        const data = await response.json();
        setIntroducers(data);
      } catch (error) {
        console.error('Error fetching introducers:', error);
      } finally {
        setIsLoadingIntroducers(false);
      }
    };

    fetchIntroducers();
  }, []);

  // Fetch payment instalments if this is a payment plan
  useEffect(() => {
    const fetchInstalments = async () => {
      if (!sale.is_payment_plan) return;

      setIsLoadingInstalments(true);
      try {
        const response = await fetch(`/api/sales/${sale.id}/payment-schedule`);
        if (!response.ok) {
          throw new Error('Failed to fetch instalments');
        }
        const data = await response.json();
        setInstalments(data.instalments || []);
      } catch (error) {
        console.error('Error fetching instalments:', error);
      } finally {
        setIsLoadingInstalments(false);
      }
    };

    fetchInstalments();
  }, [sale.is_payment_plan, sale.id]);

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

  const handleFixVAT = async () => {
    setIsFixingVAT(true);
    setFixVATError(null);
    setFixVATSuccess(false);

    try {
      const response = await fetch(`/api/sales/${sale.id}/fix-vat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fix VAT');
      }

      const data = await response.json();
      setFixVATSuccess(true);

      // Refresh the page data after a short delay to show success message
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error('Error fixing VAT:', error);
      setFixVATError(error instanceof Error ? error.message : 'Failed to fix VAT');
    } finally {
      setIsFixingVAT(false);
    }
  };

  const handleSaveIntroducer = async () => {
    setIsSavingIntroducer(true);
    setIntroducerSaveError(null);
    setIntroducerSaveSuccess(false);

    try {
      let introducerIdToSave = selectedIntroducerId;

      // If "add new" is selected, create the introducer first
      if (showAddNew && newIntroducerName.trim()) {
        const createResponse = await fetch('/api/introducers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newIntroducerName.trim(),
          }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(errorData.error || 'Failed to create introducer');
        }

        const newIntroducer = await createResponse.json();
        introducerIdToSave = newIntroducer.id;

        // Add to local list
        setIntroducers([...introducers, newIntroducer]);
        setShowAddNew(false);
        setNewIntroducerName('');
      }

      // Save introducer assignment to sale
      const response = await fetch(`/api/sales/${sale.id}/introducer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          introducerId: introducerIdToSave || null,
          introducerCommission: introducerCommission ? parseFloat(introducerCommission) : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save introducer');
      }

      setIntroducerSaveSuccess(true);

      // Refresh the page data after a short delay to show success message
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error('Error saving introducer:', error);
      setIntroducerSaveError(error instanceof Error ? error.message : 'Failed to save introducer');
    } finally {
      setIsSavingIntroducer(false);
    }
  };

  // Payment plan handlers
  const handleCreatePaymentPlan = () => {
    // Auto-suggest even split
    const amountPerInstalment = sale.sale_amount_inc_vat / numberOfInstalments;
    const suggestedInstalments = Array.from({ length: numberOfInstalments }, (_, i) => ({
      due_date: '',
      amount: amountPerInstalment.toFixed(2),
    }));
    setPlanInstalments(suggestedInstalments);
    setShowCreatePlanModal(true);
    setPaymentPlanError(null);
    setPaymentPlanSuccess(null);
  };

  const handleSavePaymentPlan = async () => {
    setIsCreatingPlan(true);
    setPaymentPlanError(null);

    try {
      const instalmentsData = planInstalments.map((inst, idx) => ({
        instalment_number: idx + 1,
        due_date: inst.due_date || null,
        amount: parseFloat(inst.amount),
        status: 'scheduled',
      }));

      const response = await fetch(`/api/sales/${sale.id}/payment-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instalments: instalmentsData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment plan');
      }

      setPaymentPlanSuccess('Payment plan created successfully!');
      setShowCreatePlanModal(false);

      // Refresh the page
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error('Error creating payment plan:', error);
      setPaymentPlanError(error instanceof Error ? error.message : 'Failed to create payment plan');
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const handleDeletePaymentPlan = async () => {
    if (!confirm('Are you sure you want to remove this payment plan? This will delete all instalments.')) {
      return;
    }

    setIsDeletingPlan(true);
    setPaymentPlanError(null);

    try {
      const response = await fetch(`/api/sales/${sale.id}/payment-schedule`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete payment plan');
      }

      setPaymentPlanSuccess('Payment plan removed successfully!');

      // Refresh the page
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (error) {
      console.error('Error deleting payment plan:', error);
      setPaymentPlanError(error instanceof Error ? error.message : 'Failed to delete payment plan');
    } finally {
      setIsDeletingPlan(false);
    }
  };

  const handleEditInstalment = (instalment: PaymentInstalment) => {
    setEditingInstalment(instalment);
    setShowEditInstalmentModal(true);
    setPaymentPlanError(null);
  };

  const handleSaveInstalment = async () => {
    if (!editingInstalment) return;

    setIsSavingInstalment(true);
    setPaymentPlanError(null);

    try {
      const response = await fetch(`/api/payment-schedule/${editingInstalment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingInstalment),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update instalment');
      }

      setPaymentPlanSuccess('Instalment updated successfully!');
      setShowEditInstalmentModal(false);

      // Refresh instalments
      const refetchResponse = await fetch(`/api/sales/${sale.id}/payment-schedule`);
      if (refetchResponse.ok) {
        const data = await refetchResponse.json();
        setInstalments(data.instalments || []);
      }
    } catch (error) {
      console.error('Error updating instalment:', error);
      setPaymentPlanError(error instanceof Error ? error.message : 'Failed to update instalment');
    } finally {
      setIsSavingInstalment(false);
    }
  };

  // Commission clawback handler
  const handleProcessClawback = async () => {
    if (!clawbackReason.trim()) {
      setClawbackError('Please provide a reason for the clawback');
      return;
    }

    setIsProcessingClawback(true);
    setClawbackError(null);

    try {
      const response = await fetch(`/api/sales/${sale.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commission_clawback: true,
          commission_clawback_date: new Date().toISOString(),
          commission_clawback_reason: clawbackReason.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process clawback');
      }

      // Refresh the page
      setTimeout(() => {
        router.refresh();
        setShowClawbackModal(false);
      }, 500);
    } catch (error) {
      console.error('Error processing clawback:', error);
      setClawbackError(error instanceof Error ? error.message : 'Failed to process clawback');
    } finally {
      setIsProcessingClawback(false);
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

  // Format instalment status badge
  const getInstalmentStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
      'paid': { color: 'bg-green-100 text-green-800', icon: '✓', label: 'Paid' },
      'invoiced': { color: 'bg-yellow-100 text-yellow-800', icon: '●', label: 'Invoiced' },
      'scheduled': { color: 'bg-gray-100 text-gray-800', icon: '○', label: 'Scheduled' },
    };

    const config = statusConfig[status] || statusConfig['scheduled'];

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.icon} {config.label}
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
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-red-800 flex-1">
                  <span className="font-semibold">⚠️ VAT Discrepancy:</span> The effective VAT rate ({effectiveVATPercent.toFixed(1)}%) does not match the expected rate ({vatLogic.expectedVAT?.toFixed(1)}%) for this tax treatment. This may indicate an error in the sale record.
                </p>
                {userRole === 'superadmin' && (
                  <button
                    onClick={handleFixVAT}
                    disabled={isFixingVAT}
                    className="px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {isFixingVAT ? 'Fixing...' : 'Fix VAT'}
                  </button>
                )}
              </div>
              {fixVATError && (
                <p className="mt-2 text-sm text-red-600">Error: {fixVATError}</p>
              )}
              {fixVATSuccess && (
                <p className="mt-2 text-sm text-green-600 font-medium">✓ VAT fixed successfully! Refreshing...</p>
              )}
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
              {sale.introducer_commission && (
                <div className="flex justify-between pt-2 border-t border-green-200">
                  <dt className="text-sm text-green-800">Less Introducer Fee</dt>
                  <dd className="text-sm font-medium text-red-700">
                    -{formatCurrency(sale.introducer_commission)}
                  </dd>
                </div>
              )}
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

        {/* Introducer Management Card - Only show if has_introducer is true OR introducer exists */}
        {(sale.has_introducer || sale.introducer) && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Introducer</h2>

            {/* Success/Error Messages */}
            {introducerSaveSuccess && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-medium text-green-800">Introducer updated successfully!</p>
              </div>
            )}
            {introducerSaveError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-medium text-red-800">{introducerSaveError}</p>
              </div>
            )}

            <div className="space-y-4">
              {/* Introducer Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Introducer
                </label>
                <select
                  value={showAddNew ? 'add_new' : selectedIntroducerId}
                  onChange={(e) => {
                    if (e.target.value === 'add_new') {
                      setShowAddNew(true);
                      setSelectedIntroducerId('');
                    } else {
                      setShowAddNew(false);
                      setSelectedIntroducerId(e.target.value);
                      setIntroducerSaveError(null);
                      setIntroducerSaveSuccess(false);
                    }
                  }}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                  disabled={isSavingIntroducer || isLoadingIntroducers}
                >
                  <option value="">— Select Introducer —</option>
                  {introducers.map((introducer) => (
                    <option key={introducer.id} value={introducer.id}>
                      {introducer.name}
                    </option>
                  ))}
                  <option value="add_new">+ Add New Introducer</option>
                </select>
              </div>

              {/* Add New Introducer Input */}
              {showAddNew && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Introducer Name
                  </label>
                  <input
                    type="text"
                    value={newIntroducerName}
                    onChange={(e) => setNewIntroducerName(e.target.value)}
                    placeholder="Enter introducer name..."
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    disabled={isSavingIntroducer}
                  />
                </div>
              )}

              {/* Commission Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commission Amount (£)
                </label>
                <input
                  type="number"
                  value={introducerCommission}
                  onChange={(e) => {
                    setIntroducerCommission(e.target.value);
                    setIntroducerSaveError(null);
                    setIntroducerSaveSuccess(false);
                  }}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                  disabled={isSavingIntroducer}
                />
              </div>

              {/* Save Button */}
              <div>
                <button
                  onClick={handleSaveIntroducer}
                  disabled={isSavingIntroducer || isLoadingIntroducers || (!selectedIntroducerId && !showAddNew)}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingIntroducer ? 'Saving...' : 'Save Introducer'}
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Payment Plan Section */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Payment Plan</h2>
            {!sale.is_payment_plan && (
              <button
                onClick={handleCreatePaymentPlan}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Convert to Payment Plan
              </button>
            )}
          </div>

          {/* Success/Error Messages */}
          {paymentPlanSuccess && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-800">{paymentPlanSuccess}</p>
            </div>
          )}
          {paymentPlanError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800">{paymentPlanError}</p>
            </div>
          )}

          {!sale.is_payment_plan ? (
            <p className="text-sm text-gray-500">
              This sale is not set up as a payment plan. Click &quot;Convert to Payment Plan&quot; to split the payment into instalments.
            </p>
          ) : (
            <>
              {isLoadingInstalments ? (
                <p className="text-sm text-gray-500">Loading instalments...</p>
              ) : (
                <>
                  {/* Payment Plan Summary */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {instalments.filter(i => i.status === 'paid').length} of {instalments.length} instalments paid
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(instalments.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0))} / {formatCurrency(instalments.reduce((sum, i) => sum + i.amount, 0))}
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-green-600 h-2.5 rounded-full transition-all"
                        style={{
                          width: `${instalments.length > 0 ? (instalments.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0) / instalments.reduce((sum, i) => sum + i.amount, 0)) * 100 : 0}%`
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Instalments Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xero Invoice</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {instalments.map((instalment) => (
                          <tr key={instalment.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {instalment.instalment_number}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(instalment.due_date)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {formatCurrency(instalment.amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {getInstalmentStatusBadge(instalment.status)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {instalment.xero_invoice_number || '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              <button
                                onClick={() => handleEditInstalment(instalment)}
                                className="text-purple-600 hover:text-purple-900 font-medium"
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Remove Payment Plan Button */}
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={handleDeletePaymentPlan}
                      disabled={isDeletingPlan}
                      className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isDeletingPlan ? 'Removing...' : 'Remove Payment Plan'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Create Payment Plan Modal */}
        {showCreatePlanModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Payment Plan</h3>

                {/* Number of Instalments */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of Instalments
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={numberOfInstalments}
                    onChange={(e) => {
                      const num = parseInt(e.target.value);
                      setNumberOfInstalments(num);
                      // Recalculate suggested instalments
                      const amountPerInstalment = sale.sale_amount_inc_vat / num;
                      const suggested = Array.from({ length: num }, () => ({
                        due_date: '',
                        amount: amountPerInstalment.toFixed(2),
                      }));
                      setPlanInstalments(suggested);
                    }}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                  />
                </div>

                {/* Instalments */}
                <div className="space-y-4 mb-6">
                  {planInstalments.map((inst, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Instalment {idx + 1}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Due Date
                          </label>
                          <input
                            type="date"
                            value={inst.due_date}
                            onChange={(e) => {
                              const updated = [...planInstalments];
                              updated[idx].due_date = e.target.value;
                              setPlanInstalments(updated);
                            }}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Amount (£)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={inst.amount}
                            onChange={(e) => {
                              const updated = [...planInstalments];
                              updated[idx].amount = e.target.value;
                              setPlanInstalments(updated);
                            }}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">Total Instalments:</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(planInstalments.reduce((sum, i) => sum + parseFloat(i.amount || '0'), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="font-medium text-gray-700">Sale Amount:</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(sale.sale_amount_inc_vat)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSavePaymentPlan}
                    disabled={isCreatingPlan}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreatingPlan ? 'Creating...' : 'Create Payment Plan'}
                  </button>
                  <button
                    onClick={() => setShowCreatePlanModal(false)}
                    disabled={isCreatingPlan}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Instalment Modal */}
        {showEditInstalmentModal && editingInstalment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Edit Instalment #{editingInstalment.instalment_number}
                </h3>

                <div className="space-y-4 mb-6">
                  {/* Due Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editingInstalment.due_date || ''}
                      onChange={(e) => setEditingInstalment({ ...editingInstalment, due_date: e.target.value })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingInstalment.amount}
                      onChange={(e) => setEditingInstalment({ ...editingInstalment, amount: parseFloat(e.target.value) })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={editingInstalment.status}
                      onChange={(e) => setEditingInstalment({ ...editingInstalment, status: e.target.value })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="invoiced">Invoiced</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>

                  {/* Xero Invoice Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Xero Invoice Number (optional)
                    </label>
                    <input
                      type="text"
                      value={editingInstalment.xero_invoice_number || ''}
                      onChange={(e) => setEditingInstalment({ ...editingInstalment, xero_invoice_number: e.target.value })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    />
                  </div>

                  {/* Paid Date (only if status is paid) */}
                  {editingInstalment.status === 'paid' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Paid Date
                      </label>
                      <input
                        type="date"
                        value={editingInstalment.paid_date || ''}
                        onChange={(e) => setEditingInstalment({ ...editingInstalment, paid_date: e.target.value })}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes (optional)
                    </label>
                    <textarea
                      rows={3}
                      value={editingInstalment.notes || ''}
                      onChange={(e) => setEditingInstalment({ ...editingInstalment, notes: e.target.value })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveInstalment}
                    disabled={isSavingInstalment}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingInstalment ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setShowEditInstalmentModal(false)}
                    disabled={isSavingInstalment}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Commission Clawback Modal */}
        {showClawbackModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Process Commission Clawback</h3>
                  <button
                    onClick={() => {
                      setShowClawbackModal(false);
                      setClawbackReason('');
                      setClawbackError(null);
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Warning */}
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-red-800">
                        This will mark the commission as clawed back. This action records that the commission payment must be recovered from the shopper.
                      </p>
                    </div>
                  </div>

                  {/* Reason Input */}
                  <div>
                    <label htmlFor="clawback-reason" className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Clawback <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="clawback-reason"
                      value={clawbackReason}
                      onChange={(e) => setClawbackReason(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="e.g., Payment plan defaulted - customer failed to pay instalments 2 and 3"
                      disabled={isProcessingClawback}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Provide details about why the commission is being clawed back
                    </p>
                  </div>

                  {/* Error Display */}
                  {clawbackError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-800">{clawbackError}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowClawbackModal(false);
                        setClawbackReason('');
                        setClawbackError(null);
                      }}
                      disabled={isProcessingClawback}
                      className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleProcessClawback}
                      disabled={isProcessingClawback || !clawbackReason.trim()}
                      className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isProcessingClawback ? 'Processing...' : 'Process Clawback'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Commission Status & Clawback (Superadmin/Finance only) */}
        {(userRole === 'superadmin' || userRole === 'finance') && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Commission Status</h2>

            <div className="space-y-4">
              {/* Commission Status Display */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">Commission Paid</p>
                  <p className={`text-lg font-semibold ${sale.commission_paid ? 'text-green-600' : 'text-gray-400'}`}>
                    {sale.commission_paid ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Commission Clawed Back</p>
                  <p className={`text-lg font-semibold ${sale.commission_clawback ? 'text-red-600' : 'text-gray-400'}`}>
                    {sale.commission_clawback ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              {/* Clawback Details (if clawed back) */}
              {sale.commission_clawback && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-900 mb-2">Clawback Details</p>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-red-700">Date:</dt>
                      <dd className="font-medium text-red-900">{formatDate(sale.commission_clawback_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-red-700 mb-1">Reason:</dt>
                      <dd className="font-medium text-red-900">{sale.commission_clawback_reason || 'No reason provided'}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Warning: Payment Plan with Commission Paid */}
              {!sale.commission_clawback && sale.is_payment_plan && sale.commission_paid && (
                <>
                  {/* Check if there are unpaid instalments */}
                  {instalments.some(i => i.status !== 'paid') && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-900 mb-1">
                            Commission Paid - Clawback May Be Required
                          </p>
                          <p className="text-xs text-yellow-700">
                            This payment plan has unpaid instalments. If the invoice is cancelled, commission clawback will be required.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Clawback Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowClawbackModal(true)}
                      className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                    >
                      Mark Commission Clawed Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

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
