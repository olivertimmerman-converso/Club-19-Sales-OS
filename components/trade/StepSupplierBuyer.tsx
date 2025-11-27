"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { fetchXeroContacts, XeroContact } from "@/lib/xero";
import { PaymentMethod, TaxRegime } from "@/lib/types/invoice";
import { COUNTRIES, POPULAR_COUNTRIES } from "@/lib/constants";

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
    setDeliveryCountry
  } = useTrade();

  // === SUPPLIER STATE ===
  const [supplierName, setSupplierName] = useState(state.currentSupplier?.name || "");
  const [supplierCountry, setSupplierCountry] = useState(
    state.currentSupplier?.country || "United Kingdom"
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    state.currentPaymentMethod || PaymentMethod.CARD
  );

  // === BUYER STATE (Xero search) ===
  const [buyerName, setBuyerName] = useState(state.buyer?.name || "");
  const [xeroContactId, setXeroContactId] = useState(state.buyer?.xeroContactId || "");
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [dropdownResults, setDropdownResults] = useState<XeroContact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // === DELIVERY COUNTRY STATE ===
  const [deliveryCountry, setDeliveryCountryState] = useState(
    state.deliveryCountry || "United Kingdom"
  );

  // === SUPPLIER HANDLERS ===
  // Sync supplier to context whenever supplier fields change
  useEffect(() => {
    if (supplierName && supplierCountry) {
      const taxRegime = getTaxRegime(supplierCountry);
      setCurrentSupplier({
        name: supplierName,
        country: supplierCountry,
        taxRegime: taxRegime,
      });
    }
  }, [supplierName, supplierCountry, setCurrentSupplier]);

  // Sync payment method to context
  useEffect(() => {
    setCurrentPaymentMethod(paymentMethod);
  }, [paymentMethod, setCurrentPaymentMethod]);

  // === BUYER HANDLERS (Xero integration) ===
  const handleCustomerInput = async (value: string) => {
    setBuyerName(value);
    setSelectedIndex(-1);
    setIsSearchActive(true);
    setXeroContactId(""); // Clear xeroContactId when typing

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (value.length >= 2) {
      debounceTimer.current = setTimeout(async () => {
        setLoadingCustomers(true);
        const results = await fetchXeroContacts(value);
        setDropdownResults(results);
        setLoadingCustomers(false);
      }, 300);
    } else {
      setDropdownResults([]);
      setIsSearchActive(false);
    }
  };

  const selectCustomer = (contact: XeroContact) => {
    setBuyerName(contact.Name);
    setXeroContactId(contact.ContactID || "");
    setDropdownResults([]);
    setSelectedIndex(-1);
    setIsSearchActive(false);
  };

  // Auto-save buyer on field changes
  useEffect(() => {
    if (buyerName) {
      setBuyer({
        name: buyerName,
        xeroContactId: xeroContactId || undefined,
      });
    }
  }, [buyerName, xeroContactId, setBuyer]);

  // === DELIVERY COUNTRY HANDLERS ===
  useEffect(() => {
    setDeliveryCountry(deliveryCountry);
  }, [deliveryCountry, setDeliveryCountry]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Supplier & Buyer
        </h2>
        <p className="text-sm text-gray-600">
          Who are you buying from and selling to?
        </p>
      </div>

      {/* Supplier Card - Purple */}
      <div className="border-t-4 border-purple-600 bg-purple-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Supplier (Buy Side)</h3>

        {/* Supplier Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supplier Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="e.g. Bags By Appointment or Harrods"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
        </div>

        {/* Supplier Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supplier Country <span className="text-red-600">*</span>
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
        <h3 className="font-semibold text-gray-900">Buyer (Sell Side)</h3>

        {/* Buyer Name with Xero Search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buyer Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={buyerName}
            onChange={(e) => handleCustomerInput(e.target.value)}
            placeholder="Search Xero contacts..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
          <p className="text-xs text-gray-600 mt-1">
            Search for existing Xero contact or enter new name
          </p>

          {/* Xero Search Dropdown */}
          {isSearchActive && dropdownResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {loadingCustomers ? (
                <div className="px-3 py-2 text-sm text-gray-500">
                  Searching Xero contacts...
                </div>
              ) : (
                dropdownResults.map((contact, idx) => (
                  <div
                    key={contact.ContactID || idx}
                    onClick={() => selectCustomer(contact)}
                    className={`px-3 py-2 cursor-pointer hover:bg-purple-100 ${
                      idx === selectedIndex ? "bg-purple-100" : ""
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900">
                      {contact.Name}
                    </div>
                    {contact.EmailAddress && (
                      <div className="text-xs text-gray-500">
                        {contact.EmailAddress}
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
      </div>

      {/* Delivery Country Card - Blue */}
      <div className="border-t-4 border-blue-600 bg-blue-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Delivery Details</h3>

        {/* Delivery Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Delivery Country <span className="text-red-600">*</span>
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
    </div>
  );
}
