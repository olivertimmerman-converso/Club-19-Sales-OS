"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { fetchXeroContacts, XeroContact } from "@/lib/xero";
import { buildTradePayload } from "@/lib/trade-payload";
import { calculateImpliedCosts } from "@/lib/implied-costs";

export function StepBuyerAndReview() {
  const { state, setBuyer, setDueDate, setNotes, goToStep, setSubmitting, setError } = useTrade();

  // === BUYER SECTION STATE (from StepBuyer) ===
  const [buyerName, setBuyerName] = useState(state.buyer?.name || "");
  const [xeroContactId, setXeroContactId] = useState(
    state.buyer?.xeroContactId || "",
  );
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [dropdownResults, setDropdownResults] = useState<XeroContact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // === REVIEW SECTION STATE (from StepReview) ===
  const [impliedCosts, setImpliedCosts] = useState({
    shipping: 0,
    cardFees: 0,
    total: 0,
  });
  const [grossMarginGBP, setGrossMarginGBP] = useState(0);
  const [commissionableMarginGBP, setCommissionableMarginGBP] = useState(0);
  const [successData, setSuccessData] = useState<{
    invoiceNumber: string;
    invoiceUrl: string;
    commissionableMarginGBP: number;
  } | null>(null);

  // === BUYER SECTION HANDLERS (from StepBuyer) ===
  const handleCustomerInput = async (value: string) => {
    setBuyerName(value);
    setSelectedIndex(-1);
    setIsSearchActive(true);
    setXeroContactId(""); // Clear xeroContactId when typing

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (value.length >= 2) {
      debounceTimer.current = setTimeout(async () => {
        setLoadingCustomers(true);
        const results = await fetchXeroContacts(value);
        setDropdownResults(results);
        setLoadingCustomers(false);
      }, 300);
    } else {
      setDropdownResults([]);
      setIsSearchActive(false);
    }
  };

  const selectCustomer = (contact: XeroContact) => {
    setBuyerName(contact.Name);
    setXeroContactId(contact.ContactID || "");
    setDropdownResults([]);
    setSelectedIndex(-1);
    setIsSearchActive(false);
  };

  // Auto-save buyer on field changes
  useEffect(() => {
    if (buyerName) {
      setBuyer({
        name: buyerName,
        xeroContactId: xeroContactId || undefined,
      });
    }
  }, [buyerName, xeroContactId, setBuyer]);

  // === REVIEW SECTION CALCULATIONS (from StepReview) ===
  useEffect(() => {
    if (state.items.length > 0 && state.buyer) {
      const costs = calculateImpliedCosts({
        items: state.items,
        paymentMethod: state.currentPaymentMethod,
        deliveryCountry: state.deliveryCountry,
      });
      setImpliedCosts(costs);

      // Calculate gross margin (GBP only)
      let gross = 0;
      for (const item of state.items) {
        if (item.buyCurrency === "GBP" && item.sellCurrency === "GBP") {
          gross += (item.sellPrice - item.buyPrice) * item.quantity;
        }
      }
      setGrossMarginGBP(parseFloat(gross.toFixed(2)));

      // Calculate commissionable margin (subtract implied costs AND import/export)
      const importExportCost = state.estimatedImportExportGBP ?? 0;
      setCommissionableMarginGBP(
        parseFloat((gross - costs.total - importExportCost).toFixed(2)),
      );
    }
  }, [
    state.items,
    state.currentPaymentMethod,
    state.deliveryCountry,
    state.buyer,
    state.estimatedImportExportGBP,
  ]);

  // === REVIEW SECTION HANDLERS (from StepReview) ===
  const handleCreateInvoice = async () => {
    if (!state.buyer || !state.taxScenario || state.items.length === 0) {
      setError("Missing required data. Please complete all steps.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Build trade payload
      const trade = buildTradePayload({
        buyer: state.buyer,
        items: state.items,
        paymentMethod: state.currentPaymentMethod,
        deliveryCountry: state.deliveryCountry,
        dueDate: state.dueDate,
        notes: state.notes || undefined,
        estimatedImportExportGBP: state.estimatedImportExportGBP,
      });

      // Send to API
      const response = await fetch("/api/trade/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(trade),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create invoice");
      }

      // Show success state
      setSuccessData({
        invoiceNumber: data.invoiceNumber,
        invoiceUrl: data.invoiceUrl,
        commissionableMarginGBP: data.commissionableMarginGBP,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate totals for review section
  const totalSellGBP = state.items
    .filter((item) => item.sellCurrency === "GBP")
    .reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);

  const totalBuyGBP = state.items
    .filter((item) => item.buyCurrency === "GBP")
    .reduce((sum, item) => sum + item.buyPrice * item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* SUCCESS STATE (from StepReview) */}
      {successData && (
        <div className="bg-green-50 border-2 border-green-600 rounded-lg p-6 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-semibold text-green-900">
                Invoice Created Successfully!
              </h3>
              <div className="mt-2 text-sm text-green-800">
                <p>
                  <strong>Invoice Number:</strong> {successData.invoiceNumber}
                </p>
                <p className="mt-1">
                  <strong>Commissionable Margin:</strong> £
                  {successData.commissionableMarginGBP.toFixed(2)}
                </p>
              </div>
              <div className="mt-4">
                <a
                  href={successData.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors"
                >
                  Open Invoice in Xero
                  <svg
                    className="ml-2 h-4 w-4"
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
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION A: BUYER */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Buyer Details</h2>
        <p className="text-sm text-gray-600 mb-4">
          Enter buyer information for the invoice
        </p>

        <div className="space-y-4">
          {/* Buyer Name (with Xero search) */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buyer name *
            </label>
            <div className="relative">
              <input
                type="text"
                value={buyerName}
                onChange={(e) => handleCustomerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (!dropdownResults.length) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedIndex((i) =>
                      i < dropdownResults.length - 1 ? i + 1 : i,
                    );
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
                  }
                  if (e.key === "Enter" && selectedIndex >= 0) {
                    e.preventDefault();
                    selectCustomer(dropdownResults[selectedIndex]);
                  }
                  if (e.key === "Escape") {
                    setDropdownResults([]);
                    setIsSearchActive(false);
                  }
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search Xero contacts or enter name"
                required
              />
              {loadingCustomers && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              {dropdownResults.length > 0 && (
                <ul className="absolute z-10 mt-1 bg-white border-2 border-gray-300 rounded-lg max-h-48 overflow-auto w-full shadow-lg">
                  {dropdownResults.map((c, i) => (
                    <li
                      key={i}
                      className={`p-3 cursor-pointer ${
                        selectedIndex === i
                          ? "bg-blue-600 text-white"
                          : "hover:bg-gray-100 text-gray-900"
                      }`}
                      onClick={() => selectCustomer(c)}
                      onMouseEnter={() => setSelectedIndex(i)}
                    >
                      {c.Name}
                      {c.EmailAddress && (
                        <div className="text-xs opacity-75">{c.EmailAddress}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Type at least 2 characters to search Xero contacts.
            </div>
            {xeroContactId && (
              <div className="text-xs text-green-600 mt-1">
                ✓ Linked to Xero contact: {xeroContactId}
              </div>
            )}
          </div>

          {/* Invoice Due Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice due date *
            </label>
            <input
              type="date"
              value={state.dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={state.notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any additional notes for this deal..."
            />
          </div>
        </div>
      </div>

      {/* SECTION B: REVIEW */}
      <div className="border-t-2 border-gray-300 pt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Review & Create Invoice</h2>

        {/* Items - Desktop Table */}
        <div className="hidden md:block border border-gray-300 rounded-lg overflow-hidden bg-white mb-6">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
            <h3 className="font-semibold text-gray-900">Items</h3>
          </div>
          <div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    #
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Brand
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Category
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Description
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">
                    Qty
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">
                    Buy Price
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">
                    Sell Price
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {state.items.map((item, index) => {
                  const margin =
                    item.buyCurrency === "GBP" && item.sellCurrency === "GBP"
                      ? (item.sellPrice - item.buyPrice) * item.quantity
                      : null;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-gray-600">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.brand}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.category}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                        {item.description}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {item.buyCurrency} {item.buyPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {item.sellCurrency} {item.sellPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {margin !== null ? `£${margin.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-3 text-right font-semibold text-gray-900"
                  >
                    Totals (GBP):
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    £{totalBuyGBP.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    £{totalSellGBP.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    £{grossMarginGBP.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Items - Mobile Cards */}
        <div className="md:hidden space-y-3 mb-6">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Items</h3>
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Edit
            </button>
          </div>
          {state.items.map((item, index) => {
            const margin =
              item.buyCurrency === "GBP" && item.sellCurrency === "GBP"
                ? (item.sellPrice - item.buyPrice) * item.quantity
                : null;
            return (
              <div
                key={item.id}
                className="border border-gray-300 rounded-lg p-4 bg-white"
              >
                {/* Row 1: Brand · Category */}
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-gray-900 text-base">
                    {item.brand} · {item.category}
                  </div>
                  <div className="text-xs text-gray-500 ml-2">#{index + 1}</div>
                </div>

                {/* Row 2: Description */}
                <div className="text-sm text-gray-700 mb-3 line-clamp-2">
                  {item.description}
                </div>

                {/* Row 3: Qty & Currency */}
                <div className="flex gap-4 text-xs text-gray-600 mb-3">
                  <div>
                    <span className="font-medium">Qty:</span> {item.quantity}
                  </div>
                  <div>
                    <span className="font-medium">Buy:</span> {item.buyCurrency}
                  </div>
                  <div>
                    <span className="font-medium">Sell:</span> {item.sellCurrency}
                  </div>
                </div>

                {/* Row 4: Prices & Margin */}
                <div className="grid grid-cols-3 gap-2 text-sm pt-3 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-600 mb-0.5">Buy</div>
                    <div className="font-medium text-gray-900">
                      {item.buyCurrency} {item.buyPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-0.5">Sell</div>
                    <div className="font-medium text-gray-900">
                      {item.sellCurrency} {item.sellPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-0.5">Margin</div>
                    <div className="font-semibold text-gray-900">
                      {margin !== null ? `£${margin.toFixed(2)}` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Totals Card (Mobile) */}
          <div className="border-2 border-gray-400 rounded-lg p-4 bg-gray-50">
            <div className="font-semibold text-gray-900 mb-3 text-sm">
              Totals (GBP)
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs text-gray-600 mb-0.5">Total Buy</div>
                <div className="font-semibold text-gray-900">
                  £{totalBuyGBP.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-0.5">Total Sell</div>
                <div className="font-semibold text-gray-900">
                  £{totalSellGBP.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-0.5">Gross Margin</div>
                <div className="font-bold text-gray-900">
                  £{grossMarginGBP.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tax Scenario Summary */}
        {state.taxScenario && (
          <div className="border border-blue-300 bg-blue-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-3">Tax Scenario</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-blue-700 font-medium">Tax Type</div>
                <div className="text-blue-900">{state.taxScenario.taxLabel}</div>
              </div>
              <div>
                <div className="text-blue-700 font-medium">Account Code</div>
                <div className="text-blue-900">
                  {state.taxScenario.accountCode}
                </div>
              </div>
              <div>
                <div className="text-blue-700 font-medium">Brand Theme</div>
                <div className="text-blue-900">
                  {state.taxScenario.brandTheme}
                </div>
              </div>
              <div>
                <div className="text-blue-700 font-medium">Line Amount Types</div>
                <div className="text-blue-900">
                  {state.taxScenario.lineAmountTypes}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-blue-700 bg-white border border-blue-200 p-2 rounded">
              <strong>Tax Liability:</strong> {state.taxScenario.taxLiability}
            </div>
          </div>
        )}

        {/* Implied Costs & Commissionable Margin */}
        <div className="border-2 border-purple-600 bg-purple-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-purple-900 mb-3">
            Implied Costs & Commissionable Margin{" "}
            <span className="text-xs font-normal text-purple-700">
              (internal)
            </span>
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-700">Gross margin (GBP):</span>
              <span className="font-semibold text-purple-900 text-right">
                £{grossMarginGBP.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-700">Implied shipping:</span>
              <span className="font-medium text-purple-900 text-right">
                −£{impliedCosts.shipping.toFixed(2)}
              </span>
            </div>
            {impliedCosts.cardFees > 0 && (
              <div className="flex justify-between">
                <span className="text-purple-700">Card processing fees:</span>
                <span className="font-medium text-purple-900 text-right">
                  −£{impliedCosts.cardFees.toFixed(2)}
                </span>
              </div>
            )}
            {state.estimatedImportExportGBP !== null &&
              state.estimatedImportExportGBP > 0 && (
                <div className="flex justify-between">
                  <span className="text-purple-700">Import/export taxes:</span>
                  <span className="font-medium text-purple-900 text-right">
                    −£{state.estimatedImportExportGBP.toFixed(2)}
                  </span>
                </div>
              )}
            <div className="border-t-2 border-purple-300 pt-2 mt-2 flex justify-between">
              <span className="font-semibold text-purple-900">
                Commissionable margin (GBP):
              </span>
              <span className="text-lg font-bold text-purple-900 text-right">
                £{commissionableMarginGBP.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-3 text-xs text-purple-700 bg-white border border-purple-200 p-2 rounded">
            This is the margin available for commission after estimated shipping,
            card fees
            {state.estimatedImportExportGBP !== null &&
              state.estimatedImportExportGBP > 0 &&
              ", and import/export taxes"}
            , which are already included in the sale price.
          </div>
        </div>

        {/* Invoice Metadata */}
        <div className="border border-gray-300 rounded-lg p-4 bg-white mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Invoice Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-600">Due Date</div>
              <div className="font-medium text-gray-900">{state.dueDate}</div>
            </div>
            <div>
              <div className="text-gray-600">Payment Method</div>
              <div className="font-medium text-gray-900">
                {state.currentPaymentMethod}
              </div>
            </div>
          </div>
          {state.notes && (
            <div className="mt-3">
              <div className="text-gray-600 text-sm">Notes</div>
              <div className="text-sm text-gray-900 mt-1 bg-gray-50 p-2 rounded border border-gray-200">
                {state.notes}
              </div>
            </div>
          )}
        </div>

        {/* CREATE INVOICE BUTTON */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleCreateInvoice}
            disabled={!buyerName || !state.dueDate || state.isSubmitting || !!successData}
            className={`w-full px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center ${
              !buyerName || !state.dueDate || state.isSubmitting || successData
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-black text-white hover:bg-gray-800 shadow-md active:scale-95"
            }`}
          >
            {state.isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating Invoice...
              </>
            ) : successData ? (
              "✓ Invoice Created"
            ) : (
              "Create Xero Invoice"
            )}
          </button>

          {!buyerName && (
            <p className="text-sm text-gray-500 mt-2 text-center">
              Please add buyer details above to create the invoice
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
