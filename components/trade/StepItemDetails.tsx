"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { BRANDS, CATEGORIES } from "@/lib/constants";
import { TradeItem, TaxRegime } from "@/lib/types/invoice";
import { toTitleCase } from "@/lib/utils/normalise";
import { NewSupplierModal } from "@/components/modals/NewSupplierModal";
import { v4 as uuidv4 } from "uuid";
import * as logger from '@/lib/logger';

const MAX_ITEMS = 10;

interface XataSupplier {
  id: string;
  name: string;
  email: string;
}

/**
 * Step 2 — Supplier & Item (Phase 2 reordered wizard)
 *
 * Captures: brand, category, description, quantity (form), then per-item
 * supplier (autocomplete + create), supplier invoice ref, and date purchased
 * (rendered inline beneath each saved item).
 *
 * Pricing moved to Step 3.
 */
export function StepItemDetails() {
  const { state, addItem, updateItem, removeItem, startEditingItem } = useTrade();

  // Xero connection state
  const [xeroError, setXeroError] = useState<string | null>(null);
  const [showXeroSuccess, setShowXeroSuccess] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);

  // Form state for the current item being edited
  const [brand, setBrand] = useState("");
  const [brandOther, setBrandOther] = useState("");
  const [category, setCategory] = useState("");
  const [categoryOther, setCategoryOther] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);

  // === SUPPLIER AUTOCOMPLETE STATE (per saved item) ===
  // Lifted from StepPricing as part of Phase 2 wizard reorder.
  const [activeSupplierSearch, setActiveSupplierSearch] = useState<string | null>(null);
  const [supplierSearchResults, setSupplierSearchResults] = useState<XataSupplier[]>([]);
  const [loadingSupplier, setLoadingSupplier] = useState(false);
  const [supplierNoResults, setSupplierNoResults] = useState(false);
  const [supplierCreateError, setSupplierCreateError] = useState<string | null>(null);
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [newSupplierForItemId, setNewSupplierForItemId] = useState<string | null>(null);
  const [supplierLocalNames, setSupplierLocalNames] = useState<Record<string, string>>({});
  const supplierDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const supplierAbortController = useRef<AbortController | null>(null);

  // Seed local supplier names from items array (handles draft restore + edits)
  useEffect(() => {
    setSupplierLocalNames((prev) => {
      const next = { ...prev };
      state.items.forEach((item) => {
        if (next[item.id] === undefined) {
          next[item.id] = item.supplier?.name || "";
        }
      });
      return next;
    });
  }, [state.items]);

  const debouncedSupplierSearch = useMemo(
    () => (query: string) => {
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
          const response = await fetch(
            `/api/suppliers/search?q=${encodeURIComponent(query)}`,
            { signal: supplierAbortController.current.signal }
          );
          if (!response.ok) throw new Error("Failed to search suppliers");
          const results: XataSupplier[] = await response.json();
          setSupplierSearchResults(results);
          setSupplierNoResults(results.length === 0);
        } catch (error: any) {
          if (error.name === "AbortError") return;
          logger.error("TRADE_UI", "Supplier search failed", { error: error as any } as any);
          setSupplierSearchResults([]);
          setSupplierNoResults(false);
        } finally {
          setLoadingSupplier(false);
        }
      }, 300);
    },
    []
  );

  const handleSupplierInput = (itemId: string, value: string) => {
    setSupplierLocalNames((prev) => ({ ...prev, [itemId]: value }));
    setActiveSupplierSearch(itemId);
    setSupplierNoResults(false);
    // Clear the linked supplier xataId when user edits
    updateItem(itemId, {
      supplier: { name: value, country: "United Kingdom", taxRegime: TaxRegime.UK_VAT },
    });
    if (value.length >= 2) {
      debouncedSupplierSearch(value);
    } else {
      setSupplierSearchResults([]);
    }
  };

  const selectSupplier = (itemId: string, supplier: XataSupplier) => {
    setSupplierLocalNames((prev) => ({ ...prev, [itemId]: supplier.name }));
    setSupplierSearchResults([]);
    setActiveSupplierSearch(null);
    setSupplierNoResults(false);
    updateItem(itemId, {
      supplier: {
        name: supplier.name,
        country: "United Kingdom",
        taxRegime: TaxRegime.UK_VAT,
        xataId: supplier.id,
      },
    });
  };

  const handleCreateSupplier = async (itemId: string) => {
    const supplierName = toTitleCase(supplierLocalNames[itemId] || "");
    if (!supplierName) return;
    try {
      setLoadingSupplier(true);
      setSupplierCreateError(null);
      const response = await fetch("/api/suppliers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: supplierName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create supplier");
      if (data.success && data.supplier) {
        selectSupplier(itemId, data.supplier);
      }
    } catch (error: any) {
      logger.error("TRADE_UI", "Failed to create supplier", { error: error as any } as any);
      setSupplierCreateError(error.message || "Failed to create supplier. Please try again.");
      setTimeout(() => setSupplierCreateError(null), 5000);
    } finally {
      setLoadingSupplier(false);
    }
  };

  const handleNewSupplierCreated = (supplier: {
    id: string;
    name: string;
    pending_approval: boolean;
  }) => {
    const itemId = newSupplierForItemId;
    if (!itemId) return;
    selectSupplier(itemId, { id: supplier.id, name: supplier.name, email: "" });
    setShowNewSupplierModal(false);
    setNewSupplierForItemId(null);
  };

  const handleSupplierBlur = (itemId: string) => {
    // Close dropdown after a short delay so click handlers fire
    setTimeout(() => {
      setActiveSupplierSearch(null);
      setSupplierSearchResults([]);
    }, 200);
  };

  // Show "Other" input fields
  const showBrandOther = brand === "Other";
  const showCategoryOther = category === "Other";

  // Get final brand/category values
  const finalBrand = showBrandOther ? brandOther : brand;
  const finalCategory = showCategoryOther ? categoryOther : category;

  // Check if form is valid
  const isFormValid = finalBrand !== "" && finalCategory !== "" && description !== "" && quantity > 0;

  // Check if we're editing an existing item
  const editingItem = state.editingItemId && state.editingItemId !== "new"
    ? state.items.find(item => item.id === state.editingItemId)
    : null;

  // Load item data when editing
  useEffect(() => {
    if (editingItem) {
      // Check if brand is in the standard list (cast to any for includes check)
      if ((BRANDS as readonly string[]).includes(editingItem.brand)) {
        setBrand(editingItem.brand);
        setBrandOther("");
      } else {
        setBrand("Other");
        setBrandOther(editingItem.brand);
      }

      // Check if category is in the standard list (cast to any for includes check)
      if ((CATEGORIES as readonly string[]).includes(editingItem.category)) {
        setCategory(editingItem.category);
        setCategoryOther("");
      } else {
        setCategory("Other");
        setCategoryOther(editingItem.category);
      }

      setDescription(editingItem.description);
      setQuantity(editingItem.quantity);
    }
  }, [editingItem]);

  // Check for Xero connection status on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const xeroConnected = searchParams.get("xero_connected");
    const xeroErrorParam = searchParams.get("xero_error");

    if (xeroConnected === "true") {
      setShowXeroSuccess(true);
      setXeroError(null);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setShowXeroSuccess(false), 5000);
      setIsCheckingConnection(false);
    }

    if (xeroErrorParam) {
      const errorMessages: Record<string, string> = {
        oauth_failed: "Xero connection failed. Please try again.",
        config_missing: "Xero is not configured. Please contact support.",
        token_exchange_failed: "Failed to exchange authorization token. Please try again.",
        connections_failed: "Failed to fetch Xero organizations. Please try again.",
        no_organizations: "No Xero organizations found. Please connect a Xero account.",
        missing_code: "Authorization code missing. Please try connecting again.",
        invalid_state: "Security verification failed. Please try again.",
        authorize_failed: "Failed to initiate Xero connection. Please try again.",
      };
      setXeroError(errorMessages[xeroErrorParam] || `Xero error: ${xeroErrorParam}`);
      setShowXeroSuccess(false);
      window.history.replaceState({}, "", window.location.pathname);
      setIsCheckingConnection(false);
    }

    // Proactively check if Xero is connected when component mounts
    const checkXeroConnection = async () => {
      try {
        const response = await fetch("/api/xero/status");
        const data = await response.json();

        if (!data.connected) {
          logger.info('TRADE_UI', 'Xero not connected, showing banner');
          setXeroError("Please connect your Xero account to start creating deals");
        } else {
          logger.info('TRADE_UI', 'Xero already connected');
        }
      } catch (error) {
        logger.error('TRADE_UI', 'Failed to check Xero connection', { error: error as any } as any);
      } finally {
        setIsCheckingConnection(false);
      }
    };

    // Only check connection if we didn't just come back from OAuth
    if (!xeroConnected && !xeroErrorParam) {
      checkXeroConnection();
    }
  }, []);

  // Handler to initiate Xero OAuth flow (opens in new tab to preserve wizard state)
  const handleConnectXero = () => {
    window.open("/api/xero/oauth/authorize", "_blank", "noopener,noreferrer");
  };

  // Reset form to empty state
  const resetForm = () => {
    setBrand("");
    setBrandOther("");
    setCategory("");
    setCategoryOther("");
    setDescription("");
    setQuantity(1);
    startEditingItem("new");
  };

  // Save item and clear form for next entry
  const handleSaveItem = () => {
    if (!isFormValid) return;

    const itemData: Partial<TradeItem> = {
      brand: finalBrand,
      category: finalCategory,
      description,
      quantity,
    };

    if (editingItem) {
      // Update existing item
      updateItem(editingItem.id, itemData);
    } else {
      // Add new item with generated ID
      // Supplier will be set later in the supplier step
      addItem({
        ...itemData,
        id: uuidv4(),
        supplier: { name: "", country: "", taxRegime: TaxRegime.UK_VAT }, // Placeholder, set in supplier step
        buyPrice: 0,
        buyCurrency: "GBP",
        sellPrice: 0,
        sellCurrency: "GBP",
        accountCode: "",
        taxType: "",
      } as TradeItem);
    }

    // Reset form for next item
    resetForm();
  };

  // Start editing an item
  const handleEditItem = (itemId: string) => {
    startEditingItem(itemId);
  };

  // Delete an item
  const handleRemoveItem = (itemId: string) => {
    removeItem(itemId);
    // If we were editing this item, reset to new item mode
    if (state.editingItemId === itemId) {
      resetForm();
    }
  };

  // Cancel editing (if editing an existing item)
  const handleCancelEdit = () => {
    resetForm();
  };

  const canAddMore = state.items.length < MAX_ITEMS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Supplier &amp; Item
        </h2>
        <p className="text-sm text-gray-600">
          Add items and their suppliers (up to {MAX_ITEMS} items)
        </p>
      </div>

      {/* Loading State */}
      {isCheckingConnection && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 animate-spin text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
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
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-800">
                Checking Xero connection...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {showXeroSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Xero Connected Successfully!
              </h3>
              <p className="mt-1 text-sm text-green-700">
                You can now create deals and sync with Xero.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner with Connect Button */}
      {xeroError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Xero Connection Required
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                {xeroError}
              </p>
              <button
                onClick={handleConnectXero}
                className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-colors"
              >
                Connect Xero Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Added Items List */}
      {state.items.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">
              Items ({state.items.length}/{MAX_ITEMS})
            </h3>
          </div>
          <div className="space-y-3">
            {state.items.map((item, index) => {
              const supplierName = supplierLocalNames[item.id] ?? item.supplier?.name ?? "";
              const isLinkedSupplier = !!item.supplier?.xataId;
              const isSearchActive = activeSupplierSearch === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-3 bg-white rounded-lg border ${
                    state.editingItemId === item.id
                      ? "border-blue-500 ring-1 ring-blue-500"
                      : "border-gray-200"
                  }`}
                >
                  {/* Item header row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {index + 1}. {item.brand} {item.category}
                      </p>
                      <p className="text-sm text-gray-500 break-words">
                        {item.description} (Qty: {item.quantity})
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditItem(item.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        disabled={state.editingItemId === item.id}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {/* Supplier autocomplete */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Supplier <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => handleSupplierInput(item.id, e.target.value)}
                      onFocus={() => setActiveSupplierSearch(item.id)}
                      onBlur={() => handleSupplierBlur(item.id)}
                      placeholder="Search suppliers..."
                      className={`w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        isLinkedSupplier ? "border-green-300 bg-green-50" : "border-gray-300"
                      }`}
                    />
                    {loadingSupplier && isSearchActive && (
                      <div className="absolute right-2 top-8">
                        <svg className="animate-spin h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    )}

                    {isSearchActive && supplierSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-auto">
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

                    {isSearchActive && supplierNoResults && !loadingSupplier && supplierName.trim() && (
                      <div className="absolute z-50 w-full mt-1 bg-blue-50 border border-blue-200 rounded-md p-2">
                        <p className="text-xs text-blue-800 mb-1">No supplier found</p>
                        <button
                          type="button"
                          onMouseDown={() => handleCreateSupplier(item.id)}
                          className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors"
                        >
                          + Create &quot;{supplierName}&quot;
                        </button>
                      </div>
                    )}

                    {!isLinkedSupplier && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewSupplierForItemId(item.id);
                          setShowNewSupplierModal(true);
                        }}
                        className="mt-1 text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors"
                      >
                        + Add New Supplier
                      </button>
                    )}
                  </div>

                  {/* Supplier invoice ref + date purchased */}
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Supplier Invoice No.
                      </label>
                      <input
                        type="text"
                        value={item.supplierInvoiceRef || ""}
                        onChange={(e) =>
                          updateItem(item.id, {
                            supplierInvoiceRef: e.target.value || undefined,
                          })
                        }
                        placeholder="e.g. INV-001 or Pending"
                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div className="flex-1 sm:max-w-[180px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Date Purchased
                      </label>
                      <input
                        type="date"
                        value={item.datePurchased || new Date().toISOString().split("T")[0]}
                        onChange={(e) =>
                          updateItem(item.id, { datePurchased: e.target.value || undefined })
                        }
                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {supplierCreateError && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2">
              <p className="text-xs text-red-800">{supplierCreateError}</p>
            </div>
          )}
        </div>
      )}

      {/* Item Form */}
      {(canAddMore || editingItem) && (
        <div className="border-t-4 border-blue-600 bg-blue-50 p-4 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900">
            {editingItem ? "Edit Item" : state.items.length === 0 ? "Add First Item" : "Add Another Item"}
          </h3>

          {/* Brand */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand <span className="text-red-600">*</span>
            </label>
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                if (e.target.value !== "Other") {
                  setBrandOther("");
                }
              }}
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

          {/* Brand Other Input */}
          {showBrandOther && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specify brand <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={brandOther}
                onChange={(e) => setBrandOther(e.target.value)}
                placeholder="Enter brand name"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category <span className="text-red-600">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                if (e.target.value !== "Other") {
                  setCategoryOther("");
                }
              }}
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

          {/* Category Other Input */}
          {showCategoryOther && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specify category <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={categoryOther}
                onChange={(e) => setCategoryOther(e.target.value)}
                placeholder="Enter category name"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-600">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g., B25 Black Togo GHW"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity <span className="text-red-600">*</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              min="1"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={handleSaveItem}
              disabled={!isFormValid}
              className="flex-1 min-w-[120px] px-4 py-2 bg-white text-blue-600 border-2 border-blue-600 rounded-md hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {editingItem ? "Update Item" : "Save Item"}
            </button>
            {editingItem && (
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Maximum items reached message */}
      {!canAddMore && !editingItem && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            Maximum of {MAX_ITEMS} items reached. Remove an item to add more.
          </p>
        </div>
      )}

      {/* Help text */}
      {state.items.length > 0 && (
        <div className="text-sm text-gray-500">
          <p>Once every item has a supplier, click &quot;Next&quot; to set prices.</p>
        </div>
      )}

      <NewSupplierModal
        open={showNewSupplierModal}
        onClose={() => {
          setShowNewSupplierModal(false);
          setNewSupplierForItemId(null);
        }}
        onCreated={handleNewSupplierCreated}
      />
    </div>
  );
}
