/**
 * Club 19 Sales OS - Sale Detail Page (Admin/Finance)
 *
 * Full sale detail view with financial breakdown, lifecycle management,
 * and error tracking. Accessible only to admin, finance, and superadmin roles.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AuthenticityBadge } from "@/components/ui/AuthenticityBadge";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { ErrorBlock } from "@/components/ui/ErrorBlock";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { useUserRole } from "@/lib/rbac-client";
import { getSalesSummary } from "@/lib/api/sales";
import type { SaleSummary } from "@/lib/api/sales";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
  DollarSign,
  Calendar,
  User,
  FileText,
  Shield,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const role = useUserRole();

  const [sale, setSale] = useState<SaleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saleId, setSaleId] = useState<string | null>(null);

  // Unwrap params Promise
  useEffect(() => {
    params.then(({ id }) => setSaleId(id));
  }, [params]);

  // Action modals
  const [showLockModal, setShowLockModal] = useState(false);
  const [showPayCommissionModal, setShowPayCommissionModal] = useState(false);

  // Error expansion
  const [expandedErrors, setExpandedErrors] = useState(true);
  const [expandedWarnings, setExpandedWarnings] = useState(true);

  // Check role access
  useEffect(() => {
    if (role && !["admin", "finance", "superadmin"].includes(role)) {
      router.push("/unauthorised");
    }
  }, [role, router]);

  const fetchSaleData = async () => {
    try {
      setLoading(true);
      setError(null);

      const summaryData = await getSalesSummary();
      const foundSale = summaryData.sales.find((s) => s.sale_id === saleId);

      if (!foundSale) {
        setError("Sale not found");
        setSale(null);
      } else {
        setSale(foundSale);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load sale details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== null && saleId) {
      fetchSaleData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId, role]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleLockSale = async () => {
    try {
      const response = await fetch("/api/finance/lock-paid-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_ids: [saleId] }),
      });

      if (!response.ok) throw new Error("Failed to lock sale");

      setShowLockModal(false);
      await fetchSaleData();
    } catch (err: any) {
      alert(err.message || "Failed to lock sale");
    }
  };

  const handlePayCommission = async () => {
    try {
      const response = await fetch("/api/finance/pay-commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_ids: [saleId] }),
      });

      if (!response.ok) throw new Error("Failed to pay commission");

      setShowPayCommissionModal(false);
      await fetchSaleData();
    } catch (err: any) {
      alert(err.message || "Failed to pay commission");
    }
  };

  if (role === null || loading) {
    return (
      <div>
        <TopLoadingBar isLoading={true} />
        <PageHeader title="Sale Details" subtitle="Loading sale information..." />
        <div className="max-w-7xl mx-auto">
          <LoadingBlock message="Loading sale details..." />
        </div>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div>
        <TopLoadingBar isLoading={false} />
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/staff/admin/dashboard" },
            { label: "Sales", href: "/staff/admin/sales" },
            { label: "Sale Details" },
          ]}
        />
        <PageHeader title="Sale Not Found" subtitle="The requested sale could not be found" />
        <div className="max-w-7xl mx-auto">
          <ErrorBlock message={error || "Sale not found"} onRetry={fetchSaleData} />
        </div>
      </div>
    );
  }

  const errors = sale.errors || [];
  const warnings = sale.warnings || [];
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  // Lifecycle steps
  const lifecycleSteps = [
    { key: "draft", label: "Draft", completed: sale.status !== "draft" },
    { key: "invoiced", label: "Invoiced", completed: ["paid", "locked", "commission_paid"].includes(sale.status) },
    { key: "paid", label: "Paid", completed: ["locked", "commission_paid"].includes(sale.status) },
    { key: "locked", label: "Locked", completed: sale.status === "commission_paid" },
    { key: "commission_paid", label: "Commission Paid", completed: sale.status === "commission_paid" },
  ];

  const currentStepIndex = lifecycleSteps.findIndex((step) => step.key === sale.status);

  return (
    <div className="max-w-7xl mx-auto">
      <TopLoadingBar isLoading={loading} />

      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/staff/admin/dashboard" },
          { label: "Sales", href: "/staff/admin/sales" },
          { label: sale.sale_reference },
        ]}
      />

      <PageHeader
        title={`Sale ${sale.sale_reference}`}
        subtitle={`Buyer: ${sale.buyer_name || "—"}`}
      />

      {/* SECTION A — Overview Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Status</span>
            <StatusBadge
              status={
                sale.status as
                  | "draft"
                  | "invoiced"
                  | "paid"
                  | "locked"
                  | "commission_paid"
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Buyer</span>
            <div className="text-right">
              <div className="text-gray-900 font-medium">{sale.buyer_name || "—"}</div>
              <div className="text-xs text-gray-500 capitalize">
                {sale.buyer_type?.replace("_", " ") || "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Supplier</span>
            <span className="text-gray-900 font-medium text-right">
              {sale.supplier_name || "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Shopper</span>
            <span className="text-gray-900 font-medium text-right">
              {sale.shopper_name || "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Introducer</span>
            <span className="text-gray-900 font-medium text-right">
              {sale.introducer_name || "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Authenticity</span>
            <AuthenticityBadge
              authenticity_status={sale.authenticity_status}
              authenticity_risk={
                sale.authenticity_risk as
                  | "clean"
                  | "missing_receipt"
                  | "not_verified"
                  | "high_risk"
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-2">
              <FileText size={16} />
              Supplier Receipt
            </span>
            {sale.supplier_receipt_attached ? (
              <CheckCircle size={18} className="text-green-600" />
            ) : (
              <XCircle size={18} className="text-red-600" />
            )}
          </div>
        </div>
      </div>

      {/* SECTION B — Financial Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign size={20} />
          Financial Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Sale Amount (Inc VAT)</span>
            <span className="text-gray-900 font-medium text-right text-lg">
              {formatCurrency(sale.sale_amount_inc_vat)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Buy Price</span>
            <span className="text-gray-900 font-medium text-right">
              {formatCurrency(sale.buy_price)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Commissionable Margin</span>
            <span className="text-gray-900 font-medium text-right">
              {formatCurrency(sale.commissionable_margin)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Commission Amount</span>
            <span className="text-[#F3DFA2] font-bold text-right text-lg">
              {formatCurrency(sale.commission_amount)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Margin %</span>
            <span
              className={`font-medium text-right ${
                (sale.margin_percent ?? 0) > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPercent(sale.margin_percent)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Invoice Due Date</span>
            <span className="text-gray-900 font-medium text-right">
              {formatDate(sale.invoice_due_date)}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Payment Date</span>
            <span className="text-gray-900 font-medium text-right">
              {formatDate(sale.xero_payment_date)}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION C — Payment & Lifecycle */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar size={20} />
          Payment & Lifecycle
        </h2>

        {/* Status indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="flex items-center gap-2">
            {sale.isPaid ? (
              <CheckCircle size={18} className="text-green-600" />
            ) : (
              <XCircle size={18} className="text-gray-400" />
            )}
            <span className="text-sm text-gray-600">Paid</span>
          </div>

          <div className="flex items-center gap-2">
            {sale.isLocked ? (
              <Lock size={18} className="text-[#F3DFA2]" />
            ) : (
              <XCircle size={18} className="text-gray-400" />
            )}
            <span className="text-sm text-gray-600">Locked</span>
          </div>

          <div className="flex items-center gap-2">
            {sale.is_overdue ? (
              <AlertTriangle size={18} className="text-red-600" />
            ) : (
              <CheckCircle size={18} className="text-green-600" />
            )}
            <span className="text-sm text-gray-600">
              {sale.is_overdue ? `${sale.days_overdue} days overdue` : "Not overdue"}
            </span>
          </div>
        </div>

        {/* Lifecycle timeline */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Lifecycle Timeline</h3>
          <div className="flex items-center justify-between">
            {lifecycleSteps.map((step, idx) => (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      currentStepIndex === idx
                        ? "bg-[#F3DFA2] text-[#0A0A0A]"
                        : step.completed
                        ? "bg-green-500 text-white"
                        : "bg-gray-300 text-gray-500"
                    }`}
                  >
                    {step.completed ? (
                      <CheckCircle size={16} />
                    ) : (
                      <span className="text-xs">{idx + 1}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600 mt-1 text-center">
                    {step.label}
                  </span>
                </div>
                {idx < lifecycleSteps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step.completed ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {sale.canLock && (
            <button
              onClick={() => setShowLockModal(true)}
              className="px-4 py-2 bg-[#F3DFA2] text-[#0A0A0A] rounded-lg hover:bg-[#F3DFA2]/90 transition-colors font-medium flex items-center gap-2"
            >
              <Lock size={16} />
              Lock Paid Sale
            </button>
          )}

          {sale.canPayCommission && (
            <button
              onClick={() => setShowPayCommissionModal(true)}
              className="px-4 py-2 bg-[#0A0A0A] text-white rounded-lg hover:bg-[#0A0A0A]/90 transition-colors font-medium flex items-center gap-2"
            >
              <DollarSign size={16} />
              Pay Commission
            </button>
          )}
        </div>
      </div>

      {/* SECTION D — Authenticity & Documentation */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield size={20} />
          Authenticity & Documentation
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Authenticity Status</span>
            <AuthenticityBadge
              authenticity_status={sale.authenticity_status}
              authenticity_risk={
                sale.authenticity_risk as
                  | "clean"
                  | "missing_receipt"
                  | "not_verified"
                  | "high_risk"
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Risk Level</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                sale.authenticity_risk === "clean"
                  ? "bg-green-100 text-green-700"
                  : sale.authenticity_risk === "high_risk"
                  ? "bg-red-100 text-red-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {sale.authenticity_risk?.replace("_", " ").toUpperCase() || "UNKNOWN"}
            </span>
          </div>

          {!sale.supplier_receipt_attached && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-red-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-red-900">
                    Missing Supplier Receipt
                  </h4>
                  <p className="text-sm text-red-700 mt-1">
                    This sale is missing a supplier receipt. Please upload documentation
                    to verify authenticity.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION E — Error & Warning Panel */}
      {(hasErrors || hasWarnings) && (
        <div className="mb-6 space-y-4">
          {/* Errors */}
          {hasErrors && (
            <div className="bg-white rounded-xl border-l-4 border-red-500 shadow-sm">
              <button
                onClick={() => setExpandedErrors(!expandedErrors)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-600" />
                  <h2 className="text-lg font-semibold text-red-900">
                    Errors ({errors.length})
                  </h2>
                </div>
                {expandedErrors ? (
                  <ChevronUp size={20} className="text-gray-600" />
                ) : (
                  <ChevronDown size={20} className="text-gray-600" />
                )}
              </button>

              {expandedErrors && (
                <div className="px-6 pb-4 space-y-3">
                  {errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-red-50 rounded-lg border border-red-200"
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-red-700 uppercase">
                              {err.error_type}
                            </span>
                            {err.error_group && (
                              <span className="text-xs text-red-600">
                                • {err.error_group}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-red-900">{err.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-white rounded-xl border-l-4 border-yellow-500 shadow-sm">
              <button
                onClick={() => setExpandedWarnings(!expandedWarnings)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-yellow-600" />
                  <h2 className="text-lg font-semibold text-yellow-900">
                    Warnings ({warnings.length})
                  </h2>
                </div>
                {expandedWarnings ? (
                  <ChevronUp size={20} className="text-gray-600" />
                ) : (
                  <ChevronDown size={20} className="text-gray-600" />
                )}
              </button>

              {expandedWarnings && (
                <div className="px-6 pb-4 space-y-3">
                  {warnings.map((warn, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="text-yellow-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-yellow-700 uppercase">
                              {warn.error_type}
                            </span>
                            {warn.error_group && (
                              <span className="text-xs text-yellow-600">
                                • {warn.error_group}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-yellow-900">{warn.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION F — JSON Debug (superadmin only) */}
      {role === "superadmin" && (
        <details className="bg-gray-900 rounded-xl p-6 mb-6">
          <summary className="text-white font-mono text-sm cursor-pointer mb-4">
            [SUPERADMIN] Sale Object JSON
          </summary>
          <pre className="text-green-400 font-mono text-xs overflow-x-auto">
            {JSON.stringify(sale, null, 2)}
          </pre>
        </details>
      )}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={showLockModal}
        onCancel={() => setShowLockModal(false)}
        onConfirm={handleLockSale}
        title="Lock Paid Sale"
        message={`Are you sure you want to lock sale ${sale.sale_reference}? This action will prevent further modifications and make it eligible for commission payment.`}
        confirmLabel="Lock Sale"
        isDestructive={true}
      />

      <ConfirmationModal
        isOpen={showPayCommissionModal}
        onCancel={() => setShowPayCommissionModal(false)}
        onConfirm={handlePayCommission}
        title="Pay Commission"
        message={`Are you sure you want to pay commission for sale ${sale.sale_reference}? Commission amount: ${formatCurrency(sale.commission_amount)}`}
        confirmLabel="Pay Commission"
        isDestructive={true}
      />
    </div>
  );
}
