"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { getInvoiceResult, InvoiceScenario } from "@/lib/constants";

// Random success messages - pick one when scenario is first set
const SUCCESS_MESSAGES = [
  "We'll handle the tax coding for this deal.",
  "Tax treatment confirmed for this deal.",
  "Tax settings saved for this deal.",
];

export function StepTaxScenario() {
  const { setTaxScenario } = useTrade();

  // Tax wizard state (from original InvoiceFlow.tsx)
  const [itemLocation, setItemLocation] = useState<string | null>(null);
  const [clientLocation, setClientLocation] = useState<string | null>(null);
  const [purchaseType, setPurchaseType] = useState<string | null>(null);
  const [shippingOption, setShippingOption] = useState<string | null>(null);
  const [directShip, setDirectShip] = useState<string | null>(null);
  const [insuranceLanded, setInsuranceLanded] = useState<string | null>(null);

  // Success state
  const [hasShownSuccess, setHasShownSuccess] = useState(false);
  const [successMessage] = useState(
    () => SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)],
  );

  // Advanced accordion state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Compute tax result whenever selections change
  const result = getInvoiceResult(
    itemLocation,
    clientLocation,
    purchaseType,
    shippingOption,
    directShip,
    insuranceLanded,
  );

  // Update context whenever result changes
  useEffect(() => {
    if (result) {
      setTaxScenario({
        accountCode: result.accountCode,
        taxType: result.taxType,
        taxLabel: result.taxLabel,
        lineAmountTypes:
          result.amountsAre === "Inclusive" ? "Inclusive" : "Exclusive",
        brandTheme: result.brandTheme,
        amountsAre: result.amountsAre,
        taxLiability: result.taxLiability,
        vatReclaim: result.vatReclaim,
      });

      // Mark success as shown when first valid result appears
      if (!hasShownSuccess) {
        setHasShownSuccess(true);
      }
    } else {
      setTaxScenario(null);
    }
  }, [result, setTaxScenario, hasShownSuccess]);

  // Derive sale type label
  const saleTypeLabel = useMemo(() => {
    if (!result) return "";

    // Map account code to readable sale type
    if (result.accountCode === "425") {
      return "UK retail sale – 20% VAT";
    } else if (result.accountCode === "424") {
      return "Margin scheme resale";
    } else if (result.accountCode === "423") {
      return "Export sale – zero VAT to client";
    }
    return result.taxLabel;
  }, [result]);

  // Derive VAT reclaim status
  const vatReclaimStatus = useMemo(() => {
    if (!result) return "";

    if (result.vatReclaim.toLowerCase().includes("reclaim")) {
      return "Reclaimable";
    } else if (result.vatReclaim.toLowerCase() === "none") {
      return "Not reclaimable";
    }
    return result.vatReclaim;
  }, [result]);

  // Derive delivery path using shipping answers
  const deliveryPath = useMemo(() => {
    const deliveryInUk = clientLocation === "uk";
    const supplierShipsDirect = directShip === "yes";
    const supplierProvidesLanded = insuranceLanded === "yes";

    if (itemLocation === "uk") {
      if (deliveryInUk) {
        return "Supplier → Client (UK domestic)";
      } else {
        return "Supplier → Client (UK export)";
      }
    } else if (itemLocation === "outside") {
      if (supplierShipsDirect) {
        if (deliveryInUk) {
          return supplierProvidesLanded
            ? "Supplier → Client (UK direct, landed)"
            : "Supplier → Client (UK direct, not landed)";
        } else {
          return supplierProvidesLanded
            ? "Supplier → Client (export, landed)"
            : "Supplier → Client (export, not landed)";
        }
      } else {
        // Not direct: item must come via Club 19
        if (deliveryInUk) {
          return "Supplier → Club 19 → Client (UK)";
        } else {
          return "Supplier → Club 19 → Client (export)";
        }
      }
    }
    return "To be determined";
  }, [itemLocation, clientLocation, directShip, insuranceLanded]);

  // Parse key notes from tax liability text + add shipping notes
  const keyNotes = useMemo(() => {
    if (!result) return [];

    const notes: string[] = [];

    // Add main tax liability note
    notes.push(result.taxLiability);

    // Add shipping/logistics notes
    if (
      directShip === "no" ||
      (shippingOption === "no" && itemLocation === "outside")
    ) {
      notes.push("Item needs to come via Club 19 before going to the client");
    }

    if (insuranceLanded === "no" && directShip === "yes") {
      notes.push("Full VAT may need adding to both cost and sale price");
    }

    // Add warning note if present
    if (result.note) {
      notes.push(`⚠️ ${result.note}`);
    }

    return notes;
  }, [result, directShip, shippingOption, itemLocation, insuranceLanded]);

  // Determine if we should show shipping & logistics questions
  const shouldShowShippingQuestions =
    (itemLocation === "uk" && clientLocation && purchaseType) ||
    (itemLocation === "outside" && clientLocation);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Tax Scenario
        </h2>
        <p className="text-sm text-gray-600">
          Answer these questions to determine the correct tax treatment for this
          sale.
        </p>
      </div>

      {/* Q1: Where is the item? */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            1. Where is the item right now?
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Where the product is physically located before it moves anywhere.
          </p>
        </div>
        <button
          type="button"
          className={`w-full p-3 border rounded-md text-left transition-colors ${
            itemLocation === "uk"
              ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
              : "border-gray-300 hover:border-gray-400 text-gray-700"
          }`}
          onClick={() => {
            setItemLocation("uk");
            setClientLocation(null);
            setPurchaseType(null);
            setShippingOption(null);
            setDirectShip(null);
            setInsuranceLanded(null);
          }}
        >
          Item is in the UK
        </button>
        <button
          type="button"
          className={`w-full p-3 border rounded-md text-left transition-colors ${
            itemLocation === "outside"
              ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
              : "border-gray-300 hover:border-gray-400 text-gray-700"
          }`}
          onClick={() => {
            setItemLocation("outside");
            setClientLocation(null);
            setPurchaseType(null);
            setShippingOption(null);
            setDirectShip(null);
            setInsuranceLanded(null);
          }}
        >
          Item is outside the UK
        </button>
      </div>

      {/* Q2: Where is the delivery address? */}
      {itemLocation && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <h3 className="font-semibold text-gray-900">
              2. Where is the delivery address for this order?
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              If the client can take delivery outside the UK (e.g. EU, US, HK),
              choose that country. This can change how tax is handled.
            </p>
          </div>
          <button
            type="button"
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              clientLocation === "uk"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
            onClick={() => {
              setClientLocation("uk");
              setPurchaseType(null);
              setShippingOption(null);
              setDirectShip(null);
              setInsuranceLanded(null);
            }}
          >
            Delivery address is in the UK
          </button>
          <button
            type="button"
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              clientLocation === "outside"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
            onClick={() => {
              setClientLocation("outside");
              setPurchaseType(null);
              setShippingOption(null);
              setDirectShip(null);
              setInsuranceLanded(null);
            }}
          >
            Delivery address is outside the UK
          </button>
        </div>
      )}

      {/* Q3: UK purchase type (only for UK items) */}
      {itemLocation === "uk" && clientLocation && (
        <div className="space-y-3 animate-fade-in">
          <h3 className="font-semibold text-gray-900">
            3. How is the item purchased?
          </h3>
          <button
            type="button"
            onClick={() => setPurchaseType("retail")}
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              purchaseType === "retail"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
          >
            From retail store
          </button>
          <button
            type="button"
            onClick={() => setPurchaseType("margin")}
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              purchaseType === "margin"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
          >
            On UK margin rule
          </button>
        </div>
      )}

      {/* Shipping & logistics group - show after Q1-Q3 are answered */}
      {shouldShowShippingQuestions && (
        <>
          <div className="border-t pt-6 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              Shipping & logistics
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              How the item will move between supplier, Club 19 and the client.
            </p>
          </div>

          {/* Q4: Client can arrange onward shipping */}
          <div className="space-y-3 animate-fade-in">
            <div>
              <h3 className="font-semibold text-gray-900">
                {itemLocation === "uk" ? "4" : "3"}. Can the client arrange
                onward shipping themselves?
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                For example, they have their own shipper or logistics and will
                move the item to another country themselves.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShippingOption("no");
                setDirectShip(null);
                setInsuranceLanded(null);
              }}
              className={`w-full p-3 border rounded-md text-left transition-colors ${
                shippingOption === "no"
                  ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                  : "border-gray-300 hover:border-gray-400 text-gray-700"
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => {
                setShippingOption("yes");
                setDirectShip(null);
                setInsuranceLanded(null);
              }}
              className={`w-full p-3 border rounded-md text-left transition-colors ${
                shippingOption === "yes"
                  ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                  : "border-gray-300 hover:border-gray-400 text-gray-700"
              }`}
            >
              Yes
            </button>
          </div>
        </>
      )}

      {/* Q5: Supplier direct ship */}
      {shippingOption && shouldShowShippingQuestions && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <h3 className="font-semibold text-gray-900">
              {itemLocation === "uk" ? "5" : "4"}. Can the supplier ship
              directly to the client?
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Choose &ldquo;Yes&rdquo; if the supplier can send the item
              directly to the client without passing through Club 19.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDirectShip("no");
              setInsuranceLanded(null);
            }}
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              directShip === "no"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
          >
            No, item will come via us
          </button>
          <button
            type="button"
            onClick={() => {
              setDirectShip("yes");
              setInsuranceLanded(null);
            }}
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              directShip === "yes"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
          >
            Yes, supplier ships straight to client
          </button>
        </div>
      )}

      {/* Q6: Landed & insured */}
      {directShip && shouldShowShippingQuestions && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <h3 className="font-semibold text-gray-900">
              {itemLocation === "uk" ? "6" : "5"}. Can the supplier provide
              fully insured, landed delivery?
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              &ldquo;Landed&rdquo; means duties, customs and insurance are
              included.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInsuranceLanded("no")}
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              insuranceLanded === "no"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => setInsuranceLanded("yes")}
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              insuranceLanded === "yes"
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
          >
            Yes – supplier covers duties & insurance
          </button>
        </div>
      )}

      {/* Summary Card */}
      {result && (
        <div className="border-t-4 border-green-600 bg-green-50 p-5 rounded-lg animate-fade-in transition-all duration-200">
          <h3 className="font-bold text-lg mb-4 text-green-900">
            Tax treatment for this sale
          </h3>

          <div className="space-y-3 mb-4">
            {/* Sale type */}
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-green-800">
                Sale type:
              </span>
              <span className="text-sm text-green-900 font-semibold text-right">
                {saleTypeLabel}
              </span>
            </div>

            {/* VAT on purchase */}
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-green-800">
                VAT on purchase:
              </span>
              <span className="text-sm text-green-900 font-semibold">
                {vatReclaimStatus}
              </span>
            </div>

            {/* Delivery path */}
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-green-800">
                Delivery path:
              </span>
              <span className="text-sm text-green-900 font-semibold text-right">
                {deliveryPath}
              </span>
            </div>
          </div>

          {/* Key notes */}
          {keyNotes.length > 0 && (
            <div className="mb-4 bg-white border border-green-200 rounded-md p-3">
              <div className="text-xs font-semibold uppercase text-green-700 mb-2">
                Key notes for this deal
              </div>
              <ul className="space-y-1.5">
                {keyNotes.map((note, index) => (
                  <li
                    key={index}
                    className="text-sm text-gray-800 flex items-start"
                  >
                    <span className="mr-2 text-green-600">•</span>
                    <span className="flex-1">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reassurance text */}
          <div className="text-sm text-green-700 bg-white border border-green-200 px-3 py-2 rounded-md">
            We&apos;ll handle the tax coding for this deal automatically.
          </div>

          {/* Advanced details accordion */}
          <div className="mt-4 border-t border-green-300 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-sm font-medium text-green-800 hover:text-green-900 transition-colors"
            >
              <span>Show detailed tax settings</span>
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 animate-fade-in">
                {/* Xero Brand Theme */}
                <div className="bg-white border border-green-200 p-3 rounded-md">
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                    Xero Brand Theme
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {result.brandTheme}
                  </div>
                </div>

                {/* Account Code */}
                <div className="bg-white border border-green-200 p-3 rounded-md">
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                    Xero Account Code
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {result.accountCode}
                  </div>
                </div>

                {/* Line Amount Types */}
                <div className="bg-white border border-green-200 p-3 rounded-md">
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                    Line Amount Types
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {result.amountsAre}
                  </div>
                </div>

                {/* Tax Type */}
                <div className="bg-white border border-green-200 p-3 rounded-md">
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                    Tax Type
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {result.taxLabel} ({result.taxType})
                  </div>
                </div>

                {/* VAT Reclaim */}
                <div className="bg-white border border-green-200 p-3 rounded-md">
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                    VAT Reclaim
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {result.vatReclaim}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success feedback */}
      {result && hasShownSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-700 animate-fade-in">
          <svg
            className="w-5 h-5 text-green-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">Tax scenario set.</span>
          <span className="text-green-600">{successMessage}</span>
        </div>
      )}
    </div>
  );
}
