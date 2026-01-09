"use client";

import React, { useState, useEffect } from "react";
import { useTrade } from "@/contexts/TradeContext";

export function StepPricing() {
  const { state, updateItem } = useTrade();

  // Local state for each item's prices (keyed by item ID)
  const [localPrices, setLocalPrices] = useState<Record<string, { buyPrice: string; sellPrice: string }>>({});

  // Initialize local prices from context
  useEffect(() => {
    const initialPrices: Record<string, { buyPrice: string; sellPrice: string }> = {};
    state.items.forEach(item => {
      if (!localPrices[item.id]) {
        initialPrices[item.id] = {
          buyPrice: item.buyPrice ? item.buyPrice.toString() : "",
          sellPrice: item.sellPrice ? item.sellPrice.toString() : "",
        };
      }
    });
    if (Object.keys(initialPrices).length > 0) {
      setLocalPrices(prev => ({ ...prev, ...initialPrices }));
    }
  }, [state.items]);

  // Handle price change for an item
  const handlePriceChange = (itemId: string, field: 'buyPrice' | 'sellPrice', value: string) => {
    setLocalPrices(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  // Sync to context on blur
  const handlePriceBlur = (itemId: string, field: 'buyPrice' | 'sellPrice') => {
    const prices = localPrices[itemId];
    if (!prices) return;

    const value = prices[field];
    const numValue = parseFloat(value);

    if (!isNaN(numValue) && numValue >= 0) {
      updateItem(itemId, { [field]: numValue });
    }
  };

  // Calculate totals
  const totals = state.items.reduce((acc, item) => {
    const buy = localPrices[item.id]?.buyPrice ? parseFloat(localPrices[item.id].buyPrice) || 0 : 0;
    const sell = localPrices[item.id]?.sellPrice ? parseFloat(localPrices[item.id].sellPrice) || 0 : 0;
    const qty = item.quantity || 1;

    return {
      totalBuy: acc.totalBuy + (buy * qty),
      totalSell: acc.totalSell + (sell * qty),
      totalMargin: acc.totalMargin + ((sell - buy) * qty),
    };
  }, { totalBuy: 0, totalSell: 0, totalMargin: 0 });

  const marginPercentage = totals.totalSell > 0
    ? ((totals.totalMargin / totals.totalSell) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Pricing
        </h2>
        <p className="text-sm text-gray-600">
          Set buy and sell prices for each item (GBP only)
        </p>
      </div>

      {/* Pricing Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item
              </th>
              <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                Qty
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Buy Price
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Sell Price
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Margin
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {state.items.map((item, index) => {
              const prices = localPrices[item.id] || { buyPrice: "", sellPrice: "" };
              const buyNum = parseFloat(prices.buyPrice) || 0;
              const sellNum = parseFloat(prices.sellPrice) || 0;
              const lineMargin = (sellNum - buyNum) * item.quantity;

              return (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {item.brand} {item.category}
                    </div>
                    <div className="text-sm text-gray-500 truncate max-w-[200px]">
                      {item.description}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-900">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-gray-500 text-sm">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="10000000"
                        value={prices.buyPrice}
                        onChange={(e) => handlePriceChange(item.id, 'buyPrice', e.target.value)}
                        onBlur={() => handlePriceBlur(item.id, 'buyPrice')}
                        placeholder="0.00"
                        className="w-full border border-gray-300 rounded-md pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <span className="absolute left-2 top-2 text-gray-500 text-sm">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="10000000"
                        value={prices.sellPrice}
                        onChange={(e) => handlePriceChange(item.id, 'sellPrice', e.target.value)}
                        onBlur={() => handlePriceBlur(item.id, 'sellPrice')}
                        placeholder="0.00"
                        className="w-full border border-gray-300 rounded-md pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${lineMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      £{lineMargin.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-100">
            <tr>
              <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                Totals
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-500">
                {state.items.reduce((sum, item) => sum + item.quantity, 0)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                £{totals.totalBuy.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                £{totals.totalSell.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`text-sm font-semibold ${totals.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  £{totals.totalMargin.toFixed(2)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">Gross Margin Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-blue-700">Total Buy Price</p>
            <p className="text-lg font-semibold text-gray-900">£{totals.totalBuy.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-blue-700">Total Sell Price</p>
            <p className="text-lg font-semibold text-gray-900">£{totals.totalSell.toFixed(2)}</p>
          </div>
          <div className="col-span-2 pt-2 border-t border-blue-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-blue-700">Gross Margin</p>
                <p className={`text-xl font-bold ${totals.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  £{totals.totalMargin.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-blue-700">Margin %</p>
                <p className={`text-xl font-bold ${totals.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {marginPercentage}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="text-sm text-gray-500">
        <p>Include shipping and card fees in your sell prices. Tip: Tab between fields to move quickly.</p>
      </div>
    </div>
  );
}
