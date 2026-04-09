"use client";

import React, { useState, useEffect } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { PaymentMethod } from "@/lib/types/invoice";
import { roundCurrency, subtractCurrency, multiplyCurrency, addCurrency } from '@/lib/utils/currency';

/**
 * Step 3 — Pricing (Phase 2 reordered wizard)
 *
 * Captures: per-item buy/sell prices, payment method, optional Estimated
 * Shipping Cost, optional Entrupy fee. Suppliers + supplier invoice ref +
 * date purchased moved to Step 2 (Supplier & Item).
 */
export function StepPricing() {
  const {
    state,
    updateItem,
    setShippingCost,
    setEntrupyFee,
    setCurrentPaymentMethod,
  } = useTrade();

  // Local state for each item's prices (keyed by item ID)
  const [localPrices, setLocalPrices] = useState<Record<string, { buyPrice: string; sellPrice: string }>>({});

  // Shipping cost local state
  const [localShippingCost, setLocalShippingCost] = useState(
    state.shippingCost > 0 ? state.shippingCost.toString() : ""
  );

  // Entrupy fee local state
  const [localEntrupyFee, setLocalEntrupyFee] = useState(
    state.entrupyFee > 0 ? state.entrupyFee.toString() : ""
  );

  // Payment method local state (mirrors context)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    state.currentPaymentMethod || PaymentMethod.CARD
  );

  useEffect(() => {
    setCurrentPaymentMethod(paymentMethod);
  }, [paymentMethod, setCurrentPaymentMethod]);

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

  // Sync price to context on blur
  const handlePriceBlur = (itemId: string, field: 'buyPrice' | 'sellPrice') => {
    const prices = localPrices[itemId];
    if (!prices) return;

    const value = prices[field];
    const numValue = parseFloat(value);

    if (!isNaN(numValue) && numValue >= 0) {
      updateItem(itemId, { [field]: numValue });
    }
  };

  // Calculate totals with currency rounding to prevent floating point errors
  const totals = state.items.reduce((acc, item) => {
    const buy = roundCurrency(localPrices[item.id]?.buyPrice ? parseFloat(localPrices[item.id].buyPrice) || 0 : 0);
    const sell = roundCurrency(localPrices[item.id]?.sellPrice ? parseFloat(localPrices[item.id].sellPrice) || 0 : 0);
    const qty = item.quantity || 1;

    return {
      totalBuy: addCurrency(acc.totalBuy, multiplyCurrency(buy, qty)),
      totalSell: addCurrency(acc.totalSell, multiplyCurrency(sell, qty)),
      totalMargin: addCurrency(acc.totalMargin, multiplyCurrency(subtractCurrency(sell, buy), qty)),
    };
  }, { totalBuy: 0, totalSell: 0, totalMargin: 0 });

  const marginPercentage = totals.totalSell > 0
    ? roundCurrency((totals.totalMargin / totals.totalSell) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Pricing
        </h2>
        <p className="text-sm text-gray-600">
          Set buy and sell prices for each item
        </p>
      </div>

      {/* Pricing Table */}
      <div className="border border-gray-200 rounded-lg overflow-visible">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item
              </th>
              <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-14">
                Qty
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Buy
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Sell (product only)
              </th>
              <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Margin
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {state.items.map((item, index) => {
              const prices = localPrices[item.id] || { buyPrice: "", sellPrice: "" };
              const buyNum = roundCurrency(parseFloat(prices.buyPrice) || 0);
              const sellNum = roundCurrency(parseFloat(prices.sellPrice) || 0);
              const lineMargin = multiplyCurrency(subtractCurrency(sellNum, buyNum), item.quantity);

              return (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {item.brand} {item.category}
                    </div>
                    <div className="text-xs text-gray-600 break-words whitespace-normal max-w-[220px]">
                      {item.description}
                    </div>
                    {item.supplier?.name && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Supplier: {item.supplier.name}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-sm text-gray-900">
                    {item.quantity}
                  </td>
                  <td className="px-3 py-3">
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
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-md pl-5 pr-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
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
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-md pl-5 pr-1 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-medium ${lineMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      £{lineMargin.toFixed(0)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-100">
            <tr>
              <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                Totals
              </td>
              <td className="px-3 py-3 text-center text-sm text-gray-500">
                {state.items.reduce((sum, item) => sum + item.quantity, 0)}
              </td>
              <td className="px-3 py-3 text-sm font-medium text-gray-900">
                £{totals.totalBuy.toFixed(0)}
              </td>
              <td className="px-3 py-3 text-sm font-medium text-gray-900">
                £{totals.totalSell.toFixed(0)}
              </td>
              <td className="px-3 py-3 text-right">
                <span className={`text-sm font-semibold ${totals.totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  £{totals.totalMargin.toFixed(0)}
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
            <p className="text-blue-700">Total Sell Price (product only)</p>
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

      {/* Payment Method - Green */}
      <div className="border-t-4 border-green-600 bg-green-50 p-4 rounded-lg space-y-3">
        <h3 className="font-semibold text-gray-900">Payment Method</h3>
        <p className="text-sm text-gray-600">How will the buyer pay Club 19?</p>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              value={PaymentMethod.CARD}
              checked={paymentMethod === PaymentMethod.CARD}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Card (2.4% handling fee billed to client)</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value={PaymentMethod.BANK_TRANSFER}
              checked={paymentMethod === PaymentMethod.BANK_TRANSFER}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Bank Transfer</span>
          </label>
        </div>
      </div>

      {/* Estimated Shipping Cost (Optional) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Estimated Shipping Cost (Optional)</h3>
        <p className="text-xs text-gray-500 mb-3">
          If there&apos;s a cost to ship this item to the client, enter it here. Actual DHL/courier costs are entered after delivery.
        </p>
        <div className="relative w-full sm:w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={localShippingCost}
            onChange={(e) => setLocalShippingCost(e.target.value)}
            onBlur={() => {
              const parsed = parseFloat(localShippingCost);
              setShippingCost(!isNaN(parsed) && parsed > 0 ? parsed : 0);
            }}
            placeholder="0.00"
            className="w-full h-12 text-base border border-gray-300 rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Entrupy Fee (Optional) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Entrupy Fee (Optional)</h3>
        <p className="text-xs text-gray-500 mb-3">
          Authentication fee paid for this sale, if known. Deducted from commissionable profit.
        </p>
        <div className="relative w-full sm:w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={localEntrupyFee}
            onChange={(e) => setLocalEntrupyFee(e.target.value)}
            onBlur={() => {
              const parsed = parseFloat(localEntrupyFee);
              setEntrupyFee(!isNaN(parsed) && parsed > 0 ? parsed : 0);
            }}
            placeholder="0.00"
            className="w-full h-12 text-base border border-gray-300 rounded-lg pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}
