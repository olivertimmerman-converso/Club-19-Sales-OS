"use client";

import React, { useState, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import {
  TradeItem,
  Supplier,
  TaxRegime,
  PaymentMethod,
} from "@/lib/types/invoice";
import { BRANDS, CATEGORIES, COUNTRIES, CURRENCIES } from "@/lib/constants";
import { v4 as uuidv4 } from "uuid";

type ItemFormMode =
  | "new-first"
  | "same-supplier"
  | "different-supplier"
  | "list";

/**
 * Derive purchase tax regime from the tax scenario
 * This is the single source of truth - user chose tax treatment in Step 0
 */
function derivePurchaseTaxRegime(
  taxScenario: {
    accountCode: string;
    taxType: string;
    amountsAre: string;
  } | null,
): TaxRegime {
  if (!taxScenario) return TaxRegime.UK_VAT;

  // UK Margin Scheme (account 424)
  if (taxScenario.accountCode === "424") {
    return TaxRegime.MARGIN_SCHEME;
  }

  // UK 20% VAT (account 425)
  if (taxScenario.accountCode === "425") {
    return TaxRegime.UK_VAT;
  }

  // Export Sales (account 423) - typically zero-rated
  if (taxScenario.accountCode === "423") {
    // Could be EU or non-EU export, default to Non-EU
    return TaxRegime.NON_EU;
  }

  // Default to UK VAT
  return TaxRegime.UK_VAT;
}

export function StepSupplierItems() {
  const {
    state,
    setCurrentSupplier,
    setCurrentPaymentMethod,
    setCurrentBuyCurrency,
    setCurrentFxRate,
    setDeliveryCountry,
    addItem,
    removeItem,
  } = useTrade();

  const [mode, setMode] = useState<ItemFormMode>(
    state.items.length === 0 ? "new-first" : "list",
  );

  // Derive purchase tax regime from Step 0 tax scenario (single source of truth)
  const purchaseTaxRegime = useMemo(
    () => derivePurchaseTaxRegime(state.taxScenario),
    [state.taxScenario],
  );

  // Form state for new item
  const [supplierName, setSupplierName] = useState("");
  const [supplierCountry, setSupplierCountry] = useState("UK");
  const [deliveryCountryLocal, setDeliveryCountryLocal] = useState(
    state.deliveryCountry || "UK",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    state.currentPaymentMethod || PaymentMethod.CARD,
  );

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

  const handleAddItem = () => {
    if (!state.taxScenario) {
      alert("Tax scenario not set");
      return;
    }

    // Validate required fields
    if (
      !supplierName ||
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

    const supplier: Supplier = {
      name: supplierName,
      country: supplierCountry,
      taxRegime: purchaseTaxRegime, // Derived from Step 0 tax scenario
    };

    const item: TradeItem = {
      id: uuidv4(),
      brand,
      category,
      description,
      quantity,
      supplier,
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

    // Update context
    setCurrentSupplier(supplier);
    setCurrentPaymentMethod(paymentMethod);
    setCurrentBuyCurrency(buyCurrency);
    setCurrentFxRate(showFxRate ? parseFloat(fxRate) : null);
    setDeliveryCountry(deliveryCountryLocal);

    addItem(item);

    // Reset form
    setDescription("");
    setBuyPrice("");
    setSellPrice("");
    setMode("list");
  };

  const handleSameSupplier = () => {
    if (state.currentSupplier) {
      setSupplierName(state.currentSupplier.name);
      setSupplierCountry(state.currentSupplier.country);
      // Tax regime is derived from taxScenario, not stored per supplier
    }
    if (state.items.length > 0) {
      const lastItem = state.items[state.items.length - 1];
      setBrand(lastItem.brand);
      setCategory(lastItem.category);
    }
    setMode("same-supplier");
  };

  const handleDifferentSupplier = () => {
    // Reset supplier fields
    setSupplierName("");
    setSupplierCountry("UK");
    setDeliveryCountryLocal(state.deliveryCountry || "UK");
    // Tax regime is derived from taxScenario, not set here
    // Reset item fields
    setBrand("");
    setCategory("");
    setDescription("");
    setBuyPrice("");
    setSellPrice("");
    setMode("different-supplier");
  };

  if (mode === "list" && state.items.length > 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Items</h2>
          <p className="text-sm text-gray-600">
            You have {state.items.length} item
            {state.items.length > 1 ? "s" : ""} in this trade.
          </p>
        </div>

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
              className="w-full p-3 border-2 border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              + Add another item — different supplier
            </button>
          </div>
        )}

        {state.items.length >= 3 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
            ⚠️ Maximum 3 items per trade. Click <strong>Next</strong> to
            continue to buyer details.
          </div>
        )}
      </div>
    );
  }

  // Item form (new-first, same-supplier, different-supplier)
  const isFirstItem = mode === "new-first";
  const showSupplierFields =
    mode === "new-first" || mode === "different-supplier";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {isFirstItem ? "Supplier & First Item" : "Add Item"}
        </h2>
        <p className="text-sm text-gray-600">
          {isFirstItem
            ? "Enter supplier and purchase details for the first item in this trade."
            : mode === "same-supplier"
              ? "Adding another item from the same supplier."
              : "Adding an item from a different supplier."}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAddItem();
        }}
        className="space-y-6"
      >
        {/* Supplier Section */}
        {showSupplierFields && (
          <div className="border-t-4 border-gray-300 bg-gray-50 p-4 rounded-lg space-y-4">
            <h3 className="font-semibold text-gray-900">
              Supplier & Purchase Info
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier Name *
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier Country *
                </label>
                <select
                  value={supplierCountry}
                  onChange={(e) => setSupplierCountry(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Country *
                </label>
                <select
                  value={deliveryCountryLocal}
                  onChange={(e) => setDeliveryCountryLocal(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-gray-500 mt-1">
                  Where this item will actually be delivered. Used to estimate
                  shipping costs only (not tax).
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Tax Treatment
                </label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-gray-700">
                  {purchaseTaxRegime.replace(/_/g, " ")}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  ✓ Derived from Step 0 tax scenario
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as PaymentMethod)
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={PaymentMethod.CARD}>Card</option>
                  <option value={PaymentMethod.BANK_TRANSFER}>
                    Bank Transfer
                  </option>
                </select>
              </div>
            </div>
          </div>
        )}

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
              placeholder="e.g., Birkin 25 Black Togo GHW"
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
