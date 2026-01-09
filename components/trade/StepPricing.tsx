"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { TaxRegime } from "@/lib/types/invoice";
import * as logger from '@/lib/logger';

// Xata Supplier type
interface XataSupplier {
  id: string;
  name: string;
  email: string;
}

// Helper to determine tax regime from country
function getTaxRegime(country: string): TaxRegime {
  if (country === "United Kingdom") {
    return TaxRegime.UK_VAT;
  }
  const EU_COUNTRIES = [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
    "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta",
    "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia",
    "Spain", "Sweden"
  ];
  if (EU_COUNTRIES.includes(country)) {
    return TaxRegime.EU_VAT;
  }
  return TaxRegime.NON_EU;
}

export function StepPricing() {
  const { state, updateItem, setCurrentSupplier } = useTrade();

  // Local state for each item's prices and suppliers (keyed by item ID)
  const [localPrices, setLocalPrices] = useState<Record<string, { buyPrice: string; sellPrice: string }>>({});
  const [localSuppliers, setLocalSuppliers] = useState<Record<string, { name: string; xataId: string }>>({});

  // Supplier search state (per item)
  const [activeSupplierSearch, setActiveSupplierSearch] = useState<string | null>(null);
  const [supplierSearchResults, setSupplierSearchResults] = useState<XataSupplier[]>([]);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [supplierNoResults, setSupplierNoResults] = useState(false);
  const supplierDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const supplierAbortController = useRef<AbortController | null>(null);

  // Initialize local prices and suppliers from context
  useEffect(() => {
    const initialPrices: Record<string, { buyPrice: string; sellPrice: string }> = {};
    const initialSuppliers: Record<string, { name: string; xataId: string }> = {};

    state.items.forEach(item => {
      if (!localPrices[item.id]) {
        initialPrices[item.id] = {
          buyPrice: item.buyPrice ? item.buyPrice.toString() : "",
          sellPrice: item.sellPrice ? item.sellPrice.toString() : "",
        };
      }
      if (!localSuppliers[item.id]) {
        initialSuppliers[item.id] = {
          name: item.supplier?.name || "",
          xataId: item.supplier?.xataId || "",
        };
      }
    });

    if (Object.keys(initialPrices).length > 0) {
      setLocalPrices(prev => ({ ...prev, ...initialPrices }));
    }
    if (Object.keys(initialSuppliers).length > 0) {
      setLocalSuppliers(prev => ({ ...prev, ...initialSuppliers }));
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

  // Debounced supplier search
  const debouncedSupplierSearch = useMemo(
    () => {
      return (query: string, itemId: string) => {
        if (supplierDebounceTimer.current) {
          clearTimeout(supplierDebounceTimer.current);
        }

        supplierDebounceTimer.current = setTimeout(async () => {
          if (supplierAbortController.current) {
            supplierAbortController.current.abort();
          }

          supplierAbortController.current = new AbortController();
          setLoadingSupplier(true);

          try {
            const response = await fetch(`/api/suppliers/search?q=${encodeURIComponent(query)}`, {
              signal: supplierAbortController.current.signal,
            });

            if (!response.ok) {
              throw new Error('Failed to search suppliers');
            }

            const results: XataSupplier[] = await response.json();
            setSupplierSearchResults(results);
            setSupplierNoResults(results.length === 0);
          } catch (error: any) {
            if (error.name === 'AbortError') {
              return;
            }
            logger.error('TRADE_UI', 'Supplier search failed', { error: error as any } as any);
            setSupplierSearchResults([]);
            setSupplierNoResults(false);
          } finally {
            setLoadingSupplier(false);
          }
        }, 300);
      };
    },
    []
  );

  // Handle supplier input change
  const handleSupplierInput = (itemId: string, value: string) => {
    setLocalSuppliers(prev => ({
      ...prev,
      [itemId]: { name: value, xataId: "" },
    }));
    setActiveSupplierSearch(itemId);
    setSupplierNoResults(false);

    if (value.length >= 2) {
      debouncedSupplierSearch(value, itemId);
    } else {
      setSupplierSearchResults([]);
    }
  };

  // Select a supplier from search results
  const selectSupplier = (itemId: string, supplier: XataSupplier) => {
    setLocalSuppliers(prev => ({
      ...prev,
      [itemId]: { name: supplier.name, xataId: supplier.id },
    }));
    setSupplierSearchResults([]);
    setActiveSupplierSearch(null);
    setSupplierNoResults(false);

    // Update item in context with supplier info
    updateItem(itemId, {
      supplier: {
        name: supplier.name,
        country: "United Kingdom", // Default, can be changed
        taxRegime: TaxRegime.UK_VAT,
        xataId: supplier.id,
      },
    });

    // Also update the global currentSupplier for backwards compatibility
    // Use the first item's supplier as the "main" supplier
    if (state.items.length > 0 && state.items[0].id === itemId) {
      setCurrentSupplier({
        name: supplier.name,
        country: "United Kingdom",
        taxRegime: TaxRegime.UK_VAT,
        xataId: supplier.id,
      });
    }
  };

  // Create new supplier
  const handleCreateSupplier = async (itemId: string) => {
    const supplierName = localSuppliers[itemId]?.name?.trim();
    if (!supplierName) return;

    try {
      setLoadingSupplier(true);
      const response = await fetch('/api/suppliers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: supplierName }),
      });

      if (!response.ok) {
        throw new Error('Failed to create supplier');
      }

      const data = await response.json();
      if (data.success && data.supplier) {
        selectSupplier(itemId, data.supplier);
      }
    } catch (error) {
      logger.error('TRADE_UI', 'Failed to create supplier', { error: error as any } as any);
    } finally {
      setLoadingSupplier(false);
    }
  };

  // Sync supplier to context on blur (for manually typed suppliers)
  const handleSupplierBlur = (itemId: string) => {
    const supplier = localSuppliers[itemId];
    if (!supplier?.name) return;

    // Only update if not already linked via xataId
    if (!supplier.xataId && supplier.name.trim()) {
      updateItem(itemId, {
        supplier: {
          name: supplier.name.trim(),
          country: "United Kingdom",
          taxRegime: TaxRegime.UK_VAT,
        },
      });
    }

    // Close dropdown
    setTimeout(() => {
      setActiveSupplierSearch(null);
      setSupplierSearchResults([]);
    }, 200);
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
          Pricing & Suppliers
        </h2>
        <p className="text-sm text-gray-600">
          Set buy/sell prices and supplier for each item
        </p>
      </div>

      {/* Pricing Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                Supplier
              </th>
              <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-14">
                Qty
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Buy
              </th>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Sell
              </th>
              <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Margin
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {state.items.map((item, index) => {
              const prices = localPrices[item.id] || { buyPrice: "", sellPrice: "" };
              const supplier = localSuppliers[item.id] || { name: "", xataId: "" };
              const buyNum = parseFloat(prices.buyPrice) || 0;
              const sellNum = parseFloat(prices.sellPrice) || 0;
              const lineMargin = (sellNum - buyNum) * item.quantity;
              const isSearchActive = activeSupplierSearch === item.id;

              return (
                <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {item.brand} {item.category}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[150px]">
                      {item.description}
                    </div>
                  </td>
                  <td className="px-3 py-3 relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={supplier.name}
                        onChange={(e) => handleSupplierInput(item.id, e.target.value)}
                        onBlur={() => handleSupplierBlur(item.id)}
                        onFocus={() => setActiveSupplierSearch(item.id)}
                        placeholder="Search..."
                        className={`w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          supplier.xataId ? 'border-green-300 bg-green-50' : 'border-gray-300'
                        }`}
                      />
                      {loadingSupplier && isSearchActive && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <svg className="animate-spin h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Supplier dropdown */}
                    {isSearchActive && supplierSearchResults.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-auto">
                        {supplierSearchResults.map((s, idx) => (
                          <div
                            key={s.id || idx}
                            onMouseDown={() => selectSupplier(item.id, s)}
                            className="px-3 py-2 cursor-pointer hover:bg-purple-100 text-sm"
                          >
                            <div className="font-medium text-gray-900">{s.name}</div>
                            {s.email && <div className="text-xs text-gray-500">{s.email}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No results - offer to create */}
                    {isSearchActive && supplierNoResults && !loadingSupplier && supplier.name.trim() && (
                      <div className="absolute z-20 w-full mt-1 bg-blue-50 border border-blue-200 rounded-md p-2">
                        <p className="text-xs text-blue-800 mb-1">No supplier found</p>
                        <button
                          type="button"
                          onMouseDown={() => handleCreateSupplier(item.id)}
                          className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors"
                        >
                          + Create &quot;{supplier.name}&quot;
                        </button>
                      </div>
                    )}

                    {/* Show checkmark if supplier is linked */}
                    {supplier.xataId && (
                      <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
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
              <td className="px-3 py-3"></td>
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
        <p>Search and select suppliers for each item. Tab between fields to move quickly.</p>
      </div>
    </div>
  );
}
