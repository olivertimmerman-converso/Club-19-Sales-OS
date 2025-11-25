"use client";

import React, { useState, useEffect } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { buildTradePayload } from "@/lib/trade-payload";
import { calculateImpliedCosts } from "@/lib/implied-costs";
import { Trade } from "@/lib/types/invoice";

export function StepReview() {
  const { state, goToStep, setSubmitting, setError } = useTrade();

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

  // Calculate implied costs and margins
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
      setCommissionableMarginGBP(parseFloat((gross - costs.total).toFixed(2)));
    }
  }, [
    state.items,
    state.currentPaymentMethod,
    state.deliveryCountry,
    state.buyer,
  ]);

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

  // Calculate totals
  const totalSellGBP = state.items
    .filter((item) => item.sellCurrency === "GBP")
    .reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);

  const totalBuyGBP = state.items
    .filter((item) => item.buyCurrency === "GBP")
    .reduce((sum, item) => sum + item.buyPrice * item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Success State */}
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

      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Review Deal & Create Invoice
        </h2>
        <p className="text-sm text-gray-600">
          Check everything carefully before you create the Xero invoice.
        </p>
      </div>

      {/* Buyer Summary */}
      <div className="border border-gray-300 rounded-lg p-4 bg-white">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-semibold text-gray-900">Buyer</h3>
          <button
            type="button"
            onClick={() => goToStep(2)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Edit
          </button>
        </div>
        {state.buyer && (
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-medium">{state.buyer.name}</span>
              {state.buyer.tag && (
                <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                  {state.buyer.tag}
                </span>
              )}
            </div>
            {state.buyer.email && (
              <div className="text-gray-600">{state.buyer.email}</div>
            )}
            {state.buyer.phone && (
              <div className="text-gray-600">{state.buyer.phone}</div>
            )}
            {state.buyer.country && (
              <div className="text-gray-600">{state.buyer.country}</div>
            )}
            {state.buyer.xeroContactId && (
              <div className="text-xs text-green-600 mt-2">
                ✓ Linked to Xero: {state.buyer.xeroContactId}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
          <h3 className="font-semibold text-gray-900">Items</h3>
        </div>
        <div className="overflow-x-auto">
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

      {/* Tax Scenario Summary */}
      {state.taxScenario && (
        <div className="border border-blue-300 bg-blue-50 rounded-lg p-4">
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
      <div className="border-2 border-purple-600 bg-purple-50 rounded-lg p-4">
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
          This is the margin available for commission after estimated shipping
          and card fees, which are already included in the sale price.
        </div>
      </div>

      {/* Invoice Metadata */}
      <div className="border border-gray-300 rounded-lg p-4 bg-white">
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

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={() => goToStep(2)}
          className="px-6 py-3 border-2 border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          ← Back to Buyer
        </button>
        <button
          type="button"
          onClick={handleCreateInvoice}
          disabled={state.isSubmitting || !!successData}
          className={`flex-1 px-6 py-3 rounded-md font-semibold transition-colors flex items-center justify-center ${
            state.isSubmitting || successData
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {state.isSubmitting ? (
            <>
              <svg
                className="animate-spin h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Creating Invoice...
            </>
          ) : successData ? (
            "✓ Invoice Created"
          ) : (
            "Create Xero Invoice"
          )}
        </button>
      </div>
    </div>
  );
}
