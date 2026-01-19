"use client";

/**
 * Club 19 Sales OS - Adopt Invoice Client Component
 *
 * UI for converting a Xero invoice into a Sale record
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  User,
  Building,
  Banknote,
  Tag,
  Package,
  Plus,
} from "lucide-react";
import { BRANDS, CATEGORIES } from "@/lib/constants";
import { NewSupplierModal } from "@/components/modals/NewSupplierModal";

interface XeroInvoice {
  invoiceId: string;
  invoiceNumber: string;
  reference: string | null;
  clientName: string;
  clientEmail: string | null;
  clientXeroId: string | null;
  total: number;
  subTotal: number;
  totalTax: number;
  currencyCode: string;
  date: string;
  dueDate: string;
  status: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    lineAmount: number;
  }>;
}

interface Shopper {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
  pending_approval?: boolean;
}

interface Props {
  invoiceId: string;
  shoppers: Shopper[];
  suppliers: Supplier[];
}

export function AdoptInvoiceClient({ invoiceId, shoppers, suppliers: initialSuppliers }: Props) {
  const router = useRouter();

  // Invoice data from Xero
  const [invoice, setInvoice] = useState<XeroInvoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  // Suppliers list (can be updated when new supplier is added)
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);

  // New supplier modal
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);

  // Form state
  const [shopperId, setShopperId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [buyPrice, setBuyPrice] = useState<string>("");
  const [brand, setBrand] = useState("");
  const [brandOther, setBrandOther] = useState("");
  const [category, setCategory] = useState("");
  const [categoryOther, setCategoryOther] = useState("");
  const [description, setDescription] = useState("");

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived values
  const showBrandOther = brand === "Other";
  const showCategoryOther = category === "Other";
  const finalBrand = showBrandOther ? brandOther : brand;
  const finalCategory = showCategoryOther ? categoryOther : category;
  const buyPriceNum = parseFloat(buyPrice) || 0;

  // Calculate margin
  const sellPrice = invoice?.subTotal || 0;
  const margin = sellPrice - buyPriceNum;
  const marginPercent = sellPrice > 0 ? (margin / sellPrice) * 100 : 0;

  // Form validation
  const isFormValid =
    shopperId &&
    supplierId &&
    buyPriceNum > 0 &&
    finalBrand &&
    finalCategory &&
    description;

  // Fetch invoice data on mount
  useEffect(() => {
    async function fetchInvoice() {
      try {
        const res = await fetch(`/api/xero/invoice/${invoiceId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch invoice");
        }

        setInvoice(data);

        // Pre-fill description from first line item
        if (data.lineItems?.[0]?.description) {
          setDescription(data.lineItems[0].description);
        }
      } catch (error: any) {
        setInvoiceError(error.message);
      } finally {
        setLoadingInvoice(false);
      }
    }

    fetchInvoice();
  }, [invoiceId]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!isFormValid || !invoice) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/sales/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xeroInvoiceId: invoice.invoiceId,
          xeroInvoiceNumber: invoice.invoiceNumber,
          shopperId,
          supplierId,
          buyPrice: buyPriceNum,
          brand: finalBrand,
          category: finalCategory,
          description,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to adopt invoice");
      }

      // Success - redirect to the new sale
      router.push(`/sales/${data.saleId}`);
    } catch (error: any) {
      setSubmitError(error.message);
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, currency = "GBP") => {
    const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
    return `${symbol}${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Handle new supplier creation
  const handleNewSupplierCreated = (newSupplier: { id: string; name: string; pending_approval: boolean }) => {
    // Add to suppliers list and select it
    setSuppliers((prev) => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(newSupplier.id);
  };

  // Loading state
  if (loadingInvoice) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // Error state
  if (invoiceError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h2 className="text-lg font-semibold text-red-900">Failed to Load Invoice</h2>
            <p className="text-sm text-red-700 mt-1">{invoiceError}</p>
          </div>
        </div>
        <Link
          href="/admin/sync"
          className="inline-flex items-center gap-2 mt-4 text-sm text-red-700 hover:text-red-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sync
        </Link>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/sync"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adopt Invoice</h1>
          <p className="text-sm text-gray-600">
            Convert this Xero invoice into a full Sale record
          </p>
        </div>
      </div>

      {/* Xero Invoice Data (read-only) */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">From Xero (read-only)</h2>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Invoice #</dt>
            <dd className="font-medium text-gray-900">{invoice.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Client</dt>
            <dd className="font-medium text-gray-900">{invoice.clientName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Total (inc VAT)</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(invoice.total, invoice.currencyCode)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Subtotal (ex VAT)</dt>
            <dd className="font-medium text-gray-900">
              {formatCurrency(invoice.subTotal, invoice.currencyCode)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Date</dt>
            <dd className="font-medium text-gray-900">{formatDate(invoice.date)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium text-gray-900">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  invoice.status === "PAID"
                    ? "bg-green-100 text-green-800"
                    : invoice.status === "AUTHORISED"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {invoice.status}
              </span>
            </dd>
          </div>
        </dl>

        {/* Line items */}
        {invoice.lineItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <dt className="text-gray-500 text-sm mb-2">Line Items</dt>
            <div className="space-y-2">
              {invoice.lineItems.map((item, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-lg p-3 text-sm"
                >
                  <div className="font-medium text-gray-900">{item.description || "(No description)"}</div>
                  <div className="text-gray-500 mt-1">
                    {item.quantity} × {formatCurrency(item.unitAmount, invoice.currencyCode)} ={" "}
                    {formatCurrency(item.lineAmount, invoice.currencyCode)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Form - Missing Details */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Package className="w-5 h-5 text-purple-600" />
          Add Missing Details
        </h2>

        {/* Shopper */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <User className="w-4 h-4" />
            Shopper *
          </label>
          <select
            value={shopperId}
            onChange={(e) => setShopperId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Select shopper...</option>
            {shoppers.map((shopper) => (
              <option key={shopper.id} value={shopper.id}>
                {shopper.name}
              </option>
            ))}
          </select>
        </div>

        {/* Supplier */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Building className="w-4 h-4" />
            Supplier *
          </label>
          <div className="flex gap-2">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.pending_approval ? ' (Pending Approval)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewSupplierModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>
          {supplierId && suppliers.find(s => s.id === supplierId)?.pending_approval && (
            <p className="mt-1.5 text-xs text-amber-600">
              This supplier is pending approval from admin.
            </p>
          )}
        </div>

        {/* Buy Price */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Banknote className="w-4 h-4" />
            Buy Price ({invoice.currencyCode}) *
          </label>
          <input
            type="number"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {buyPriceNum > 0 && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sell Price (ex VAT)</span>
                <span className="font-medium">{formatCurrency(sellPrice, invoice.currencyCode)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Buy Price</span>
                <span className="font-medium">-{formatCurrency(buyPriceNum, invoice.currencyCode)}</span>
              </div>
              <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-200">
                <span className="font-medium text-gray-900">Gross Margin</span>
                <span className={`font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(margin, invoice.currencyCode)} ({marginPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Brand */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Tag className="w-4 h-4" />
            Brand *
          </label>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Select brand...</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {showBrandOther && (
            <input
              type="text"
              value={brandOther}
              onChange={(e) => setBrandOther(e.target.value)}
              placeholder="Enter brand name"
              className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          )}
        </div>

        {/* Category */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Category *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Select category...</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {showCategoryOther && (
            <input
              type="text"
              value={categoryOther}
              onChange={(e) => setCategoryOther(e.target.value)}
              placeholder="Enter category"
              className="w-full mt-2 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          )}
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Item Description *</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Birkin 25 Togo Black GHW"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{submitError}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link
          href="/admin/sync"
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          Cancel
        </Link>
        <button
          onClick={handleSubmit}
          disabled={!isFormValid || submitting}
          className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Adopting...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Adopt Invoice
            </>
          )}
        </button>
      </div>

      {/* New Supplier Modal */}
      <NewSupplierModal
        open={showNewSupplierModal}
        onClose={() => setShowNewSupplierModal(false)}
        onCreated={handleNewSupplierCreated}
      />
    </div>
  );
}
