"use client";

import React, { useState, useRef } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { fetchXeroContacts, XeroContact } from "@/lib/xero";

export function StepBuyer() {
  const { state, setBuyer, setDueDate, setNotes } = useTrade();

  // Form state
  const [buyerName, setBuyerName] = useState(state.buyer?.name || "");
  const [xeroContactId, setXeroContactId] = useState(
    state.buyer?.xeroContactId || "",
  );

  // Customer search state
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [dropdownResults, setDropdownResults] = useState<XeroContact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Handle customer search input
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

  // Select customer from dropdown
  const selectCustomer = (contact: XeroContact) => {
    setBuyerName(contact.Name);
    setXeroContactId(contact.ContactID || "");
    setDropdownResults([]);
    setSelectedIndex(-1);
    setIsSearchActive(false);
  };

  // Auto-save on field changes
  React.useEffect(() => {
    if (buyerName) {
      setBuyer({
        name: buyerName,
        xeroContactId: xeroContactId || undefined,
      });
    }
  }, [buyerName, xeroContactId, setBuyer]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Buyer</h2>
        <p className="text-sm text-gray-600">
          Enter buyer details or search for an existing Xero contact.
        </p>
      </div>

      <div className="space-y-4">
        {/* Buyer Name (with Xero search) */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buyer name *
          </label>
          <div className="relative">
            <input
              type="text"
              value={buyerName}
              onChange={(e) => handleCustomerInput(e.target.value)}
              onKeyDown={(e) => {
                if (!dropdownResults.length) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIndex((i) =>
                    i < dropdownResults.length - 1 ? i + 1 : i,
                  );
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
                }
                if (e.key === "Enter" && selectedIndex >= 0) {
                  e.preventDefault();
                  selectCustomer(dropdownResults[selectedIndex]);
                }
                if (e.key === "Escape") {
                  setDropdownResults([]);
                  setIsSearchActive(false);
                }
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search Xero contacts or enter name"
              required
            />
            {loadingCustomers && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {dropdownResults.length > 0 && (
              <ul className="absolute z-10 mt-1 bg-white border-2 border-gray-300 rounded-lg max-h-48 overflow-auto w-full shadow-lg">
                {dropdownResults.map((c, i) => (
                  <li
                    key={i}
                    className={`p-3 cursor-pointer ${
                      selectedIndex === i
                        ? "bg-blue-600 text-white"
                        : "hover:bg-gray-100 text-gray-900"
                    }`}
                    onClick={() => selectCustomer(c)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    {c.Name}
                    {c.EmailAddress && (
                      <div className="text-xs opacity-75">{c.EmailAddress}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Type at least 2 characters to search Xero contacts.
          </div>
          {xeroContactId && (
            <div className="text-xs text-green-600 mt-1">
              ✓ Linked to Xero contact: {xeroContactId}
            </div>
          )}
        </div>

        {/* Invoice Due Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Invoice due date *
          </label>
          <input
            type="date"
            value={state.dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {buyerName && state.dueDate && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-md">
          <div className="text-sm text-green-800">
            ✓ Buyer details captured. Click <strong>Next</strong> to review the
            deal before creating the invoice.
          </div>
        </div>
      )}
    </div>
  );
}
