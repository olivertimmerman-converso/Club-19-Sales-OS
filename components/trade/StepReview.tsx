"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { buildTradePayload } from "@/lib/trade-payload";
import { calculateImpliedCosts } from "@/lib/implied-costs";
import { TradeItem } from "@/lib/types/invoice";
import { v4 as uuidv4 } from "uuid";

export function StepReview() {
  const {
    state,
    setDueDate,
    setNotes,
    setSubmitting,
    setError,
    resetWizard,
    goToStep,
    addItem
  } = useTrade();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [successData, setSuccessData] = useState<{
    invoiceNumber: string;
    invoiceUrl: string;
    commissionableMarginGBP: number;
  } | null>(null);

  // Convert currentItem to TradeItem automatically when entering this step
  useEffect(() => {
    // Only add if we have currentItem and no items in the list yet
    if (
      state.currentItem &&
      state.currentSupplier &&
      state.taxScenario &&
      state.currentItem.buyPrice &&
      state.currentItem.sellPrice &&
      state.items.length === 0
    ) {
      const tradeItem: TradeItem = {
        id: uuidv4(),
        brand: state.currentItem.brand,
        category: state.currentItem.category,
        description: state.currentItem.description,
        quantity: state.currentItem.quantity,
        supplier: state.currentSupplier,
        buyPrice: state.currentItem.buyPrice,
        buyCurrency: "GBP", // GBP only as per requirements
        sellPrice: state.currentItem.sellPrice,
        sellCurrency: "GBP", // GBP only as per requirements
        accountCode: state.taxScenario.accountCode,
        taxType: state.taxScenario.taxType,
        taxLabel: state.taxScenario.taxLabel,
        lineAmountTypes: state.taxScenario.lineAmountTypes,
        brandTheme: state.taxScenario.brandTheme,
      };

      addItem(tradeItem);
    }
  }, [
    state.currentItem,
    state.currentSupplier,
    state.taxScenario,
    state.items.length,
    addItem,
  ]);

  // Calculate totals and margins
  const { totalBuyGBP, totalSellGBP, grossMarginGBP } = useMemo(() => {
    let buyTotal = 0;
    let sellTotal = 0;

    for (const item of state.items) {
      if (item.buyCurrency === "GBP") {
        buyTotal += item.buyPrice * item.quantity;
      }
      if (item.sellCurrency === "GBP") {
        sellTotal += item.sellPrice * item.quantity;
      }
    }

    const grossMargin = sellTotal - buyTotal;

    return {
      totalBuyGBP: parseFloat(buyTotal.toFixed(2)),
      totalSellGBP: parseFloat(sellTotal.toFixed(2)),
      grossMarginGBP: parseFloat(grossMargin.toFixed(2)),
    };
  }, [state.items]);

  // Calculate implied costs
  const impliedCosts = useMemo(() => {
    if (state.items.length === 0) {
      return { shipping: 0, cardFees: 0, total: 0 };
    }

    return calculateImpliedCosts({
      items: state.items,
      paymentMethod: state.currentPaymentMethod,
      deliveryCountry: state.deliveryCountry,
    });
  }, [state.items, state.currentPaymentMethod, state.deliveryCountry]);

  // Calculate commissionable margin
  const commissionableMarginGBP = useMemo(() => {
    const importExportCost = state.estimatedImportExportGBP ?? 0;
    const importVATCost = state.importVAT ?? 0;
    return parseFloat(
      (grossMarginGBP - impliedCosts.total - importExportCost - importVATCost).toFixed(2)
    );
  }, [grossMarginGBP, impliedCosts, state.estimatedImportExportGBP, state.importVAT]);

  // Handle invoice creation
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

      if (!response.ok || data.status === "error") {
        throw new Error(data.message || "Invoice creation failed");
      }

      // Success!
      setSuccessData({
        invoiceNumber: data.invoiceNumber || "N/A",
        invoiceUrl: data.invoiceUrl || "",
        commissionableMarginGBP: data.commissionableMarginGBP || commissionableMarginGBP,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReset = () => {
    resetWizard();
    goToStep(0);
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Review & Create Invoice
        </h2>
        <p className="text-sm text-gray-600">
          Review all details before creating the Xero invoice
        </p>
      </div>

      {/* Invoice Metadata Card */}
      <div className="border-t-4 border-blue-600 bg-blue-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Invoice Details</h3>

        {/* Due Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Due Date <span className="text-red-600">*</span>
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

      {/* Deal Summary Card */}
      {state.items.length > 0 && (
        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
            <h3 className="font-semibold text-gray-900">Deal Summary</h3>
          </div>

          {/* Item Details */}
          <div className="p-4 space-y-3">
            {state.items.map((item, index) => (
              <div key={item.id} className="pb-3 border-b border-gray-200 last:border-b-0">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {item.brand} · {item.category}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">{item.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-2"
                  >
                    Edit
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                  <div>
                    <span className="text-gray-600">Quantity:</span>
                    <span className="font-medium text-gray-900 ml-1">{item.quantity}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Supplier:</span>
                    <span className="font-medium text-gray-900 ml-1">{item.supplier.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Buy Price:</span>
                    <span className="font-medium text-gray-900 ml-1">
                      £{item.buyPrice.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Sell Price:</span>
                    <span className="font-medium text-gray-900 ml-1">
                      £{item.sellPrice.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">Item Margin:</span>
                    <span className="font-semibold text-gray-900">
                      £{((item.sellPrice - item.buyPrice) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Totals */}
            <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">Total Buy (GBP):</span>
                <span className="font-semibold text-gray-900">£{totalBuyGBP.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Total Sell (GBP):</span>
                <span className="font-semibold text-gray-900">£{totalSellGBP.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-semibold text-gray-900">Gross Margin (GBP):</span>
                <span className="font-bold text-gray-900 text-base">
                  £{grossMarginGBP.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buyer & Delivery Info */}
      {(state.buyer || state.deliveryCountry) && (
        <div className="border border-purple-300 bg-purple-50 rounded-lg p-4">
          <h3 className="font-semibold text-purple-900 mb-3">Buyer & Delivery</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {state.buyer && (
              <div>
                <div className="text-purple-700 font-medium">Buyer</div>
                <div className="text-purple-900">{state.buyer.name}</div>
                {state.buyer.xeroContactId && (
                  <div className="text-xs text-purple-600 mt-0.5">
                    ✓ Linked to Xero
                  </div>
                )}
              </div>
            )}
            {state.deliveryCountry && (
              <div>
                <div className="text-purple-700 font-medium">Delivery Country</div>
                <div className="text-purple-900">{state.deliveryCountry}</div>
              </div>
            )}
            {state.currentPaymentMethod && (
              <div>
                <div className="text-purple-700 font-medium">Payment Method</div>
                <div className="text-purple-900">{state.currentPaymentMethod}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tax Scenario Summary */}
      {state.taxScenario && (
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-3">Tax Scenario</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-green-700 font-medium">Tax Type</div>
              <div className="text-green-900">{state.taxScenario.taxLabel}</div>
            </div>
            <div>
              <div className="text-green-700 font-medium">Account Code</div>
              <div className="text-green-900">{state.taxScenario.accountCode}</div>
            </div>
            <div>
              <div className="text-green-700 font-medium">Brand Theme</div>
              <div className="text-green-900">{state.taxScenario.brandTheme}</div>
            </div>
            <div>
              <div className="text-green-700 font-medium">Line Amount Types</div>
              <div className="text-green-900">{state.taxScenario.lineAmountTypes}</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-green-700 bg-white border border-green-200 p-2 rounded">
            <strong>Tax Liability:</strong> {state.taxScenario.taxLiability}
          </div>
        </div>
      )}

      {/* Implied Costs & Commissionable Margin */}
      <div className="border-2 border-purple-600 bg-purple-50 rounded-lg p-4">
        <h3 className="font-semibold text-purple-900 mb-3">
          Internal Economics{" "}
          <span className="text-xs font-normal text-purple-700">(for commission calculation)</span>
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-purple-700">Gross margin (GBP):</span>
            <span className="font-semibold text-purple-900">£{grossMarginGBP.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-700">Implied shipping:</span>
            <span className="font-medium text-purple-900">−£{impliedCosts.shipping.toFixed(2)}</span>
          </div>
          {state.importVAT !== null && state.importVAT > 0 && (
            <div className="flex justify-between">
              <span className="text-purple-700">Import VAT (non-reclaimable):</span>
              <span className="font-medium text-purple-900">
                −£{state.importVAT.toFixed(2)}
              </span>
            </div>
          )}
          {impliedCosts.cardFees > 0 && (
            <div className="flex justify-between">
              <span className="text-purple-700">Card processing fees:</span>
              <span className="font-medium text-purple-900">
                −£{impliedCosts.cardFees.toFixed(2)}
              </span>
            </div>
          )}
          {state.estimatedImportExportGBP !== null &&
            state.estimatedImportExportGBP > 0 && (
              <div className="flex justify-between">
                <span className="text-purple-700">Import/export taxes:</span>
                <span className="font-medium text-purple-900">
                  −£{state.estimatedImportExportGBP.toFixed(2)}
                </span>
              </div>
            )}
          <div className="border-t-2 border-purple-300 pt-2 mt-2 flex justify-between">
            <span className="font-semibold text-purple-900">Commissionable margin (GBP):</span>
            <span className="text-lg font-bold text-purple-900">
              £{commissionableMarginGBP.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="mt-3 text-xs text-purple-700 bg-white border border-purple-200 p-2 rounded">
          This is the margin available for commission after estimated shipping, card fees
          {state.estimatedImportExportGBP !== null &&
            state.estimatedImportExportGBP > 0 &&
            ", and import/export taxes"}
          .
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {state.error}
          </p>
        </div>
      )}

      {/* Success Display */}
      {successData && (
        <div className="bg-green-50 border-2 border-green-600 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-shrink-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-green-900">Invoice Created Successfully!</h3>
          </div>
          <div className="space-y-2 text-sm text-green-800">
            <p>
              <strong>Invoice Number:</strong> {successData.invoiceNumber}
            </p>
            <p>
              <strong>Commissionable Margin:</strong> £{successData.commissionableMarginGBP.toFixed(2)}
            </p>
            {successData.invoiceUrl && (
              <a
                href={successData.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-green-700 underline hover:text-green-900 font-medium"
              >
                View in Xero →
              </a>
            )}
          </div>
        </div>
      )}

      {/* CREATE INVOICE BUTTON */}
      <div className="mt-6 space-y-3">
        {/* Discard & start new deal button */}
        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          className="text-sm font-normal text-gray-600 hover:text-gray-900 underline transition-colors"
        >
          Discard & start new deal
        </button>

        <button
          type="button"
          onClick={handleCreateInvoice}
          disabled={
            !state.buyer ||
            !state.dueDate ||
            state.isSubmitting ||
            !!successData ||
            state.items.length === 0
          }
          className={`w-full px-6 py-3 rounded-lg font-semibold transition-all flex items-center justify-center ${
            !state.buyer || !state.dueDate || state.isSubmitting || successData || state.items.length === 0
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-800 shadow-md active:scale-95"
          }`}
        >
          {state.isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
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

        {!state.buyer && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Please complete all previous steps to create the invoice
          </p>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Start a new deal?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will clear all fields for this deal and take you back to the first step. This
              action can&apos;t be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                Start again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
