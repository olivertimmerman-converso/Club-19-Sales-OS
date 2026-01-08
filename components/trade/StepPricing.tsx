"use client";

import React, { useState, useEffect } from "react";
import { useTrade } from "@/contexts/TradeContext";

export function StepPricing() {
  const { state, setCurrentItem } = useTrade();

  // Initialize from context if available
  const [buyPrice, setBuyPrice] = useState(state.currentItem?.buyPrice?.toString() || "");
  const [sellPrice, setSellPrice] = useState(state.currentItem?.sellPrice?.toString() || "");

  // Sync to context whenever prices change
  // Important: Only update if values actually changed to prevent infinite loop and floating point drift
  useEffect(() => {
    if (state.currentItem && buyPrice && sellPrice) {
      const newBuyPrice = parseFloat(buyPrice) || undefined;
      const newSellPrice = parseFloat(sellPrice) || undefined;

      // Only update if values have actually changed
      if (state.currentItem.buyPrice !== newBuyPrice || state.currentItem.sellPrice !== newSellPrice) {
        setCurrentItem({
          ...state.currentItem,
          buyPrice: newBuyPrice,
          sellPrice: newSellPrice,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyPrice, sellPrice]); // Intentionally exclude state.currentItem to prevent loop

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Pricing
        </h2>
        <p className="text-sm text-gray-600">
          Set buy and sell prices (GBP only)
        </p>
      </div>

      {/* Item Summary */}
      {state.currentItem && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-900 mb-2">Item Summary</p>
          <div className="text-sm text-gray-700 space-y-1">
            <p><strong>Brand:</strong> {state.currentItem.brand}</p>
            <p><strong>Category:</strong> {state.currentItem.category}</p>
            <p><strong>Description:</strong> {state.currentItem.description}</p>
            <p><strong>Quantity:</strong> {state.currentItem.quantity}</p>
          </div>
        </div>
      )}

      {/* Buy Price Card */}
      <div className="border-t-4 border-green-600 bg-green-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Cost Details (Supplier)</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buy Price (GBP) <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">£</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10000000"
              value={buyPrice}
              onChange={(e) => {
                const value = e.target.value;
                const numValue = parseFloat(value);

                // Allow empty string for clearing the field
                if (value === '') {
                  setBuyPrice('');
                  return;
                }

                // Prevent negative numbers
                if (numValue < 0) return;

                // Prevent extremely large numbers
                if (numValue > 10000000) return;

                setBuyPrice(value);
              }}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Price you&apos;re paying the supplier (always in GBP)
          </p>
        </div>
      </div>

      {/* Sell Price Card */}
      <div className="border-t-4 border-purple-600 bg-purple-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Sale Details (Client)</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sell Price (GBP) <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">£</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10000000"
              value={sellPrice}
              onChange={(e) => {
                const value = e.target.value;
                const numValue = parseFloat(value);

                // Allow empty string for clearing the field
                if (value === '') {
                  setSellPrice('');
                  return;
                }

                // Prevent negative numbers
                if (numValue < 0) return;

                // Prevent extremely large numbers
                if (numValue > 10000000) return;

                setSellPrice(value);
              }}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Price you&apos;re charging the client (always in GBP)
          </p>

          {/* Real-time margin preview */}
          {buyPrice && sellPrice && parseFloat(buyPrice) > 0 && parseFloat(sellPrice) > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              Gross Margin: <span className="font-semibold text-gray-900">
                £{((parseFloat(sellPrice) - parseFloat(buyPrice)) * (state.currentItem?.quantity || 1)).toFixed(2)}
              </span>
              {" "}
              <span className="text-gray-500">
                ({(((parseFloat(sellPrice) - parseFloat(buyPrice)) / parseFloat(sellPrice)) * 100).toFixed(1)}%)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Margin Preview */}
      {buyPrice && sellPrice && parseFloat(buyPrice) > 0 && parseFloat(sellPrice) > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-900 mb-2">Gross Margin Preview</p>
          <div className="text-sm text-blue-700">
            <p>
              Buy: £{parseFloat(buyPrice).toFixed(2)} × {state.currentItem?.quantity || 1} = £
              {(parseFloat(buyPrice) * (state.currentItem?.quantity || 1)).toFixed(2)}
            </p>
            <p>
              Sell: £{parseFloat(sellPrice).toFixed(2)} × {state.currentItem?.quantity || 1} = £
              {(parseFloat(sellPrice) * (state.currentItem?.quantity || 1)).toFixed(2)}
            </p>
            <p className="font-semibold mt-2 pt-2 border-t border-blue-300">
              Gross Margin: £
              {((parseFloat(sellPrice) - parseFloat(buyPrice)) * (state.currentItem?.quantity || 1)).toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
