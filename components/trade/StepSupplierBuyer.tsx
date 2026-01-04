"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { fetchXeroBuyers, NormalizedContact } from "@/lib/xero";
import { PaymentMethod, TaxRegime, BuyerType } from "@/lib/types/invoice";
import { COUNTRIES, POPULAR_COUNTRIES } from "@/lib/constants";
import * as logger from '@/lib/logger';

// Xata Supplier type
interface XataSupplier {
  id: string;
  name: string;
  email: string;
}

// Helper to determine tax regime from country
function getTaxRegime(country: string): TaxRegime {
  // UK
  if (country === "United Kingdom") {
    return TaxRegime.UK_VAT;
  }

  // EU countries
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

  // Everything else is NON_EU
  return TaxRegime.NON_EU;
}

export function StepSupplierBuyer() {
  const {
    state,
    setCurrentSupplier,
    setBuyer,
    setCurrentPaymentMethod,
    setDeliveryCountry,
    setHasIntroducer
  } = useTrade();

  // === SUPPLIER STATE ===
  const [supplierName, setSupplierName] = useState(state.currentSupplier?.name || "");
  const [supplierCountry, setSupplierCountry] = useState(
    state.currentSupplier?.country || "United Kingdom"
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    state.currentPaymentMethod || PaymentMethod.CARD
  );

  // === SUPPLIER XATA SEARCH STATE ===
  const [supplierXataId, setSupplierXataId] = useState("");
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierDropdownResults, setSupplierDropdownResults] = useState<XataSupplier[]>([]);
  const [supplierSelectedIndex, setSupplierSelectedIndex] = useState(-1);
  const [isSupplierSearchActive, setIsSupplierSearchActive] = useState(false);
  const [supplierNoResults, setSupplierNoResults] = useState(false);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const supplierDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const supplierAbortController = useRef<AbortController | null>(null);

  // === BUYER STATE (Xero search) ===
  const [buyerName, setBuyerName] = useState(state.buyer?.name || "");
  const [xeroContactId, setXeroContactId] = useState(state.buyer?.xeroContactId || "");
  const [buyerType, setBuyerType] = useState<BuyerType | "">(state.buyer?.buyer_type || "");
  const [loadingBuyers, setLoadingBuyers] = useState(false);
  const [buyerDropdownResults, setBuyerDropdownResults] = useState<NormalizedContact[]>([]);
  const [buyerSelectedIndex, setBuyerSelectedIndex] = useState(-1);
  const [isBuyerSearchActive, setIsBuyerSearchActive] = useState(false);
  const buyerDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const buyerAbortController = useRef<AbortController | null>(null);

  // === SHARED XERO STATE ===
  const [xeroError, setXeroError] = useState<string | null>(null);
  const [showXeroSuccess, setShowXeroSuccess] = useState(false);

  // === DELIVERY COUNTRY STATE ===
  const [deliveryCountry, setDeliveryCountryState] = useState(
    state.deliveryCountry || "United Kingdom"
  );

  // === INTRODUCER STATE (boolean flag only) ===
  const [hasIntroducerLocal, setHasIntroducerLocal] = useState(state.hasIntroducer || false);

  // Check for Xero connection status on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const xeroConnected = searchParams.get("xero_connected");
    const xeroErrorParam = searchParams.get("xero_error");

    if (xeroConnected === "true") {
      setShowXeroSuccess(true);
      setXeroError(null);
      // Clear URL params
      window.history.replaceState({}, "", window.location.pathname);
      // Hide success message after 5 seconds
      setTimeout(() => setShowXeroSuccess(false), 5000);
    }

    if (xeroErrorParam) {
      const errorMessages: Record<string, string> = {
        oauth_failed: "Xero connection failed. Please try again.",
        config_missing: "Xero is not configured. Please contact support.",
        missing_code: "Authorization failed. Please try again.",
        invalid_state: "Security validation failed. Please try again.",
        token_exchange_failed: "Failed to get Xero access. Please try again.",
        connections_failed: "Could not retrieve Xero organization. Please try again.",
        no_organizations: "No Xero organization found. Please ensure you have access.",
      };
      setXeroError(errorMessages[xeroErrorParam] || `Xero error: ${xeroErrorParam}`);
      setShowXeroSuccess(false);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Proactively check if Xero is connected when component mounts
    const checkXeroConnection = async () => {
      try {
        const response = await fetch("/api/xero/status");
        const data = await response.json();

        if (!data.connected) {
          logger.info('TRADE_UI', 'Xero not connected, showing banner');
          setXeroError("Please connect your Xero account to search contacts");
        } else {
          logger.info('TRADE_UI', 'Xero already connected');
        }
      } catch (error) {
        logger.error('TRADE_UI', 'Failed to check Xero connection', { error: error as any });
      }
    };

    // Only check connection if we didn't just come back from OAuth
    if (!xeroConnected && !xeroErrorParam) {
      checkXeroConnection();
    }
  }, []);

  // === SUPPLIER HANDLERS ===
  // Sync supplier to context whenever supplier fields change
  useEffect(() => {
    if (supplierName && supplierCountry) {
      const taxRegime = getTaxRegime(supplierCountry);
      setCurrentSupplier({
        name: supplierName,
        country: supplierCountry,
        taxRegime: taxRegime,
        xataId: supplierXataId || undefined, // Include Xata Supplier ID if available
      });
    }
  }, [supplierName, supplierCountry, supplierXataId, setCurrentSupplier]);

  // Sync payment method to context
  useEffect(() => {
    setCurrentPaymentMethod(paymentMethod);
  }, [paymentMethod, setCurrentPaymentMethod]);

  // === DEBOUNCED SUPPLIER SEARCH ===
  // Memoized debounced search function using Xata suppliers
  const debouncedSupplierSearch = useMemo(
    () => {
      return (query: string) => {
        if (supplierDebounceTimer.current) {
          clearTimeout(supplierDebounceTimer.current);
        }

        supplierDebounceTimer.current = setTimeout(async () => {
          // Cancel previous request
          if (supplierAbortController.current) {
            supplierAbortController.current.abort();
          }

          supplierAbortController.current = new AbortController();
          setLoadingSuppliers(true);

          try {
            const response = await fetch(`/api/suppliers/search?q=${encodeURIComponent(query)}`, {
              signal: supplierAbortController.current.signal,
            });

            if (!response.ok) {
              throw new Error('Failed to search suppliers');
            }

            const results: XataSupplier[] = await response.json();
            setSupplierDropdownResults(results);

            // Show "no results" or "create new" option
            if (results.length === 0) {
              setSupplierNoResults(true);
              logger.info('TRADE_UI', 'No suppliers found for query', { query });
            } else {
              setSupplierNoResults(false);
            }
          } catch (error: any) {
            // Ignore AbortError - it just means we cancelled the request
            if (error.name === 'AbortError') {
              logger.info('TRADE_UI', 'Supplier search request cancelled');
              return;
            }

            logger.error('TRADE_UI', 'Xata supplier search failed', { error: error as any } as any);
            setSupplierDropdownResults([]);
            setSupplierNoResults(false);
          } finally {
            setLoadingSuppliers(false);
          }
        }, 300); // 300ms debounce
      };
    },
    [] // Empty deps - stable function across renders
  );

  // === SUPPLIER HANDLERS (Xata integration) ===
  const handleSupplierInput = async (value: string) => {
    setSupplierName(value);
    setSupplierSelectedIndex(-1);
    setIsSupplierSearchActive(true);
    setSupplierXataId(""); // Clear xataId when typing
    setSupplierNoResults(false); // Reset no results flag
    setShowCreateSupplier(false); // Hide create form

    // Use debounced search if query length >= 2
    if (value.length >= 2) {
      debouncedSupplierSearch(value);
    } else {
      // Clear results if query too short
      if (supplierDebounceTimer.current) {
        clearTimeout(supplierDebounceTimer.current);
      }
      setSupplierDropdownResults([]);
      setIsSupplierSearchActive(false);
      setSupplierNoResults(false);
    }
  };

  const selectSupplier = (supplier: XataSupplier) => {
    setSupplierName(supplier.name);
    setSupplierXataId(supplier.id);
    setSupplierDropdownResults([]);
    setSupplierSelectedIndex(-1);
    setIsSupplierSearchActive(false);
    setSupplierNoResults(false);
    setShowCreateSupplier(false);
  };

  // Create new supplier via API
  const handleCreateSupplier = async () => {
    if (!supplierName.trim()) return;

    try {
      setLoadingSuppliers(true);
      const response = await fetch('/api/suppliers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: supplierName.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to create supplier');
      }

      const data = await response.json();
      if (data.success && data.supplier) {
        // Select the newly created supplier
        selectSupplier(data.supplier);
      }
    } catch (error) {
      logger.error('TRADE_UI', 'Failed to create supplier', { error: error as any } as any);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // === BUYER HANDLERS (Xero integration) ===
  const handleBuyerInput = async (value: string) => {
    setBuyerName(value);
    setBuyerSelectedIndex(-1);
    setIsBuyerSearchActive(true);
    setXeroContactId(""); // Clear xeroContactId when typing

    if (buyerDebounceTimer.current) clearTimeout(buyerDebounceTimer.current);

    if (value.length >= 3) {
      buyerDebounceTimer.current = setTimeout(async () => {
        // Cancel previous request
        if (buyerAbortController.current) {
          buyerAbortController.current.abort();
        }

        buyerAbortController.current = new AbortController();
        setLoadingBuyers(true);

        try {
          const results = await fetchXeroBuyers(value);
          setBuyerDropdownResults(results);
          setXeroError(null); // Clear error on successful search
        } catch (error: any) {
          // Ignore AbortError - it just means we cancelled the request
          if (error.name === 'AbortError') {
            logger.info('TRADE_UI', 'Buyer search request cancelled');
            return;
          }

          logger.error('TRADE_UI', 'Xero buyer search failed', { error: error as any } as any);
          setBuyerDropdownResults([]);
          // Only show error if it's a connection issue
          if (error.message && error.message.includes("Xero not connected")) {
            setXeroError(error.message);
          }
        } finally {
          setLoadingBuyers(false);
        }
      }, 300);
    } else {
      setBuyerDropdownResults([]);
      setIsBuyerSearchActive(false);
    }
  };

  const selectBuyer = (contact: NormalizedContact) => {
    setBuyerName(contact.name);
    setXeroContactId(contact.contactId);
    setBuyerDropdownResults([]);
    setBuyerSelectedIndex(-1);
    setIsBuyerSearchActive(false);
  };

  // Initiate Xero OAuth connection
  const handleConnectXero = () => {
    window.location.href = "/api/xero/oauth/authorize";
  };

  // Auto-save buyer on field changes
  useEffect(() => {
    if (buyerName) {
      setBuyer({
        name: buyerName,
        xeroContactId: xeroContactId || undefined,
        buyer_type: buyerType || undefined,
      });
    }
  }, [buyerName, xeroContactId, buyerType, setBuyer]);

  // === DELIVERY COUNTRY HANDLERS ===
  useEffect(() => {
    setDeliveryCountry(deliveryCountry);
  }, [deliveryCountry, setDeliveryCountry]);

  // === INTRODUCER HANDLER (checkbox only) ===
  const handleIntroducerToggle = (checked: boolean) => {
    setHasIntroducerLocal(checked);
    setHasIntroducer(checked);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Supplier & Client
        </h2>
        <p className="text-sm text-gray-600">
          Who are you buying from and selling to?
        </p>
      </div>

      {/* Xero Success Banner */}
      {showXeroSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Xero Connected Successfully!
              </h3>
              <p className="mt-1 text-sm text-green-700">
                You can now search for Xero contacts in the buyer field below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Xero Connection Error Banner */}
      {xeroError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
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
                className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              >
                Connect Xero Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Card - Purple */}
      <div className="border-t-4 border-purple-600 bg-purple-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Supplier (Cost Details)</h3>

        {/* Supplier Name Search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supplier Name <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={supplierName}
              onChange={(e) => handleSupplierInput(e.target.value)}
              placeholder="Search suppliers..."
              className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
            {/* Loading Spinner inside input */}
            {loadingSuppliers && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  className="animate-spin h-5 w-5 text-purple-600"
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
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Search for existing supplier or create a new one
          </p>

          {/* Skeleton Loader Dropdown (shown while loading) */}
          {loadingSuppliers && isSupplierSearchActive && supplierName.length >= 2 && (
            <div className="mt-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-md">
              <p className="text-sm text-purple-700 flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-purple-600"
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
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Searching suppliers…
              </p>
            </div>
          )}

          {/* Supplier Search Dropdown Results */}
          {isSupplierSearchActive && !loadingSuppliers && supplierDropdownResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {supplierDropdownResults.map((supplier, idx) => (
                <div
                  key={supplier.id || idx}
                  onClick={() => selectSupplier(supplier)}
                  className={`px-3 py-2 cursor-pointer hover:bg-purple-100 ${
                    idx === supplierSelectedIndex ? "bg-purple-100" : ""
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {supplier.name}
                  </div>
                  {supplier.email && (
                    <div className="text-xs text-gray-500">
                      {supplier.email}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Skeleton Loader Dropdown (shown while loading) */}
          {loadingSuppliers && isSupplierSearchActive && supplierName.length >= 2 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-3 py-2 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded mb-2" style={{ width: `${60 + i * 10}%` }}></div>
                  <div className="h-3 bg-gray-100 rounded" style={{ width: `${40 + i * 5}%` }}></div>
                </div>
              ))}
            </div>
          )}

          {/* No Supplier Results - Offer to Create New */}
          {supplierNoResults && !loadingSuppliers && supplierName.trim() && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>No supplier found matching &quot;{supplierName}&quot;</strong>
              </p>
              <button
                type="button"
                onClick={handleCreateSupplier}
                className="mt-2 text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md transition-colors"
              >
                + Create &quot;{supplierName}&quot; as new supplier
              </button>
            </div>
          )}
        </div>

        {/* Show selected supplier confirmation */}
        {supplierXataId && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-xs text-green-800">
              ✓ Supplier selected: <strong>{supplierName}</strong>
            </p>
          </div>
        )}

        {/* Supplier Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Country Supplier is supplying from <span className="text-red-600">*</span>
          </label>
          <select
            value={supplierCountry}
            onChange={(e) => setSupplierCountry(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          >
            <optgroup label="Popular">
              {POPULAR_COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </optgroup>
            <optgroup label="All Countries">
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-xs text-gray-600 mt-1">
            Tax regime auto-determined from country
          </p>
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Method <span className="text-red-600">*</span>
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value={PaymentMethod.CARD}
                checked={paymentMethod === PaymentMethod.CARD}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Card</span>
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
      </div>

      {/* Buyer Card - Purple */}
      <div className="border-t-4 border-purple-600 bg-purple-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Client (Sale Details)</h3>

        {/* Buyer Name with Xero Search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => handleBuyerInput(e.target.value)}
            placeholder="Search clients..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
          <p className="text-xs text-gray-600 mt-1">
            Search for existing client or enter new name
          </p>

          {/* Xero Buyer Search Dropdown */}
          {isBuyerSearchActive && (loadingBuyers || buyerDropdownResults.length > 0) && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {loadingBuyers ? (
                <div className="flex items-center gap-2 p-3 text-gray-500">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm">Searching clients...</span>
                </div>
              ) : (
                buyerDropdownResults.map((contact, idx) => (
                  <div
                    key={contact.contactId || idx}
                    onClick={() => selectBuyer(contact)}
                    className={`px-3 py-2 cursor-pointer hover:bg-purple-100 ${
                      idx === buyerSelectedIndex ? "bg-purple-100" : ""
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {contact.name}
                    </div>
                    {contact.email && (
                      <div className="text-xs text-gray-500">
                        {contact.email}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Show selected contact confirmation */}
        {xeroContactId && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-xs text-green-800">
              ✓ Xero contact selected: <strong>{buyerName}</strong>
            </p>
          </div>
        )}

        {/* Buyer Type */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Buyer Type <span className="text-red-600">*</span>
          </label>

          <div className="flex gap-4">

            {/* B2B Card */}
            <div
              onClick={() => setBuyerType("b2b")}
              className={`cursor-pointer rounded-xl border px-4 py-3 w-1/2 text-center transition-all
                ${buyerType === "b2b"
                  ? "bg-black text-yellow-300 border-black shadow-lg"
                  : "bg-white text-gray-700 border-gray-300 hover:border-black"}
              `}
            >
              <p className="font-semibold">B2B Buyer</p>
              <p className="text-xs text-gray-500 mt-1">Company / Wholesale / Retailer</p>
            </div>

            {/* End Client Card */}
            <div
              onClick={() => setBuyerType("end_client")}
              className={`cursor-pointer rounded-xl border px-4 py-3 w-1/2 text-center transition-all
                ${buyerType === "end_client"
                  ? "bg-black text-yellow-300 border-black shadow-lg"
                  : "bg-white text-gray-700 border-gray-300 hover:border-black"}
              `}
            >
              <p className="font-semibold">End Client</p>
              <p className="text-xs text-gray-500 mt-1">Private Client / Final Buyer</p>
            </div>

          </div>
        </div>

      </div>

      {/* Delivery Country Card - Blue */}
      <div className="border-t-4 border-blue-600 bg-blue-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Delivery Details</h3>

        {/* Delivery Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client delivery country <span className="text-red-600">*</span>
          </label>
          <select
            value={deliveryCountry}
            onChange={(e) => setDeliveryCountryState(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <optgroup label="Popular">
              {POPULAR_COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </optgroup>
            <optgroup label="All Countries">
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-xs text-gray-600 mt-1">
            Where will the item be delivered? (Used for shipping cost estimation)
          </p>
        </div>
      </div>

      {/* Referral Partner Card - Orange */}
      <div className="border-t-4 border-orange-600 bg-orange-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Referral Partner</h3>
        <p className="text-sm text-gray-600">
          Check if someone introduced this client
        </p>

        {/* Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="hasIntroducer"
            checked={hasIntroducerLocal}
            onChange={(e) => handleIntroducerToggle(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <label htmlFor="hasIntroducer" className="text-sm font-medium text-gray-700">
            A referral partner is involved in this sale
          </label>
        </div>

        <p className="text-xs text-gray-600 mt-2">
          Introducer details and commission will be added in Sales OS before month-end
        </p>
      </div>
    </div>
  );
}
