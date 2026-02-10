"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BRANDS, CATEGORIES } from "@/lib/constants";
import { XERO_BRANDING_THEMES } from "@/lib/branding-theme-mappings";
import { getCompletionColor } from "@/lib/completeness";
import type { CompletenessResult } from "@/lib/completeness";
import { ArrowLeft, CheckCircle, AlertCircle, Info } from "lucide-react";

interface SaleData {
  id: string;
  saleReference: string | null;
  xeroInvoiceNumber: string | null;
  saleDate: string | null;
  saleAmountIncVat: number;
  saleAmountExVat: number;
  currency: string;
  buyerName: string;
  buyerId: string | null;
  shopperName: string;
  shopperId: string | null;
  supplierName: string | null;
  supplierId: string | null;
  brand: string | null;
  category: string | null;
  itemTitle: string | null;
  buyPrice: number;
  brandingTheme: string | null;
  buyerType: string | null;
  shippingCost: number | null;
  cardFees: number | null;
  grossMargin: number;
  commissionableMargin: number;
}

interface Supplier {
  id: string;
  name: string;
}

interface CompleteDataClientProps {
  sale: SaleData;
  suppliers: Supplier[];
  completeness: CompletenessResult;
  userRole: string | null;
}

// Branding theme options for dropdown
const BRANDING_THEME_OPTIONS = Object.entries(XERO_BRANDING_THEMES).map(([id, theme]) => ({
  id,
  name: theme.name,
  treatment: theme.treatment,
}));

export function CompleteDataClient({
  sale,
  suppliers,
  completeness,
  userRole,
}: CompleteDataClientProps) {
  const router = useRouter();

  // Form state
  const [supplierId, setSupplierId] = useState(sale.supplierId || "");
  const [brand, setBrand] = useState(sale.brand || "");
  const [brandOther, setBrandOther] = useState("");
  const [category, setCategory] = useState(sale.category || "");
  const [categoryOther, setCategoryOther] = useState("");
  const [itemTitle, setItemTitle] = useState(sale.itemTitle || "");
  const [buyPrice, setBuyPrice] = useState(sale.buyPrice > 0 ? sale.buyPrice.toString() : "");
  const [brandingTheme, setBrandingTheme] = useState(sale.brandingTheme || "");
  const [buyerType, setBuyerType] = useState(sale.buyerType || "");
  const [shippingCost, setShippingCost] = useState(
    sale.shippingCost !== null ? sale.shippingCost.toString() : ""
  );
  const [cardFees, setCardFees] = useState(
    sale.cardFees !== null ? sale.cardFees.toString() : ""
  );

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Supplier search state
  const [supplierSearch, setSupplierSearch] = useState("");
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const search = supplierSearch.toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(search));
  }, [suppliers, supplierSearch]);

  // Check which fields are missing (to show/hide form sections)
  const missingFields = new Set(completeness.missingFields.map((f) => f.field));
  const requiredMissing = new Set(
    completeness.missingFields.filter((f) => f.priority === "required").map((f) => f.field)
  );

  // Handle brand "Other" option
  const showBrandOther = brand === "Other";
  const finalBrand = showBrandOther ? brandOther : brand;

  // Handle category "Other" option
  const showCategoryOther = category === "Other";
  const finalCategory = showCategoryOther ? categoryOther : category;

  // Pre-populate if brand/category is not in standard list
  useState(() => {
    if (sale.brand && !(BRANDS as readonly string[]).includes(sale.brand) && sale.brand !== "Unknown") {
      setBrand("Other");
      setBrandOther(sale.brand);
    }
    if (sale.category && !(CATEGORIES as readonly string[]).includes(sale.category) && sale.category !== "Unknown") {
      setCategory("Other");
      setCategoryOther(sale.category);
    }
  });

  // Validation
  const isValid = useMemo(() => {
    // Check all required fields
    if (requiredMissing.has("supplierId") && !supplierId) return false;
    if (requiredMissing.has("brand") && !finalBrand) return false;
    if (requiredMissing.has("category") && !finalCategory) return false;
    if (requiredMissing.has("buyPrice")) {
      const price = parseFloat(buyPrice);
      if (isNaN(price) || price <= 0) return false;
    }
    if (requiredMissing.has("brandingTheme") && !brandingTheme) return false;
    return true;
  }, [supplierId, finalBrand, finalCategory, buyPrice, brandingTheme, requiredMissing]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: sale.currency,
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleSave = async () => {
    if (!isValid) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Build update payload
      const payload: Record<string, unknown> = {};

      // Only include fields that have values
      if (supplierId) payload.supplier = supplierId;
      if (finalBrand && finalBrand !== "Unknown") payload.brand = finalBrand;
      if (finalCategory && finalCategory !== "Unknown") payload.category = finalCategory;
      if (itemTitle) payload.item_title = itemTitle;
      if (buyPrice) payload.buy_price = parseFloat(buyPrice);
      if (brandingTheme) payload.branding_theme = brandingTheme;
      if (buyerType) payload.buyer_type = buyerType;
      if (shippingCost !== "") payload.shipping_cost = parseFloat(shippingCost);
      if (cardFees !== "") payload.card_fees = parseFloat(cardFees);

      const response = await fetch(`/api/sales/${sale.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save changes");
      }

      setSaveSuccess(true);

      // Redirect back to sales page after short delay
      setTimeout(() => {
        if (userRole === "shopper") {
          router.push("/staff/shopper/sales");
        } else {
          router.push("/sales/" + sale.id);
        }
      }, 1500);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Back Link */}
        <Link
          href={userRole === "shopper" ? "/staff/shopper/sales" : `/sales/${sale.id}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to {userRole === "shopper" ? "My Sales" : "Sale Details"}
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-4">Complete Sale Data</h1>

          {/* Sale Context */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Reference</span>
              <p className="font-medium text-gray-900">
                {sale.saleReference || sale.xeroInvoiceNumber || "No Reference"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Buyer</span>
              <p className="font-medium text-gray-900">{sale.buyerName}</p>
            </div>
            <div>
              <span className="text-gray-500">Date</span>
              <p className="font-medium text-gray-900">{formatDate(sale.saleDate)}</p>
            </div>
            <div>
              <span className="text-gray-500">Amount</span>
              <p className="font-medium text-gray-900">{formatCurrency(sale.saleAmountIncVat)}</p>
            </div>
          </div>

          {/* Completion Progress */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600">Data Completion</span>
              <span className="font-medium text-gray-900">{completeness.completionPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${getCompletionColor(completeness.completionPercentage)}`}
                style={{ width: `${completeness.completionPercentage}%` }}
              />
            </div>
            {completeness.missingFields.length > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                Missing:{" "}
                {completeness.missingFields
                  .filter((f) => f.priority === "required")
                  .map((f) => f.label)
                  .join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Success Message */}
        {saveSuccess && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700">
              Changes saved successfully! Redirecting...
            </span>
          </div>
        )}

        {/* Error Message */}
        {saveError && (
          <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{saveError}</span>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="space-y-6">
            {/* Supplier - Required */}
            {(missingFields.has("supplierId") || !sale.supplierId) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Search suppliers..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select supplier...</option>
                  {filteredSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Can&apos;t find your supplier? Contact Alys to add a new supplier.
                </p>
              </div>
            )}

            {/* Brand - Required */}
            {(missingFields.has("brand") || !sale.brand || sale.brand === "Unknown") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand <span className="text-red-500">*</span>
                </label>
                <select
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    if (e.target.value !== "Other") setBrandOther("");
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    placeholder="Enter brand name..."
                    value={brandOther}
                    onChange={(e) => setBrandOther(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            )}

            {/* Category - Required */}
            {(missingFields.has("category") || !sale.category || sale.category === "Unknown") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (e.target.value !== "Other") setCategoryOther("");
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    placeholder="Enter category name..."
                    value={categoryOther}
                    onChange={(e) => setCategoryOther(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            )}

            {/* Buy Price - Required */}
            {(missingFields.has("buyPrice") || !sale.buyPrice || sale.buyPrice === 0) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buy Price ({sale.currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  What did you pay for this item?
                </p>
              </div>
            )}

            {/* VAT Treatment - Required */}
            {(missingFields.has("brandingTheme") || !sale.brandingTheme) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VAT Treatment <span className="text-red-500">*</span>
                </label>
                <select
                  value={brandingTheme}
                  onChange={(e) => setBrandingTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select VAT treatment...</option>
                  {BRANDING_THEME_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} - {t.treatment}
                    </option>
                  ))}
                </select>
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <div className="flex gap-2">
                    <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-700">
                      <p className="font-medium mb-1">How to choose:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li><strong>CN 20% VAT</strong> - UK domestic sales (item & buyer in UK)</li>
                        <li><strong>CN Margin Scheme</strong> - Second-hand goods purchased without VAT</li>
                        <li><strong>CN Export Sales</strong> - Buyer is outside the UK</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Buyer Type - Recommended */}
            {(missingFields.has("buyerType") || !sale.buyerType) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buyer Type
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="buyerType"
                      value="end_client"
                      checked={buyerType === "end_client"}
                      onChange={(e) => setBuyerType(e.target.value)}
                      className="mr-2"
                    />
                    End Client
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="buyerType"
                      value="b2b"
                      checked={buyerType === "b2b"}
                      onChange={(e) => setBuyerType(e.target.value)}
                      className="mr-2"
                    />
                    B2B
                  </label>
                </div>
              </div>
            )}

            {/* Item Description - Recommended */}
            {(missingFields.has("itemTitle") || !sale.itemTitle) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Description
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., B25 Black Togo GHW"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Shipping Cost - Recommended */}
            {(missingFields.has("shippingCost") || sale.shippingCost === null) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shipping Cost ({sale.currency})
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter 0 if there were no shipping costs.
                </p>
              </div>
            )}

            {/* Card Fees - Recommended */}
            {(missingFields.has("cardFees") || sale.cardFees === null) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Card Fees ({sale.currency})
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={cardFees}
                  onChange={(e) => setCardFees(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter 0 if there were no card processing fees.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end gap-3">
            <Link
              href={userRole === "shopper" ? "/staff/shopper/sales" : `/sales/${sale.id}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Cancel
            </Link>
            <button
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0A0A0A] rounded-lg hover:bg-[#0A0A0A]/90 focus:ring-2 focus:ring-offset-2 focus:ring-[#0A0A0A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Saving..." : "Save & Complete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
