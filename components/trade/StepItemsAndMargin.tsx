"use client";

import React, { useState, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { TradeItem } from "@/lib/types/invoice";
import { BRANDS, CATEGORIES, CURRENCIES } from "@/lib/constants";
import { v4 as uuidv4 } from "uuid";
import { calculateImpliedCosts } from "@/lib/implied-costs";
import {
  computeDealStructureSuggestion,
  getAlternativeDescriptionShort,
} from "@/lib/tax-helpers";

type ItemFormMode =
  | "new-first"
  | "same-supplier"
  | "different-supplier"
  | "list";

export function StepItemsAndMargin() {
  const {
    state,
    setEstimatedImportExportGBP,
    addItem,
    removeItem,
  } = useTrade();

  const [mode, setMode] = useState<ItemFormMode>(
    state.items.length === 0 ? "new-first" : "list",
  );

  // Form state for new item
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [buyPrice, setBuyPrice] = useState("");
  const [buyCurrency, setBuyCurrency] = useState(
    state.currentBuyCurrency || "GBP",
  );
  const [fxRate, setFxRate] = useState("");

  const [sellPrice, setSellPrice] = useState("");
  const [sellCurrency, setSellCurrency] = useState("GBP");

  const showFxRate = buyCurrency !== sellCurrency;

  // Calculate automated import/export taxes based on tax scenario
  const { importVAT, duty, totalImportExportTaxes } = useMemo(() => {
    if (!state.taxScenario || state.items.length === 0) {
      return { importVAT: 0, duty: 0, totalImportExportTaxes: 0 };
    }

    // Calculate total buy price in GBP
    let totalBuyPriceGBP = 0;
    for (const item of state.items) {
      if (item.buyCurrency === "GBP") {
        totalBuyPriceGBP += item.buyPrice * item.quantity;
      }
    }

    // Import VAT: 20% if C19 is importer of record (vatReclaim contains "Can")
    const isC19ImporterOfRecord = state.taxScenario.vatReclaim?.includes("Can") || false;
    const importVAT = isC19ImporterOfRecord ? totalBuyPriceGBP * 0.20 : 0;

    // Duty: 2% default (can be 0 for certain scenarios like domestic or export)
    const isDomesticOrExport =
      state.taxScenario.taxLiability === "None" ||
      state.taxScenario.accountCode === "200"; // Export sales code
    const duty = isDomesticOrExport ? 0 : totalBuyPriceGBP * 0.02;

    const total = importVAT + duty;

    return {
      importVAT: parseFloat(importVAT.toFixed(2)),
      duty: parseFloat(duty.toFixed(2)),
      totalImportExportTaxes: parseFloat(total.toFixed(2)),
    };
  }, [state.taxScenario, state.items]);

  // Calculate margins for display
  const { grossMarginGBP, impliedCosts, commissionableMarginGBP } = useMemo(() => {
    if (state.items.length === 0) {
      return { grossMarginGBP: 0, impliedCosts: { shipping: 0, cardFees: 0, total: 0 }, commissionableMarginGBP: 0 };
    }

    // Calculate gross margin (GBP only)
    let gross = 0;
    for (const item of state.items) {
      if (item.buyCurrency === "GBP" && item.sellCurrency === "GBP") {
        gross += (item.sellPrice - item.buyPrice) * item.quantity;
      }
    }

    // Calculate implied costs
    const costs = calculateImpliedCosts({
      items: state.items,
      paymentMethod: state.currentPaymentMethod,
      deliveryCountry: state.deliveryCountry,
    });

    // Calculate commissionable margin using automated import/export taxes
    const commissionable = gross - costs.total - totalImportExportTaxes;

    return {
      grossMarginGBP: parseFloat(gross.toFixed(2)),
      impliedCosts: costs,
      commissionableMarginGBP: parseFloat(commissionable.toFixed(2)),
    };
  }, [state.items, state.currentPaymentMethod, state.deliveryCountry, totalImportExportTaxes]);

  // Compute tax-aware deal structure suggestion
  // Note: We need to infer itemLocation and clientLocation from supplier and delivery countries
  const dealSuggestion = useMemo(() => {
    if (!state.currentSupplier || state.items.length === 0) {
      return {
        hasBetterAlternative: false,
        currentDutiesGBP: 0,
      };
    }

    const supplierCountry = state.currentSupplier.country;
    const deliveryCountry = state.deliveryCountry;

    // Infer item and client locations (simplified)
    const itemLocation = supplierCountry === "United Kingdom" ? "uk" : "outside";
    const clientLocation = deliveryCountry === "United Kingdom" ? "uk" : "outside";

    return computeDealStructureSuggestion({
      supplierCountry,
      deliveryCountry,
      itemLocation: itemLocation as "uk" | "outside",
      clientLocation: clientLocation as "uk" | "outside",
      supplierShipsDirect: false, // Placeholder
      landedDelivery: false, // Placeholder
      estimatedImportExportGBP: totalImportExportTaxes,
      grossMarginGBP,
    });
  }, [
    state.currentSupplier,
    state.deliveryCountry,
    totalImportExportTaxes,
    grossMarginGBP,
    state.items.length,
  ]);

  // Auto-sync computed import/export taxes to context
  React.useEffect(() => {
    setEstimatedImportExportGBP(totalImportExportTaxes);
  }, [totalImportExportTaxes, setEstimatedImportExportGBP]);

  const handleAddItem = () => {
    if (!state.taxScenario) {
      alert("Tax scenario not set");
      return;
    }

    if (!state.currentSupplier) {
      alert("Supplier not set. Please go back to Step 1.");
      return;
    }

    // Validate required fields
    if (
      !brand ||
      !category ||
      !description ||
      !buyPrice ||
      !sellPrice
    ) {
      alert("Please fill in all required fields");
      return;
    }

    if (showFxRate && !fxRate) {
      alert("FX rate is required when buy and sell currencies differ");
      return;
    }

    const item: TradeItem = {
      id: uuidv4(),
      brand,
      category,
      description,
      quantity,
      supplier: state.currentSupplier,
      buyPrice: parseFloat(buyPrice),
      buyCurrency,
      fxRate: showFxRate ? parseFloat(fxRate) : undefined,
      sellPrice: parseFloat(sellPrice),
      sellCurrency,
      // Tax fields from context
      accountCode: state.taxScenario.accountCode,
      taxType: state.taxScenario.taxType,
      taxLabel: state.taxScenario.taxLabel,
      lineAmountTypes: state.taxScenario.lineAmountTypes,
      brandTheme: state.taxScenario.brandTheme,
    };

    addItem(item);

    // Reset form
    setDescription("");
    setBuyPrice("");
    setSellPrice("");
    setMode("list");
  };

  const handleSameSupplier = () => {
    if (state.items.length > 0) {
      const lastItem = state.items[state.items.length - 1];
      setBrand(lastItem.brand);
      setCategory(lastItem.category);
    }
    setMode("same-supplier");
  };

  const handleDifferentSupplier = () => {
    // Reset brand and category (not copying from previous item)
    setBrand("");
    setCategory("");
    setMode("different-supplier");
  };

  // Item Context Summary Component
  const ItemContextSummary = () => {
    if (!state.currentSupplier || !state.taxScenario) {
      return null;
    }

    return (
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <p className="font-medium text-gray-900 mb-2">Deal Context</p>
        <ul className="space-y-1 text-gray-700">
          <li>
            <strong>Supplier:</strong> {state.currentSupplier.name} ({state.currentSupplier.country})
          </li>
          <li>
            <strong>Payment Method:</strong>{" "}
            {state.currentPaymentMethod === "CARD" ? "Card" : "Bank Transfer"}
          </li>
          <li>
            <strong>Delivery Country:</strong> {state.deliveryCountry}
          </li>
          {state.itemLocation && (
            <li>
              <strong>Item Location:</strong>{" "}
              {state.itemLocation === "uk" ? "In the UK" : "Outside the UK"}
            </li>
          )}
          {state.clientLocation && (
            <li>
              <strong>Client Location:</strong>{" "}
              {state.clientLocation === "uk" ? "UK delivery" : "Outside UK"}
            </li>
          )}
          {state.purchaseType && (
            <li>
              <strong>Purchase Type:</strong>{" "}
              {state.purchaseType === "retail" ? "Retail" : "Margin Scheme"}
            </li>
          )}
          {state.directShip && (
            <li>
              <strong>Direct Ship:</strong> {state.directShip === "yes" ? "Yes" : "No"}
            </li>
          )}
          {state.landedDelivery && (
            <li>
              <strong>Landed Delivery:</strong>{" "}
              {state.landedDelivery === "yes" ? "Yes" : "No"}
            </li>
          )}
          <li className="pt-2 border-t border-gray-300">
            <strong>Tax Treatment:</strong>
          </li>
          <li className="ml-4">
            <span className="text-xs text-gray-600">Sale Type:</span>{" "}
            {state.taxScenario.taxLabel}
          </li>
          <li className="ml-4">
            <span className="text-xs text-gray-600">VAT on Purchase:</span>{" "}
            {state.taxScenario.vatReclaim}
          </li>
        </ul>
      </div>
    );
  };

  if (mode === "list" && state.items.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Items & Pricing
          </h2>
          <p className="text-sm text-gray-600">
            Add line items and review internal economics
          </p>
        </div>

        {/* Item Context Summary */}
        <ItemContextSummary />

        {/* Items List */}
        <div className="space-y-3">
          {state.items.map((item, index) => (
            <div
              key={item.id}
              className="border border-gray-300 rounded-lg p-4 bg-white"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-gray-900">
                    {index + 1}. {item.brand} — {item.category}
                  </div>
                  <div className="text-sm text-gray-600">
                    {item.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <div>
                  <div className="text-gray-500">Supplier</div>
                  <div className="font-medium">{item.supplier.name}</div>
                  <div className="text-gray-600 text-xs">
                    {item.supplier.country}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Quantity</div>
                  <div className="font-medium">{item.quantity}</div>
                </div>
                <div>
                  <div className="text-gray-500">Buy Price</div>
                  <div className="font-medium">
                    {item.buyCurrency} {item.buyPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Sell Price</div>
                  <div className="font-medium">
                    {item.sellCurrency} {item.sellPrice.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Automated Import/Export Taxes Display */}
        {(importVAT > 0 || duty > 0) && (
          <div className="border border-blue-300 rounded-lg p-4 bg-blue-50">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              Estimated Import/Export Taxes
              <span className="text-xs font-normal text-blue-700 ml-2">
                (automated, not shown on client invoice)
              </span>
            </h3>
            <div className="space-y-1.5 text-sm">
              {importVAT > 0 && (
                <div className="flex justify-between">
                  <span className="text-blue-700">Import VAT (20%):</span>
                  <span className="font-medium text-blue-900">
                    £{importVAT.toFixed(2)}
                  </span>
                </div>
              )}
              {duty > 0 && (
                <div className="flex justify-between">
                  <span className="text-blue-700">Customs duty (2%):</span>
                  <span className="font-medium text-blue-900">
                    £{duty.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t border-blue-300 pt-1.5 mt-1.5 flex justify-between">
                <span className="font-semibold text-blue-900">Total:</span>
                <span className="font-bold text-blue-900">
                  £{totalImportExportTaxes.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="text-xs text-blue-700 mt-2 bg-white/50 p-2 rounded border border-blue-200">
              Calculated automatically based on your Step 1 tax scenario. This
              cost reduces your commissionable margin.
            </div>
          </div>
        )}

        {/* Margin Card */}
        <div className="border-2 border-purple-600 bg-purple-50 rounded-lg p-4">
          <h3 className="font-semibold text-purple-900 mb-3">
            Internal Economics
            <span className="text-xs font-normal text-purple-700 ml-2">
              (not shown on client invoice)
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
              " and any import/export duties"}
            , which are already included in the sale price.
          </div>

          {/* Alternative structure hint */}
          {dealSuggestion.hasBetterAlternative &&
            dealSuggestion.marginDeltaGBP &&
            dealSuggestion.marginDeltaGBP > 500 &&
            dealSuggestion.alternativeDutiesGBP !== undefined && (
              <div className="mt-3 text-xs text-purple-600 bg-purple-100 border border-purple-300 p-2 rounded">
                <span className="font-medium">Alternative structure:</span> If routed{" "}
                {getAlternativeDescriptionShort(dealSuggestion.alternativeDescription)}, est.
                duties drop to £{dealSuggestion.alternativeDutiesGBP.toFixed(2)} and deal margin
                improves by about £{dealSuggestion.marginDeltaGBP.toFixed(2)}.
              </div>
            )}
        </div>

        {/* Add More Items (max 3) */}
        {state.items.length < 3 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSameSupplier}
              className="w-full p-3 border-2 border-blue-600 rounded-md text-blue-700 font-medium hover:bg-blue-50 transition-colors"
            >
              + Add another item — same supplier
            </button>
            <button
              type="button"
              onClick={handleDifferentSupplier}
              className="w-full p-3 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              + Add item — different supplier
            </button>
          </div>
        )}

        {state.items.length >= 3 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
            Maximum 3 items per trade. Click <strong>Next</strong> to
            continue to buyer details.
          </div>
        )}
      </div>
    );
  }

  // Item form (new-first, same-supplier)
  const isFirstItem = mode === "new-first";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {isFirstItem ? "Items & Pricing" : "Add Item"}
        </h2>
        <p className="text-sm text-gray-600">
          {isFirstItem
            ? "Add line items and review internal economics"
            : "Adding another item from the same supplier."}
        </p>
      </div>

      {/* Item Context Summary */}
      <ItemContextSummary />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddItem();
        }}
        className="space-y-6"
      >
        {/* Item Details Section */}
        <div className="border-t-4 border-blue-600 bg-blue-50 p-4 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900">Item Details</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand *
              </label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select brand...</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select category...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., B25 Black Togo GHW"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              min="1"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Buy Side Economics */}
        <div className="border-t-4 border-green-600 bg-green-50 p-4 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900">Buy Side (Supplier)</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buy Price *
              </label>
              <input
                type="number"
                step="0.01"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency *
              </label>
              <select
                value={buyCurrency}
                onChange={(e) => setBuyCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code} ({curr.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showFxRate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                FX Rate ({buyCurrency} to {sellCurrency}) *
              </label>
              <input
                type="number"
                step="0.0001"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 1.27"
                required
              />
              <div className="text-xs text-gray-600 mt-1">
                How many {sellCurrency} per 1 {buyCurrency}
              </div>
            </div>
          )}
        </div>

        {/* Sell Side Economics */}
        <div className="border-t-4 border-purple-600 bg-purple-50 p-4 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900">Sell Side (Client)</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sell Price *
              </label>
              <input
                type="number"
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency *
              </label>
              <select
                value={sellCurrency}
                onChange={(e) => setSellCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code} ({curr.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {!isFirstItem && (
            <button
              type="button"
              onClick={() => setMode("list")}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            {isFirstItem ? "Add Item" : "Add Item"}
          </button>
        </div>
      </form>
    </div>
  );
}
