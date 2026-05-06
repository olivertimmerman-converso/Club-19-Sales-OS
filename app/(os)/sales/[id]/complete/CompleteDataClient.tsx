"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BRANDS, CATEGORIES } from "@/lib/constants";
import { XERO_BRANDING_THEMES } from "@/lib/branding-theme-mappings";
import { getCompletionColor, assessCompleteness } from "@/lib/completeness";
import { calculateSaleEconomics } from "@/lib/economics";
import type { CompletenessResult, SaleForCompleteness } from "@/lib/completeness";
import type { IntroducerFeeType } from "@/lib/types/invoice";
import { ArrowLeft, CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp, Link2, PlusCircle, X, Loader2 } from "lucide-react";
import { NewSupplierModal } from "@/components/modals/NewSupplierModal";

interface LinkedInvoice {
  xero_invoice_id: string;
  xero_invoice_number: string;
  amount_inc_vat: number;
  currency: string;
  invoice_date: string;
  linked_at: string;
  linked_by: string;
}

interface XeroImport {
  id: string;
  xeroInvoiceNumber: string;
  saleDate: string | null;
  saleAmountIncVat: number;
  currency: string;
  buyerName: string;
}

interface SaleData {
  id: string;
  saleReference: string | null;
  xeroInvoiceNumber: string | null;
  xeroInvoiceId: string | null;
  source: string | null;
  linkedInvoices: LinkedInvoice[];
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
  dhlCost: number | null;
  addisonLeeCost: number | null;
  taxiCost: number | null;
  handDeliveryCost: number | null;
  otherLogisticsCost: number | null;
  entrupyFee: number | null;
  deliveryConfirmed: boolean;
  deliveryDate: string | null;
  introducerFeePercent?: number | null;
  introducerFeeType?: IntroducerFeeType | null;
  introducerCommission?: number | null;
  introducerName?: string | null;
  grossMargin: number;
  commissionableMargin: number;
}

interface Supplier {
  id: string;
  name: string;
  pendingApproval?: boolean;
}

interface LineItemData {
  id: string;
  lineNumber: number;
  brand: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  supplierId: string | null;
}

interface CompleteDataClientProps {
  sale: SaleData;
  suppliers: Supplier[];
  completeness: CompletenessResult;
  userRole: string | null;
  unallocatedXeroImports: XeroImport[];
  lineItems?: LineItemData[];
}

// Branding theme options for dropdown
const BRANDING_THEME_OPTIONS = Object.entries(XERO_BRANDING_THEMES).map(([id, theme]) => ({
  id,
  name: theme.name,
  treatment: theme.treatment,
}));

export function CompleteDataClient({
  sale,
  suppliers: initialSuppliers,
  completeness,
  userRole,
  unallocatedXeroImports,
  lineItems: initialLineItems = [],
}: CompleteDataClientProps) {
  const router = useRouter();

  const hasLineItems = initialLineItems.length > 0;
  const isAtelier = sale.source === "atelier";

  // Supplier list state (local so we can add new ones inline)
  const [supplierList, setSupplierList] = useState<Supplier[]>(initialSuppliers);

  // Per-line-item supplier state (only used when line items exist)
  const [lineItemSuppliers, setLineItemSuppliers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const li of initialLineItems) {
      initial[li.id] = li.supplierId || "";
    }
    return initial;
  });

  // Link invoice state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedLinkInvoiceId, setSelectedLinkInvoiceId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  // New supplier modal state
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);

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

  // Logistics costs state (Phase 2 WS3)
  const [dhlCost, setDhlCost] = useState(
    sale.dhlCost !== null ? sale.dhlCost.toString() : ""
  );
  const [addisonLeeCost, setAddisonLeeCost] = useState(
    sale.addisonLeeCost !== null ? sale.addisonLeeCost.toString() : ""
  );
  const [taxiCost, setTaxiCost] = useState(
    sale.taxiCost !== null ? sale.taxiCost.toString() : ""
  );
  const [handDeliveryCost, setHandDeliveryCost] = useState(
    sale.handDeliveryCost !== null ? sale.handDeliveryCost.toString() : ""
  );
  const [otherLogisticsCost, setOtherLogisticsCost] = useState(
    sale.otherLogisticsCost !== null ? sale.otherLogisticsCost.toString() : ""
  );
  const [entrupyFee, setEntrupyFee] = useState(
    sale.entrupyFee !== null ? sale.entrupyFee.toString() : ""
  );

  // Delivery tracking state (Phase 2 WS3)
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(sale.deliveryConfirmed);
  const [deliveryDate, setDeliveryDate] = useState(
    sale.deliveryDate ? sale.deliveryDate.split("T")[0] : ""
  );

  // Payment structure state
  const [showPaymentStructure, setShowPaymentStructure] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentPlanNotes, setPaymentPlanNotes] = useState("");

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Supplier search state
  const [supplierSearch, setSupplierSearch] = useState("");
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return supplierList;
    const search = supplierSearch.toLowerCase();
    return supplierList.filter((s) => s.name.toLowerCase().includes(search));
  }, [supplierList, supplierSearch]);

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

  // Live margin calculation - updates as user types
  const liveMargin = useMemo(() => {
    const buyPriceNum = parseFloat(buyPrice);
    if (isNaN(buyPriceNum) || buyPriceNum <= 0) {
      return null;
    }

    // Use the selected branding theme or fall back to sale's existing one
    const theme = brandingTheme || sale.brandingTheme;

    // Sum granular logistics costs, fall back to shippingCost for wizard sales
    const totalLogistics = [dhlCost, addisonLeeCost, taxiCost, handDeliveryCost, otherLogisticsCost]
      .reduce((sum, v) => sum + (v ? parseFloat(v) || 0 : 0), 0);
    const effectiveShipping = totalLogistics > 0
      ? totalLogistics
      : (shippingCost ? parseFloat(shippingCost) : 0);

    const economics = calculateSaleEconomics({
      sale_amount_inc_vat: sale.saleAmountIncVat,
      buy_price: buyPriceNum,
      card_fees: cardFees ? parseFloat(cardFees) : 0,
      shipping_cost: effectiveShipping,
      branding_theme: theme,
      entrupy_fee: entrupyFee ? parseFloat(entrupyFee) : 0,
    });

    return {
      grossMargin: economics.gross_margin,
      marginPercent: economics.gross_margin_percent,
      saleExVat: economics.sale_amount_ex_vat,
    };
  }, [buyPrice, cardFees, shippingCost, dhlCost, addisonLeeCost, taxiCost, handDeliveryCost, otherLogisticsCost, entrupyFee, brandingTheme, sale.saleAmountIncVat, sale.brandingTheme]);

  // Live completeness calculation - updates as user fills in fields
  const liveCompleteness = useMemo(() => {
    // Build a sale object with current form values merged with original sale data
    const formSale: SaleForCompleteness = {
      // Use form values if filled, otherwise use original sale values
      supplierId: supplierId || sale.supplierId,
      brand: (showBrandOther ? brandOther : brand) || sale.brand,
      category: (showCategoryOther ? categoryOther : category) || sale.category,
      buyPrice: buyPrice ? parseFloat(buyPrice) : sale.buyPrice,
      brandingTheme: brandingTheme || sale.brandingTheme,
      buyerType: buyerType || sale.buyerType,
      itemTitle: itemTitle || sale.itemTitle,
      // If any granular logistics field is filled, treat shippingCost as non-null
      shippingCost: [dhlCost, addisonLeeCost, taxiCost, handDeliveryCost, otherLogisticsCost].some(v => v !== "")
        ? [dhlCost, addisonLeeCost, taxiCost, handDeliveryCost, otherLogisticsCost]
            .reduce((sum, v) => sum + (v ? parseFloat(v) || 0 : 0), 0)
        : (shippingCost !== "" ? parseFloat(shippingCost) : sale.shippingCost),
      cardFees: cardFees !== "" ? parseFloat(cardFees) : sale.cardFees,
    };

    return assessCompleteness(formSale);
  }, [
    supplierId, brand, brandOther, showBrandOther, category, categoryOther, showCategoryOther,
    buyPrice, brandingTheme, buyerType, itemTitle, shippingCost, cardFees,
    dhlCost, addisonLeeCost, taxiCost, handDeliveryCost, otherLogisticsCost,
    sale.supplierId, sale.brand, sale.category, sale.buyPrice, sale.brandingTheme,
    sale.buyerType, sale.itemTitle, sale.shippingCost, sale.cardFees,
  ]);

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
      if (hasLineItems) {
        // Use first line item's supplier as primary, send all per-line-item mappings
        const lineItemSuppliersArray = Object.entries(lineItemSuppliers)
          .filter(([, sid]) => sid)
          .map(([lineItemId, sid]) => ({ lineItemId, supplierId: sid }));
        if (lineItemSuppliersArray.length > 0) {
          payload.supplier = lineItemSuppliersArray[0].supplierId;
          payload.line_item_suppliers = lineItemSuppliersArray;
        } else if (supplierId) {
          // Fallback: use single supplierId if no per-line-item selections
          payload.supplier = supplierId;
        }
      } else if (supplierId) {
        payload.supplier = supplierId;
      }
      if (finalBrand && finalBrand !== "Unknown") payload.brand = finalBrand;
      if (finalCategory && finalCategory !== "Unknown") payload.category = finalCategory;
      if (itemTitle) payload.item_title = itemTitle;
      if (buyPrice) payload.buy_price = parseFloat(buyPrice);
      if (brandingTheme) payload.branding_theme = brandingTheme;
      if (buyerType) payload.buyer_type = buyerType;
      if (shippingCost !== "") payload.shipping_cost = parseFloat(shippingCost);
      if (cardFees !== "") payload.card_fees = parseFloat(cardFees);
      // Granular logistics costs (Phase 2 WS3)
      if (dhlCost !== "") payload.dhl_cost = parseFloat(dhlCost);
      if (addisonLeeCost !== "") payload.addison_lee_cost = parseFloat(addisonLeeCost);
      if (taxiCost !== "") payload.taxi_cost = parseFloat(taxiCost);
      if (handDeliveryCost !== "") payload.hand_delivery_cost = parseFloat(handDeliveryCost);
      if (otherLogisticsCost !== "") payload.other_logistics_cost = parseFloat(otherLogisticsCost);
      if (entrupyFee !== "") payload.entrupy_fee = parseFloat(entrupyFee);
      // Delivery tracking
      payload.delivery_confirmed = deliveryConfirmed;
      if (deliveryConfirmed && deliveryDate) payload.delivery_date = deliveryDate;
      // Payment structure
      if (depositAmount !== "") payload.deposit_amount = parseFloat(depositAmount);
      if (paymentPlanNotes.trim()) payload.payment_plan_notes = paymentPlanNotes.trim();

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

  // Link invoice handler
  const handleLinkInvoice = async () => {
    if (!selectedLinkInvoiceId) return;

    setIsLinking(true);
    setLinkError(null);
    setLinkSuccess(false);

    try {
      const response = await fetch(`/api/sales/${sale.id}/link-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xero_import_id: selectedLinkInvoiceId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to link invoice");
      }

      setLinkSuccess(true);
      setShowLinkModal(false);
      setSelectedLinkInvoiceId("");

      // Refresh page to pick up updated sale totals and linked invoices
      router.refresh();
    } catch (err: any) {
      setLinkError(err.message || "Failed to link invoice");
    } finally {
      setIsLinking(false);
    }
  };

  // New supplier created callback
  const handleSupplierCreated = (supplier: { id: string; name: string; pending_approval: boolean }) => {
    setSupplierList((prev) => [...prev, { id: supplier.id, name: supplier.name, pendingApproval: supplier.pending_approval }]);
    setSupplierId(supplier.id);
    setSupplierSearch("");
    // Auto-assign to all line items that don't already have a supplier
    if (hasLineItems) {
      setLineItemSuppliers((prev) => {
        const updated = { ...prev };
        for (const li of initialLineItems) {
          if (!updated[li.id]) updated[li.id] = supplier.id;
        }
        return updated;
      });
    }
  };

  // Filter unallocated imports to same currency
  const availableImports = unallocatedXeroImports.filter(
    (imp) => imp.currency === sale.currency
  );

  // Further filter by search term for the modal dropdown
  const filteredImports = useMemo(() => {
    if (!linkSearch) return availableImports;
    const search = linkSearch.toLowerCase();
    return availableImports.filter(
      (imp) =>
        imp.xeroInvoiceNumber.toLowerCase().includes(search) ||
        imp.buyerName.toLowerCase().includes(search)
    );
  }, [availableImports, linkSearch]);

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Back Link - larger touch target on mobile */}
        <Link
          href={userRole === "shopper" ? "/staff/shopper/sales" : `/sales/${sale.id}`}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6 py-2 -ml-2 pl-2 pr-4"
        >
          <ArrowLeft className="w-5 h-5 sm:w-4 sm:h-4 mr-2 sm:mr-1" />
          <span className="text-base sm:text-sm">Back</span>
        </Link>

        {/* Header - mobile optimized */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
            {isAtelier ? "Update Costs" : "Complete Sale Data"}
          </h1>

          {/* Sale Context - stack on mobile */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs sm:text-sm">Reference</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                {sale.saleReference || sale.xeroInvoiceNumber || "No Reference"}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs sm:text-sm">Buyer</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{sale.buyerName}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs sm:text-sm">Date</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base">{formatDate(sale.saleDate)}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs sm:text-sm">Amount</span>
              <p className="font-medium text-gray-900 text-sm sm:text-base">{formatCurrency(sale.saleAmountIncVat)}</p>
            </div>
          </div>

          {/* Completion Progress */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600">Data Completion</span>
              <span className={`font-medium ${liveCompleteness.completionPercentage === 100 ? 'text-green-600' : 'text-gray-900'}`}>
                {liveCompleteness.completionPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-300 ease-out ${getCompletionColor(liveCompleteness.completionPercentage)}`}
                style={{ width: `${liveCompleteness.completionPercentage}%` }}
              />
            </div>
            {liveCompleteness.missingFields.filter((f) => f.priority === "required").length > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                Missing:{" "}
                {liveCompleteness.missingFields
                  .filter((f) => f.priority === "required")
                  .map((f) => f.label)
                  .join(", ")}
              </p>
            )}
            {liveCompleteness.completionPercentage === 100 && (
              <p className="mt-2 text-sm text-green-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                All fields complete!
              </p>
            )}
          </div>
        </div>

        {/* Linked Invoices Section */}
        {(sale.linkedInvoices.length > 0 || (sale.xeroInvoiceId && availableImports.length > 0)) && (
          <div className="bg-indigo-50 rounded-xl border border-indigo-200 shadow-sm p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm sm:text-base font-semibold text-indigo-900">Linked Invoices</h2>
            </div>

            {sale.linkedInvoices.length > 0 ? (
              <>
                <p className="text-xs sm:text-sm text-indigo-700 mb-3">
                  This sale has {sale.linkedInvoices.length + 1} linked invoices (e.g. deposit + balance).
                </p>
                <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden mb-3">
                  <table className="min-w-full divide-y divide-indigo-200">
                    <thead className="bg-indigo-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-indigo-700 uppercase">Invoice</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-indigo-700 uppercase">Amount</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-indigo-700 uppercase">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-100">
                      <tr>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{sale.xeroInvoiceNumber}</td>
                        <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                          {formatCurrency(sale.saleAmountIncVat - sale.linkedInvoices.reduce((sum, inv) => sum + inv.amount_inc_vat, 0))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">Primary</span>
                        </td>
                      </tr>
                      {sale.linkedInvoices.map((inv) => (
                        <tr key={inv.xero_invoice_id}>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">{inv.xero_invoice_number}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">{formatCurrency(inv.amount_inc_vat)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Linked</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-indigo-50">
                      <tr>
                        <td className="px-3 py-2 text-sm font-semibold text-indigo-900">Total</td>
                        <td className="px-3 py-2 text-sm font-bold text-indigo-900 text-right">{formatCurrency(sale.saleAmountIncVat)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs sm:text-sm text-indigo-700 mb-3">
                Has a deposit or additional invoice? Link it here so your margin calculates correctly.
              </p>
            )}

            {linkSuccess && (
              <div className="mb-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700">Invoice linked successfully! Sale total updated.</span>
              </div>
            )}

            {availableImports.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(true);
                  setSelectedLinkInvoiceId("");
                  setLinkError(null);
                  setLinkSearch("");
                }}
                className="inline-flex items-center px-3 py-2 border border-indigo-300 text-sm font-medium rounded-lg text-indigo-700 bg-white hover:bg-indigo-50 transition-colors"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Link a Deposit / Additional Invoice
              </button>
            )}
          </div>
        )}

        {/* Link Invoice Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Link Additional Invoice</h3>
                <button
                  onClick={() => {
                    setShowLinkModal(false);
                    setSelectedLinkInvoiceId("");
                    setLinkError(null);
                    setLinkSearch("");
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Search for a Xero invoice to link to this sale (e.g. deposit + balance).
              </p>

              {linkError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800">{linkError}</p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search by invoice number or client name</label>
                <input
                  type="text"
                  placeholder="e.g. INV-3291 or Kirsty..."
                  value={linkSearch}
                  onChange={(e) => {
                    setLinkSearch(e.target.value);
                    setSelectedLinkInvoiceId("");
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 mb-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                />
                <select
                  value={selectedLinkInvoiceId}
                  onChange={(e) => setSelectedLinkInvoiceId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={isLinking}
                  size={Math.min(filteredImports.length + 1, 8)}
                >
                  <option value="">Choose an invoice...</option>
                  {filteredImports.map((imp) => (
                    <option key={imp.id} value={imp.id}>
                      {imp.xeroInvoiceNumber} — {imp.buyerName} — {formatCurrency(imp.saleAmountIncVat)} ({formatDate(imp.saleDate)})
                      {imp.buyerName === sale.buyerName ? " ★" : ""}
                    </option>
                  ))}
                </select>
                {linkSearch && filteredImports.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">No invoices match &ldquo;{linkSearch}&rdquo;</p>
                )}
                {!linkSearch && (
                  <p className="mt-2 text-xs text-gray-500">Type above to search {availableImports.length} available invoices</p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkModal(false);
                    setSelectedLinkInvoiceId("");
                    setLinkError(null);
                    setLinkSearch("");
                  }}
                  disabled={isLinking}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLinkInvoice}
                  disabled={!selectedLinkInvoiceId || isLinking}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    "Link Invoice"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Form - mobile optimized */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <div className="space-y-5 sm:space-y-6">
            {/* Supplier - Required */}
            {(missingFields.has("supplierId") || !sale.supplierId) && (
              <div>
                {hasLineItems ? (
                  /* Multi-supplier: per-line-item supplier selectors */
                  <div>
                    <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                      Supplier per Line Item <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Search suppliers..."
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {initialLineItems.map((li) => (
                        <div key={li.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {li.description || `Line ${li.lineNumber}`}
                            </div>
                            <div className="text-xs text-gray-500">
                              {li.brand && `${li.brand} · `}Qty {li.quantity} · £{(li.lineTotal || 0).toLocaleString()}
                            </div>
                          </div>
                          <select
                            value={lineItemSuppliers[li.id] || ""}
                            onChange={(e) => setLineItemSuppliers(prev => ({ ...prev, [li.id]: e.target.value }))}
                            className="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                          >
                            <option value="">Select supplier...</option>
                            {filteredSuppliers.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-xs text-gray-500">Can&apos;t find your supplier?</span>
                      <button
                        type="button"
                        onClick={() => setShowNewSupplierModal(true)}
                        className="text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors"
                      >
                        + Add New Supplier
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Single supplier selector (no line items) */
                  <div>
                    <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                      Supplier <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Search suppliers..."
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 mb-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                    >
                      <option value="">Select supplier...</option>
                      {filteredSuppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {/* Pending approval badge for selected supplier */}
                    {supplierId && supplierList.find((s) => s.id === supplierId)?.pendingApproval && (
                      <div className="mt-2 inline-flex items-center px-2 py-1 rounded-md bg-amber-50 border border-amber-200">
                        <span className="text-xs font-medium text-amber-700">Pending Approval</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-xs text-gray-500">Can&apos;t find your supplier?</span>
                      <button
                        type="button"
                        onClick={() => setShowNewSupplierModal(true)}
                        className="text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors"
                      >
                        + Add New Supplier
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Brand - Required */}
            {(missingFields.has("brand") || !sale.brand || sale.brand === "Unknown") && (
              <div>
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  Brand <span className="text-red-500">*</span>
                </label>
                <select
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    if (e.target.value !== "Other") setBrandOther("");
                  }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
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
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 mt-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            )}

            {/* Category - Required */}
            {(missingFields.has("category") || !sale.category || sale.category === "Unknown") && (
              <div>
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (e.target.value !== "Other") setCategoryOther("");
                  }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
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
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 mt-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            )}

            {/* Buy Price - Required */}
            {(missingFields.has("buyPrice") || !sale.buyPrice || sale.buyPrice === 0) && (
              <div>
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  Buy Price ({sale.currency}) <span className="text-red-500">*</span>
                </label>
                {sale.linkedInvoices.length > 0 && (
                  <div className="mb-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-indigo-700">
                      Enter the <strong>total</strong> buy price for this deal across all {sale.linkedInvoices.length + 1} linked invoices. The margin will be calculated against the combined sale total of {formatCurrency(sale.saleAmountIncVat)}.
                    </p>
                  </div>
                )}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {/* Live Margin Display */}
                {liveMargin && (
                  <div className={`mt-3 p-3 rounded-lg ${liveMargin.grossMargin >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-sm font-medium ${liveMargin.grossMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          Gross Margin
                        </span>
                        <p className={`text-lg font-semibold ${liveMargin.grossMargin >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                          {formatCurrency(liveMargin.grossMargin)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${liveMargin.grossMargin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          Margin %
                        </span>
                        <p className={`text-lg font-semibold ${liveMargin.grossMargin >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                          {liveMargin.marginPercent.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Sale ex VAT: {formatCurrency(liveMargin.saleExVat)}
                    </p>
                  </div>
                )}
                {!liveMargin && (
                  <p className="mt-2 text-xs text-gray-500">
                    {sale.linkedInvoices.length > 0
                      ? "Enter the total cost across all linked invoices."
                      : "What did you pay for this item?"}
                  </p>
                )}
              </div>
            )}

            {/* VAT Treatment - Required */}
            {(missingFields.has("brandingTheme") || !sale.brandingTheme) && (
              <div>
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  VAT Treatment <span className="text-red-500">*</span>
                </label>
                <select
                  value={brandingTheme}
                  onChange={(e) => setBrandingTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option value="">Select VAT treatment...</option>
                  {BRANDING_THEME_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} - {t.treatment}
                    </option>
                  ))}
                </select>
                <div className="mt-3 p-3 sm:p-3 bg-blue-50 rounded-lg">
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
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  Buyer Type
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center py-2 px-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="buyerType"
                      value="end_client"
                      checked={buyerType === "end_client"}
                      onChange={(e) => setBuyerType(e.target.value)}
                      className="mr-2 w-4 h-4"
                    />
                    <span className="text-sm sm:text-base">End Client</span>
                  </label>
                  <label className="flex items-center py-2 px-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="buyerType"
                      value="b2b"
                      checked={buyerType === "b2b"}
                      onChange={(e) => setBuyerType(e.target.value)}
                      className="mr-2 w-4 h-4"
                    />
                    <span className="text-sm sm:text-base">B2B</span>
                  </label>
                </div>
              </div>
            )}

            {/* Item Description - Recommended */}
            {(missingFields.has("itemTitle") || !sale.itemTitle) && (
              <div>
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  Item Description
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., B25 Black Togo GHW"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Card Fees - Recommended */}
            {(missingFields.has("cardFees") || sale.cardFees === null) && (
              <div>
                <label className="block text-sm sm:text-base font-medium text-gray-700 mb-2">
                  Card Fees ({sale.currency})
                  <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={cardFees}
                  onChange={(e) => setCardFees(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter 0 if there were no card processing fees.
                </p>
              </div>
            )}
          </div>

          {/* Logistics & Delivery Costs (Phase 2 WS3) */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4">Logistics &amp; Delivery Costs</h3>

            {/* Atelier-only: show the introducer fee captured at creation as a read-only
                reference. The basis depends on the wizard's fee-type toggle: a % of gross
                profit (recalculates as costs change) or a fixed flat £. */}
            {isAtelier &&
              ((sale.introducerFeeType === "flat" &&
                sale.introducerCommission != null &&
                sale.introducerCommission > 0) ||
                (sale.introducerFeeType !== "flat" &&
                  sale.introducerFeePercent != null &&
                  sale.introducerFeePercent > 0)) && (
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
                  <Info className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-purple-700">
                    <span className="font-medium">Introducer:</span>{" "}
                    {sale.introducerName ? `${sale.introducerName} · ` : ""}
                    {sale.introducerFeeType === "flat" ? (
                      <>
                        flat £
                        {(sale.introducerCommission ?? 0).toLocaleString("en-GB", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </>
                    ) : (
                      <>{sale.introducerFeePercent}% of net (gross minus actual costs)</>
                    )}
                    <p className="mt-0.5 text-purple-600/80">
                      {sale.introducerFeeType === "flat"
                        ? "The £ amount is fixed and does not change with cost adjustments."
                        : "The £ amount recalculates automatically as actual costs change the net profit."}
                    </p>
                  </div>
                </div>
              )}

            {/* Atelier-only: show the estimated shipping from wizard as a read-only reference */}
            {isAtelier && sale.shippingCost !== null && sale.shippingCost > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-700">
                  <span className="font-medium">Estimated at creation:</span>{" "}
                  {new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: sale.currency,
                    minimumFractionDigits: 2,
                  }).format(sale.shippingCost)}
                  <p className="mt-0.5 text-blue-600/80">
                    Enter the actual costs below. They will replace the estimate in reports.
                  </p>
                </div>
              </div>
            )}

            {/* Delivery Confirmed — at top, gates commission */}
            <div className={`mb-5 p-4 rounded-lg border ${deliveryConfirmed ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveryConfirmed}
                  onChange={(e) => {
                    setDeliveryConfirmed(e.target.checked);
                    if (!e.target.checked) setDeliveryDate("");
                  }}
                  className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div>
                  <span className={`text-sm sm:text-base font-medium ${deliveryConfirmed ? "text-green-800" : "text-gray-700"}`}>
                    Delivery Confirmed
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Commission eligibility requires delivery confirmation.
                  </p>
                </div>
              </label>
              {deliveryConfirmed && (
                <div className="mt-3 ml-8">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full sm:w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {/* Cost breakdown grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  DHL / Shipping ({sale.currency})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={dhlCost}
                  onChange={(e) => setDhlCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Addison Lee ({sale.currency})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={addisonLeeCost}
                  onChange={(e) => setAddisonLeeCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taxi ({sale.currency})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={taxiCost}
                  onChange={(e) => setTaxiCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hand Delivery ({sale.currency})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={handDeliveryCost}
                  onChange={(e) => setHandDeliveryCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Other Logistics ({sale.currency})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={otherLogisticsCost}
                  onChange={(e) => setOtherLogisticsCost(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entrupy Fee ({sale.currency})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={entrupyFee}
                  onChange={(e) => setEntrupyFee(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Live total */}
            {(() => {
              const total = [dhlCost, addisonLeeCost, taxiCost, handDeliveryCost, otherLogisticsCost, entrupyFee]
                .reduce((sum, v) => sum + (v ? parseFloat(v) || 0 : 0), 0);
              const cardFeesNum = cardFees ? parseFloat(cardFees) || 0 : 0;
              return (total > 0 || cardFeesNum > 0) ? (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total ancillary costs</span>
                    <span className="font-medium text-gray-900">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: sale.currency,
                        minimumFractionDigits: 2,
                      }).format(total + cardFeesNum)}
                    </span>
                  </div>
                </div>
              ) : null;
            })()}
          </div>

          {/* Payment Structure - Collapsible Optional Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowPaymentStructure(!showPaymentStructure)}
              className="w-full flex items-center justify-between py-2 text-left text-gray-700 hover:text-gray-900 transition-colors"
            >
              <span className="text-sm sm:text-base font-medium">
                Payment Structure
                <span className="ml-2 text-xs text-gray-400">(optional)</span>
              </span>
              {showPaymentStructure ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showPaymentStructure && (
              <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
                {/* Deposit Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Deposit Amount ({sale.currency})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If a deposit was paid upfront, enter the amount here.
                  </p>
                </div>

                {/* Payment Plan Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Plan Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="E.g., 3 monthly instalments of £5,000..."
                    value={paymentPlanNotes}
                    onChange={(e) => setPaymentPlanNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Describe any payment arrangements or instalment plans.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions - mobile optimized with sticky footer */}
          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200">
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <Link
                href={userRole === "shopper" ? "/staff/shopper/sales" : `/sales/${sale.id}`}
                className="w-full sm:w-auto px-4 py-3 sm:py-2 text-base sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 text-center"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="w-full sm:w-auto px-4 py-3 sm:py-2 text-base sm:text-sm font-medium text-white bg-[#0A0A0A] rounded-lg hover:bg-[#0A0A0A]/90 focus:ring-2 focus:ring-offset-2 focus:ring-[#0A0A0A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? "Saving..." : isAtelier ? "Update Costs" : "Save & Complete"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* New Supplier Modal */}
      <NewSupplierModal
        open={showNewSupplierModal}
        onClose={() => setShowNewSupplierModal(false)}
        onCreated={handleSupplierCreated}
      />
    </div>
  );
}
