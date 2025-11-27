"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { getInvoiceResult } from "@/lib/constants";

// Random success messages
const SUCCESS_MESSAGES = [
  "We'll handle the tax coding for this deal.",
  "Tax treatment confirmed for this deal.",
  "Tax settings saved for this deal.",
];

export function StepLogisticsTax() {
  const {
    state,
    setTaxScenario,
    setItemLocation: setItemLocationContext,
    setClientLocation: setClientLocationContext,
    setPurchaseType: setPurchaseTypeContext,
    setDirectShip: setDirectShipContext,
    setLandedDelivery: setLandedDeliveryContext,
    setImportVAT,
  } = useTrade();

  // ============================================================================
  // LOGISTICS STATE
  // ============================================================================
  const [itemLocation, setItemLocation] = useState<string | null>(
    state.itemLocation
  );
  const [clientLocation, setClientLocation] = useState<string | null>(
    state.clientLocation
  );
  const [purchaseType, setPurchaseType] = useState<string | null>(
    state.purchaseType
  );
  const [directShip, setDirectShip] = useState<string | null>(state.directShip);
  const [insuranceLanded, setInsuranceLanded] = useState<string | null>(
    state.landedDelivery
  );

  // Touched flags to prevent auto-sync from overriding manual user selections
  const [itemLocationTouched, setItemLocationTouched] = useState(false);
  const [clientLocationTouched, setClientLocationTouched] = useState(false);

  // ============================================================================
  // UI STATE
  // ============================================================================
  const [hasShownSuccess, setHasShownSuccess] = useState(false);
  const [successMessage] = useState(
    () => SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)]
  );

  // ============================================================================
  // AUTO-PREFILL FROM SUPPLIER & BUYER (Step 2)
  // ============================================================================

  // Auto-sync Q1 (itemLocation) from supplier country
  useEffect(() => {
    if (!itemLocationTouched && state.currentSupplier?.country) {
      const derivedItemLocation =
        state.currentSupplier.country === "United Kingdom" ? "uk" : "outside";
      if (itemLocation !== derivedItemLocation) {
        setItemLocation(derivedItemLocation);
      }
    }
  }, [state.currentSupplier?.country, itemLocationTouched, itemLocation]);

  // Auto-sync Q2 (clientLocation) from delivery country
  useEffect(() => {
    if (!clientLocationTouched && state.deliveryCountry) {
      const derivedClientLocation =
        state.deliveryCountry === "United Kingdom" ? "uk" : "outside";
      if (clientLocation !== derivedClientLocation) {
        setClientLocation(derivedClientLocation);
      }
    }
  }, [state.deliveryCountry, clientLocationTouched, clientLocation]);

  // ============================================================================
  // TAX CALCULATION
  // ============================================================================

  // Compute tax result whenever selections change
  const result = getInvoiceResult(
    itemLocation,
    clientLocation,
    purchaseType,
    directShip,
    insuranceLanded
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

  // Calculate import VAT (20% of buy price when item enters UK)
  useEffect(() => {
    // Import VAT applies when:
    // - Item is outside UK
    // - Client is in UK
    // - Item physically enters UK (directShip=no OR insuranceLanded=no)
    if (
      itemLocation === "outside" &&
      clientLocation === "uk" &&
      state.currentItem?.buyPrice
    ) {
      const itemEntersUK =
        directShip === "no" ||
        (directShip === "yes" && insuranceLanded === "no");

      if (itemEntersUK) {
        const importVAT = state.currentItem.buyPrice * 0.2;
        setImportVAT(importVAT);
      } else {
        setImportVAT(null);
      }
    } else {
      setImportVAT(null);
    }
  }, [
    itemLocation,
    clientLocation,
    directShip,
    insuranceLanded,
    state.currentItem?.buyPrice,
    setImportVAT,
  ]);

  // Clear insuranceLanded when UK→UK (domestic trade doesn't need landed delivery)
  useEffect(() => {
    const isUKToUK =
      state.currentSupplier?.country === "United Kingdom" &&
      state.deliveryCountry === "United Kingdom";
    if (isUKToUK && insuranceLanded !== null) {
      setInsuranceLanded(null);
    }
  }, [state.currentSupplier?.country, state.deliveryCountry, insuranceLanded]);

  // Sync logistics data to context
  useEffect(() => {
    setItemLocationContext(itemLocation);
  }, [itemLocation, setItemLocationContext]);

  useEffect(() => {
    setClientLocationContext(clientLocation);
  }, [clientLocation, setClientLocationContext]);

  useEffect(() => {
    setPurchaseTypeContext(purchaseType);
  }, [purchaseType, setPurchaseTypeContext]);

  useEffect(() => {
    setDirectShipContext(directShip);
  }, [directShip, setDirectShipContext]);

  useEffect(() => {
    setLandedDeliveryContext(insuranceLanded);
  }, [insuranceLanded, setLandedDeliveryContext]);

  // ============================================================================
  // DISPLAY HELPERS
  // ============================================================================

  // Derive sale type label
  const saleTypeLabel = useMemo(() => {
    if (!result) return "";

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

    // Special case: pure UK domestic
    const isPureUKDomestic =
      state.currentSupplier?.country === "United Kingdom" &&
      state.deliveryCountry === "United Kingdom" &&
      itemLocation === "uk" &&
      clientLocation === "uk" &&
      result.accountCode === "425"; // UK retail

    if (isPureUKDomestic) {
      return "Treated as part of the cost (not reclaimed)";
    }

    // Import then export scenario
    const isImportThenExport =
      state.currentSupplier?.country !== "United Kingdom" &&
      itemLocation === "outside" &&
      directShip === "no" &&
      clientLocation === "outside" &&
      state.deliveryCountry !== "United Kingdom";

    if (isImportThenExport) {
      return "Full UK import VAT may apply, but is reclaimed when the item is exported (subject to correct documentation)";
    }

    // Default mapping
    if (result.vatReclaim.toLowerCase().includes("reclaim")) {
      return "Reclaimable";
    } else if (result.vatReclaim.toLowerCase() === "none") {
      return "Not reclaimable";
    }
    return result.vatReclaim;
  }, [
    result,
    state.currentSupplier?.country,
    state.deliveryCountry,
    itemLocation,
    clientLocation,
    directShip,
  ]);

  // Parse key notes from tax liability text + add shipping notes
  const keyNotes = useMemo(() => {
    if (!result) return [];

    const notes: string[] = [];

    // Identify the scenario for scenario-specific notes
    const isPureUKDomestic =
      state.currentSupplier?.country === "United Kingdom" &&
      state.deliveryCountry === "United Kingdom" &&
      itemLocation === "uk" &&
      clientLocation === "uk" &&
      result.accountCode === "425"; // UK retail

    const isImportThenExport =
      state.currentSupplier?.country !== "United Kingdom" &&
      itemLocation === "outside" &&
      directShip === "no" && // Item comes via Club 19
      clientLocation === "outside" &&
      state.deliveryCountry !== "United Kingdom";

    const isNonUKToNonUKDirect =
      state.currentSupplier?.country !== "United Kingdom" &&
      state.deliveryCountry !== "United Kingdom" &&
      itemLocation === "outside" &&
      clientLocation === "outside" &&
      directShip === "yes";

    // Scenario-specific notes (max 2-3 bullets)
    if (isPureUKDomestic) {
      notes.push(
        "This is a UK-to-UK sale; VAT on the purchase is treated as part of the cost"
      );
    } else if (isImportThenExport) {
      notes.push(
        "We may pay full UK VAT when the goods land in the UK under Club 19"
      );
      notes.push(
        "The export sale is zero-rated / VAT can be reclaimed if properly documented"
      );
    } else if (isNonUKToNonUKDirect) {
      notes.push(
        "Item ships directly from supplier to client; Club 19 is not the importer of record"
      );
      if (insuranceLanded === "no") {
        notes.push(
          "Because this is not landed delivery, the client may be charged import duties/taxes on receipt – confirm they understand this"
        );
      }
    } else {
      // Default: use original tax liability note
      notes.push(result.taxLiability);

      // Add shipping/logistics notes for other cases
      if (directShip === "no" && itemLocation === "outside") {
        notes.push("Item needs to come via Club 19 before going to the client");
      }
    }

    // Add warning note if present (from result)
    if (result.note) {
      notes.push(`⚠️ ${result.note}`);
    }

    return notes;
  }, [
    result,
    directShip,
    itemLocation,
    insuranceLanded,
    state.currentSupplier?.country,
    state.deliveryCountry,
    clientLocation,
  ]);

  // Determine if we should show shipping & logistics questions
  const shouldShowShippingQuestions =
    (itemLocation === "uk" && clientLocation && purchaseType) ||
    (itemLocation === "outside" && clientLocation);

  // Hide "Landed Delivery" question for UK→UK
  const isUKToUK =
    state.currentSupplier?.country === "United Kingdom" &&
    state.deliveryCountry === "United Kingdom";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Logistics & Tax
        </h2>
        <p className="text-sm text-gray-600">
          Answer a few questions to determine the correct tax treatment
        </p>
      </div>

      {/* Show current supplier/buyer context for reference */}
      {(state.currentSupplier || state.buyer) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-900 mb-2">
            Deal Summary
          </p>
          <div className="text-sm text-gray-700 space-y-1">
            {state.currentSupplier && (
              <p>
                <strong>Supplier:</strong> {state.currentSupplier.name} (
                {state.currentSupplier.country})
              </p>
            )}
            {state.buyer && (
              <p>
                <strong>Buyer:</strong> {state.buyer.name}
              </p>
            )}
            {state.deliveryCountry && (
              <p>
                <strong>Delivery:</strong> {state.deliveryCountry}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          TAX & LOGISTICS QUESTIONS
          ======================================================================== */}
      {/* Q1: Where is the item? */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">1. Where is the item?</h3>
          <p className="text-xs text-gray-500 mt-1">
            Pre-filled from supplier country. Change this if the item is stored
            somewhere else.
          </p>
        </div>
        <button
          type="button"
          className={`w-full p-3 border rounded-md text-left transition-colors ${
            itemLocation === "uk"
              ? "border-green-600 bg-green-50 text-green-900 font-medium"
              : "border-gray-300 hover:border-gray-400 text-gray-700"
          }`}
          onClick={() => {
            setItemLocation("uk");
            setItemLocationTouched(true);
            setClientLocation(null);
            setPurchaseType(null);
            setDirectShip(null);
            setInsuranceLanded(null);
          }}
        >
          In the UK
        </button>
        <button
          type="button"
          className={`w-full p-3 border rounded-md text-left transition-colors ${
            itemLocation === "outside"
              ? "border-green-600 bg-green-50 text-green-900 font-medium"
              : "border-gray-300 hover:border-gray-400 text-gray-700"
          }`}
          onClick={() => {
            setItemLocation("outside");
            setItemLocationTouched(true);
            setClientLocation(null);
            setPurchaseType(null);
            setDirectShip(null);
            setInsuranceLanded(null);
          }}
        >
          Outside UK
        </button>
      </div>

      {/* Q2: Where is the delivery address? */}
      {itemLocation && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <h3 className="font-semibold text-gray-900">
              2. Delivery address?
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Pre-filled from delivery country set in Step 2.
            </p>
          </div>
          <button
            type="button"
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              clientLocation === "uk"
                ? "border-green-600 bg-green-50 text-green-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
            onClick={() => {
              setClientLocation("uk");
              setClientLocationTouched(true);
              setPurchaseType(null);
              setDirectShip(null);
              setInsuranceLanded(null);
            }}
          >
            UK delivery
          </button>
          <button
            type="button"
            className={`w-full p-3 border rounded-md text-left transition-colors ${
              clientLocation === "outside"
                ? "border-green-600 bg-green-50 text-green-900 font-medium"
                : "border-gray-300 hover:border-gray-400 text-gray-700"
            }`}
            onClick={() => {
              setClientLocation("outside");
              setClientLocationTouched(true);
              setPurchaseType(null);
              setDirectShip(null);
              setInsuranceLanded(null);
            }}
          >
            Outside UK
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
                ? "border-green-600 bg-green-50 text-green-900 font-medium"
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
                ? "border-green-600 bg-green-50 text-green-900 font-medium"
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
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Shipping & logistics
            </h3>
          </div>

          {/* Q4: Supplier direct ship */}
          <div className="space-y-3 animate-fade-in">
            <div>
              <h3 className="font-semibold text-gray-900">
                {itemLocation === "uk" ? "4" : "3"}. Supplier ships direct?
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setDirectShip("no");
                setInsuranceLanded(null);
              }}
              className={`w-full p-3 border rounded-md text-left transition-colors ${
                directShip === "no"
                  ? "border-green-600 bg-green-50 text-green-900 font-medium"
                  : "border-gray-300 hover:border-gray-400 text-gray-700"
              }`}
            >
              No – item comes via Club 19
            </button>
            <button
              type="button"
              onClick={() => setDirectShip("yes")}
              className={`w-full p-3 border rounded-md text-left transition-colors ${
                directShip === "yes"
                  ? "border-green-600 bg-green-50 text-green-900 font-medium"
                  : "border-gray-300 hover:border-gray-400 text-gray-700"
              }`}
            >
              Yes – supplier ships directly to client
            </button>
          </div>

          {/* Q5: Landed delivery (only if direct ship AND not UK→UK) */}
          {directShip === "yes" && !isUKToUK && (
            <div className="space-y-3 animate-fade-in">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {itemLocation === "uk" ? "5" : "4"}. Is this landed delivery?
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Landed delivery = supplier handles all import duties and taxes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInsuranceLanded("yes")}
                className={`w-full p-3 border rounded-md text-left transition-colors ${
                  insuranceLanded === "yes"
                    ? "border-green-600 bg-green-50 text-green-900 font-medium"
                    : "border-gray-300 hover:border-gray-400 text-gray-700"
                }`}
              >
                Yes – landed delivery
              </button>
              <button
                type="button"
                onClick={() => setInsuranceLanded("no")}
                className={`w-full p-3 border rounded-md text-left transition-colors ${
                  insuranceLanded === "no"
                    ? "border-green-600 bg-green-50 text-green-900 font-medium"
                    : "border-gray-300 hover:border-gray-400 text-gray-700"
                }`}
              >
                No – not landed
              </button>
            </div>
          )}
        </>
      )}

      {/* ========================================================================
          TAX RESULT DISPLAY
          ======================================================================== */}
      {result && hasShownSuccess && (
        <div className="bg-green-50 border-2 border-green-600 rounded-lg p-5 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-green-900">{successMessage}</h3>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700">Sale type:</span>
              <span className="font-medium text-gray-900">{saleTypeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">VAT reclaim:</span>
              <span className="font-medium text-gray-900">
                {vatReclaimStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Xero account:</span>
              <span className="font-medium text-gray-900">
                {result.accountCode}
              </span>
            </div>
          </div>

          {keyNotes.length > 0 && (
            <div className="border-t border-green-300 pt-3 mt-3">
              <p className="text-xs font-medium text-green-900 mb-2">
                Key notes:
              </p>
              <ul className="text-xs text-green-800 space-y-1">
                {keyNotes.map((note, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================
          IMPORT VAT PREVIEW
          ======================================================================== */}
      {state.importVAT !== null && state.importVAT > 0 && (
        <div className="bg-amber-50 border-2 border-amber-600 rounded-lg p-5 space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-amber-900">
              Estimated Import VAT (Non-Reclaimable)
            </h3>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-amber-800">Import VAT cost:</span>
              <span className="text-2xl font-bold text-amber-900">
                £{state.importVAT.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-amber-800">
              This is added to internal economics as a business cost (20% of buy price).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
