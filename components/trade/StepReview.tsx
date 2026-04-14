"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { FileText, CheckCircle } from "lucide-react";
import * as logger from '@/lib/logger';
import { roundCurrency, subtractCurrency, multiplyCurrency, addCurrency } from '@/lib/utils/currency';
import { PaymentMethod } from "@/lib/types/invoice";

export function StepReview() {
  const {
    state,
    setDueDate,
    setNotes,
    setSubmitting,
    setError,
    resetWizard,
    goToStep,
    updateItem
  } = useTrade();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [successData, setSuccessData] = useState<{
    invoiceNumber: string;
    invoiceUrl: string;
    commissionableMarginGBP: number;
  } | null>(null);

  // Update items with tax scenario when entering review step
  // This ensures all items have the correct tax codes for Xero
  // Note: Suppliers are now per-item (set in Pricing step), not global
  useEffect(() => {
    if (state.taxScenario && state.items.length > 0) {
      state.items.forEach(item => {
        // Only update if missing tax scenario fields
        if (!item.accountCode || !item.taxType) {
          updateItem(item.id, {
            accountCode: state.taxScenario!.accountCode,
            taxType: state.taxScenario!.taxType,
            taxLabel: state.taxScenario!.taxLabel,
            lineAmountTypes: state.taxScenario!.lineAmountTypes,
            brandTheme: state.taxScenario!.brandTheme,
            buyCurrency: "GBP",
            sellCurrency: "GBP",
          });
        }
      });
    }
  }, [state.taxScenario, state.items, updateItem]);

  // Calculate totals and margins with currency rounding to prevent floating point errors
  const { totalBuyGBP, totalSellGBP, grossMarginGBP } = useMemo(() => {
    let buyTotal = 0;
    let sellTotal = 0;

    for (const item of state.items) {
      if (item.buyCurrency === "GBP") {
        buyTotal += multiplyCurrency(roundCurrency(item.buyPrice), item.quantity);
      }
      if (item.sellCurrency === "GBP") {
        sellTotal += multiplyCurrency(roundCurrency(item.sellPrice), item.quantity);
      }
    }

    const grossMargin = subtractCurrency(sellTotal, buyTotal);

    return {
      totalBuyGBP: roundCurrency(buyTotal),
      totalSellGBP: roundCurrency(sellTotal),
      grossMarginGBP: roundCurrency(grossMargin),
    };
  }, [state.items]);

  // Calculate handling/shipping line item for invoice
  const CARD_FEE_RATE = 0.024; // 2.4%

  const handlingLineItem = useMemo(() => {
    const shippingAmount = state.shippingCost || 0;
    const isCardPayment = state.currentPaymentMethod === PaymentMethod.CARD;
    const cardFeeBase = addCurrency(totalSellGBP, shippingAmount);
    const cardFee = isCardPayment ? roundCurrency(cardFeeBase * CARD_FEE_RATE) : 0;
    const total = addCurrency(shippingAmount, cardFee);
    const label = shippingAmount > 0 && cardFee > 0 ? 'Handling + Shipping'
      : shippingAmount > 0 ? 'Shipping'
      : cardFee > 0 ? 'Handling' : null;
    return { cardFee, shippingAmount, total, label };
  }, [totalSellGBP, state.shippingCost, state.currentPaymentMethod]);

  // Invoice total = product sell prices + handling/shipping line item
  const invoiceTotal = addCurrency(totalSellGBP, handlingLineItem.total);

  // Implied costs: handling/shipping are now billed to the client (invoice line item),
  // so they're NOT deducted from commissionable margin. Only import VAT and
  // import/export taxes remain as internal cost deductions.
  const impliedCosts = useMemo(() => {
    return { shipping: 0, cardFees: 0, total: 0 };
  }, []);

  // Introducer fee is captured as a percentage of gross profit on the wizard.
  // Derive the £ amount here for display + deductions.
  const introducerFeeGBP = useMemo(() => {
    if (!state.hasIntroducer) return 0;
    const percent = state.introducerFeePercent ?? 0;
    if (percent <= 0 || grossMarginGBP <= 0) return 0;
    return roundCurrency(grossMarginGBP * (percent / 100));
  }, [state.hasIntroducer, state.introducerFeePercent, grossMarginGBP]);

  // Calculate commissionable margin with currency rounding
  // Phase 2: introducer fee + entrupy fee are also cost deductions.
  const commissionableMarginGBP = useMemo(() => {
    const importExportCost = roundCurrency(state.estimatedImportExportGBP ?? 0);
    const importVATCost = roundCurrency(state.importVAT ?? 0);
    const entrupyCost = roundCurrency(state.entrupyFee ?? 0);
    const totalDeductions = roundCurrency(
      impliedCosts.total + importExportCost + importVATCost + introducerFeeGBP + entrupyCost
    );
    return subtractCurrency(grossMarginGBP, totalDeductions);
  }, [
    grossMarginGBP,
    impliedCosts,
    state.estimatedImportExportGBP,
    state.importVAT,
    introducerFeeGBP,
    state.entrupyFee,
  ]);

  // Handle invoice creation via native Xero API
  const handleCreateInvoice = async () => {
    if (!state.buyer || !state.taxScenario || state.items.length === 0) {
      setError("Missing required data. Please complete all steps.");
      return;
    }

    if (!state.buyer.xeroContactId) {
      setError("Client must be selected from Xero. Please go back and select a Xero contact.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Get tax scenario from first item (all items should have same tax scenario)
      const firstItem = state.items[0];

      // Build line items array for multi-line invoice
      // CRITICAL: Round all currency values to prevent floating point errors (e.g., 24999.96 instead of 25000)
      const lineItems = state.items.map((item, index) => ({
        lineNumber: index + 1,
        brand: item.brand,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        buyPrice: roundCurrency(item.buyPrice),
        sellPrice: roundCurrency(item.sellPrice),
        lineTotal: multiplyCurrency(roundCurrency(item.sellPrice), item.quantity),
        lineMargin: multiplyCurrency(subtractCurrency(roundCurrency(item.sellPrice), roundCurrency(item.buyPrice)), item.quantity),
        supplierName: item.supplier?.name || state.currentSupplier?.name,
        supplierInvoiceRef: item.supplierInvoiceRef || undefined,
        datePurchased: item.datePurchased || undefined,
      }));

      // Add handling/shipping line item if applicable
      if (handlingLineItem.label && handlingLineItem.total > 0) {
        lineItems.push({
          lineNumber: lineItems.length + 1,
          brand: '',
          category: '',
          description: handlingLineItem.label,
          quantity: 1,
          buyPrice: 0,
          sellPrice: handlingLineItem.total,
          lineTotal: handlingLineItem.total,
          lineMargin: 0,
          supplierName: '',
          supplierInvoiceRef: undefined,
          datePurchased: undefined,
        });
      }

      // Create invoice payload for native Xero API with multi-line items
      const invoicePayload = {
        buyerContactId: state.buyer.xeroContactId,
        lineItems, // Array of line items for Xero
        accountCode: firstItem.accountCode,
        taxType: firstItem.taxType,
        brandingThemeId: firstItem.brandTheme || undefined,
        currency: "GBP",
        lineAmountType: firstItem.lineAmountTypes,

        // Summary fields for Sales record
        totalSellPrice: totalSellGBP,
        totalBuyPrice: totalBuyGBP,
        grossMargin: grossMarginGBP,
        commissionableMargin: commissionableMarginGBP,
        cardFees: handlingLineItem.cardFee,
        shippingCost: state.shippingCost || 0,
        paymentMethod: state.currentPaymentMethod,
        notes: state.notes || undefined,

        // Phase 2 wizard fields
        isNewClient: state.isNewClient,
        hasIntroducer: state.hasIntroducer || false,
        introducerName: state.hasIntroducer ? state.introducerName : undefined,
        introducerCommission: introducerFeeGBP,
        introducerFeePercent: state.hasIntroducer ? (state.introducerFeePercent ?? 0) : 0,
        entrupyFee: state.entrupyFee || 0,

        // Legacy fields for backward compatibility (use first item)
        supplierName: firstItem.supplier?.name || state.currentSupplier?.name,
        brand: firstItem.brand,
        category: firstItem.category,
        itemTitle: firstItem.description,
        quantity: state.items.reduce((sum, item) => sum + item.quantity, 0),
      };

      logger.info('TRADE_UI', 'Sending multi-line invoice to Xero API', {
        itemCount: lineItems.length,
        totalSell: totalSellGBP,
        totalBuy: totalBuyGBP,
      });

      // Call native Xero API
      const response = await fetch("/api/xero/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invoicePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle Xero connection errors
        if (data.action === "connect_xero" || data.action === "reconnect_xero") {
          throw new Error(data.message || "Please connect your Xero account");
        }
        throw new Error(data.message || data.error || "Invoice creation failed");
      }

      logger.info('TRADE_UI', 'Invoice created successfully', { data });

      // Redirect to success page with invoice details
      const successParams: Record<string, string> = {
        invoiceId: data.invoiceId,
        invoiceNumber: data.invoiceNumber,
        contact: data.contactName || state.buyer.name,
        amount: data.total.toString(),
        currency: "GBP",
        url: data.invoiceUrl,
      };
      if (data.saleId) {
        successParams.saleId = data.saleId;
      }
      const successUrl = new URLSearchParams(successParams);

      // Clear draft before navigating away
      try { localStorage.removeItem("club19_trade_draft"); } catch { /* ignore */ }
      window.location.href = `/trade/success?${successUrl.toString()}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
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
        <div className="min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice Due Date <span className="text-red-600">*</span>
          </label>
          {/* iOS Safari's <input type="date"> has an intrinsic minimum width set
              by the user agent stylesheet and ignores width: 100% in some
              contexts, causing the input to overflow narrow parents on iPhone.
              `appearance-none` strips the native iOS styling, `block max-w-full`
              forces it to respect the parent's content box. */}
          <input
            type="date"
            value={state.dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="block w-full max-w-full appearance-none border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* Invoice Summary Card */}
      {state.items.length > 0 && (
        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
            <h3 className="font-semibold text-gray-900">Invoice Summary</h3>
          </div>

          {/* Invoice Line Items */}
          <div className="p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Invoice Line Items
            </p>

            {state.items.map((item, index) => (
              <div key={item.id} className="flex justify-between items-start pb-3 border-b border-gray-200 last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-gray-500 font-medium mt-0.5">{index + 1}.</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.brand} {item.category}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Qty: {item.quantity} × £{item.sellPrice.toFixed(2)}
                        <span className="mx-1">·</span>
                        Supplier: {item.supplier.name}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right ml-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-900">
                    £{multiplyCurrency(roundCurrency(item.sellPrice), item.quantity).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="block text-xs text-blue-600 hover:text-blue-800 font-medium mt-1"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}

            {/* Handling/Shipping line item */}
            {handlingLineItem.label && handlingLineItem.total > 0 && (
              <div className="flex justify-between items-start pb-3 border-b border-gray-200">
                <div className="flex items-start gap-2">
                  <span className="text-sm text-gray-500 font-medium mt-0.5">{state.items.length + 1}.</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{handlingLineItem.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {handlingLineItem.cardFee > 0 && handlingLineItem.shippingAmount > 0
                        ? `Shipping £${handlingLineItem.shippingAmount.toFixed(2)} + Card handling (2.4%) £${handlingLineItem.cardFee.toFixed(2)}`
                        : handlingLineItem.cardFee > 0
                        ? `Card handling (2.4%) on £${addCurrency(totalSellGBP, handlingLineItem.shippingAmount).toFixed(2)}`
                        : `Shipping cost`}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 ml-3 flex-shrink-0">
                  £{handlingLineItem.total.toFixed(2)}
                </span>
              </div>
            )}

            {/* Invoice Total */}
            <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">Product total:</span>
                <span className="font-semibold text-gray-900">£{totalSellGBP.toFixed(2)}</span>
              </div>
              {handlingLineItem.label && handlingLineItem.total > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">{handlingLineItem.label}:</span>
                  <span className="font-semibold text-gray-900">£{handlingLineItem.total.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-semibold text-gray-900">Invoice Total:</span>
                <span className="font-bold text-gray-900 text-base">
                  £{invoiceTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client & Delivery Info */}
      {(state.buyer || state.deliveryCountry) && (
        <div className="border border-purple-300 bg-purple-50 rounded-lg p-4">
          <h3 className="font-semibold text-purple-900 mb-3">Client &amp; Delivery</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-purple-700 font-medium">Sale date</div>
              <div className="text-purple-900">
                {new Date(state.saleDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
            {state.buyer && (
              <div>
                <div className="text-purple-700 font-medium">Client</div>
                <div className="text-purple-900 flex items-center gap-2 flex-wrap">
                  <span>{state.buyer.name}</span>
                  {state.isNewClient && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-purple-200 text-purple-800">
                      New client
                    </span>
                  )}
                </div>
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
            {state.hasIntroducer && state.introducerName && (
              <div className="col-span-2">
                <div className="text-purple-700 font-medium">Introducer</div>
                <div className="text-purple-900">
                  {state.introducerName}
                  <span className="text-purple-700"> · {(state.introducerFeePercent ?? 0).toFixed(0)}% (£{introducerFeeGBP.toFixed(2)})</span>
                </div>
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
          {handlingLineItem.label && handlingLineItem.total > 0 && (
            <div className="flex justify-between">
              <span className="text-purple-700">{handlingLineItem.label} (billed to client):</span>
              <span className="font-medium text-green-700">
                +£{handlingLineItem.total.toFixed(2)} on invoice
              </span>
            </div>
          )}
          {state.importVAT !== null && state.importVAT > 0 && (
            <div className="flex justify-between">
              <span className="text-purple-700">Import VAT (non-reclaimable):</span>
              <span className="font-medium text-purple-900">
                −£{state.importVAT.toFixed(2)}
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
          {state.hasIntroducer && introducerFeeGBP > 0 && (
            <div className="flex justify-between">
              <span className="text-purple-700">Introducer fee ({state.introducerName}, {(state.introducerFeePercent ?? 0).toFixed(0)}%):</span>
              <span className="font-medium text-purple-900">
                −£{introducerFeeGBP.toFixed(2)}
              </span>
            </div>
          )}
          {state.entrupyFee > 0 && (
            <div className="flex justify-between">
              <span className="text-purple-700">Entrupy fee:</span>
              <span className="font-medium text-purple-900">
                −£{state.entrupyFee.toFixed(2)}
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
          Handling/shipping is billed to the client on the invoice. Commission is calculated on gross margin
          {(state.importVAT ?? 0) > 0 && " minus import VAT"}
          {(state.estimatedImportExportGBP ?? 0) > 0 && ", import/export taxes"}
          {state.hasIntroducer && introducerFeeGBP > 0 && ", introducer fee"}
          {state.entrupyFee > 0 && ", Entrupy fee"}
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
          className={`w-full px-8 py-4 rounded-lg text-lg font-semibold transition-all flex items-center justify-center gap-3 ${
            !state.buyer || !state.dueDate || state.isSubmitting || successData || state.items.length === 0
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-800 hover:scale-105 shadow-lg active:scale-100"
          }`}
        >
          {state.isSubmitting ? (
            <>
              Creating Invoice...
            </>
          ) : successData ? (
            <>
              <CheckCircle className="w-6 h-6" />
              Invoice Created
            </>
          ) : (
            <>
              <FileText className="w-6 h-6" />
              Create Xero Invoice
            </>
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
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Start a new invoice?</h3>
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
