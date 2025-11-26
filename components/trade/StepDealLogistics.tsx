"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { getInvoiceResult, InvoiceScenario } from "@/lib/constants";
import { PaymentMethod, TaxRegime } from "@/lib/types/invoice";
import { CountrySelect } from "@/components/common/CountrySelect";
import {
  computeDealStructureSuggestion,
  getAlternativeDescriptionShort,
} from "@/lib/tax-helpers";

// Random success messages - pick one when scenario is first set
const SUCCESS_MESSAGES = [
  "We'll handle the tax coding for this deal.",
  "Tax treatment confirmed for this deal.",
  "Tax settings saved for this deal.",
];

export function StepDealLogistics() {
  const {
    setTaxScenario,
    setCurrentSupplier,
    setCurrentPaymentMethod,
    setDeliveryCountry,
  } = useTrade();

  // Supplier & Purchase Info state
  const [supplierName, setSupplierName] = useState("");
  const [supplierCountry, setSupplierCountry] = useState("United Kingdom");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(
    "",
  );
  const [deliveryCountryLocal, setDeliveryCountryLocal] = useState("United Kingdom");

  // Tax wizard state (from original InvoiceFlow.tsx)
  const [itemLocation, setItemLocation] = useState<string | null>(null);
  const [clientLocation, setClientLocation] = useState<string | null>(null);
  const [purchaseType, setPurchaseType] = useState<string | null>(null);
  const [directShip, setDirectShip] = useState<string | null>(null);
  const [insuranceLanded, setInsuranceLanded] = useState<string | null>(null);

  // Touched flags to prevent auto-sync from overriding manual user selections
  const [itemLocationTouched, setItemLocationTouched] = useState(false);
  const [clientLocationTouched, setClientLocationTouched] = useState(false);

  // Success state
  const [hasShownSuccess, setHasShownSuccess] = useState(false);
  const [successMessage] = useState(
    () => SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)],
  );

  // Advanced accordion state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Estimated import/export duties (for tax-aware suggestions)
  const [estimatedDutiesGBP, setEstimatedDutiesGBP] = useState<number>(0);

  // Gross margin placeholder (will be computed from items in Step 1, placeholder for now)
  const [grossMarginGBP] = useState<number>(1000); // Default placeholder

  // Compute tax result whenever selections change
  const result = getInvoiceResult(
    itemLocation,
    clientLocation,
    purchaseType,
    directShip,
    insuranceLanded,
  );

  // Derive purchase tax regime from tax scenario
  const purchaseTaxRegime = useMemo(() => {
    if (!result) return TaxRegime.UK_VAT;

    // UK Margin Scheme (account 424)
    if (result.accountCode === "424") {
      return TaxRegime.MARGIN_SCHEME;
    }

    // UK 20% VAT (account 425)
    if (result.accountCode === "425") {
      return TaxRegime.UK_VAT;
    }

    // Export Sales (account 423) - typically zero-rated
    if (result.accountCode === "423") {
      return TaxRegime.NON_EU;
    }

    return TaxRegime.UK_VAT;
  }, [result]);

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

  // Save supplier to context
  useEffect(() => {
    if (supplierName && supplierCountry) {
      setCurrentSupplier({
        name: supplierName,
        country: supplierCountry,
        taxRegime: purchaseTaxRegime,
      });
    }
  }, [supplierName, supplierCountry, purchaseTaxRegime, setCurrentSupplier]);

  // Save payment method to context (only if selected)
  useEffect(() => {
    if (paymentMethod) {
      setCurrentPaymentMethod(paymentMethod as PaymentMethod);
    }
  }, [paymentMethod, setCurrentPaymentMethod]);

  // Save delivery country to context
  useEffect(() => {
    setDeliveryCountry(deliveryCountryLocal);
  }, [deliveryCountryLocal, setDeliveryCountry]);

  // Auto-sync Q1 and Q2 from supplier/delivery countries (unless manually touched)
  useEffect(() => {
    let shouldUpdate = false;

    // Auto-sync Q1 (itemLocation) from supplierCountry
    if (!itemLocationTouched && supplierCountry) {
      const derivedItemLocation = supplierCountry === "United Kingdom" ? "uk" : "outside";
      if (itemLocation !== derivedItemLocation) {
        setItemLocation(derivedItemLocation);
        shouldUpdate = true;
      }
    }

    // Auto-sync Q2 (clientLocation) from deliveryCountryLocal
    if (!clientLocationTouched && deliveryCountryLocal) {
      const derivedClientLocation = deliveryCountryLocal === "United Kingdom" ? "uk" : "outside";
      if (clientLocation !== derivedClientLocation) {
        setClientLocation(derivedClientLocation);
        shouldUpdate = true;
      }
    }

    // Note: We don't need to manually call setTaxScenario here because
    // the existing useEffect (lines 81-102) already watches itemLocation/clientLocation
    // and updates the tax scenario automatically
  }, [
    supplierCountry,
    deliveryCountryLocal,
    itemLocationTouched,
    clientLocationTouched,
    itemLocation,
    clientLocation,
  ]);

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

    // Special case: pure UK domestic
    const isPureUKDomestic =
      supplierCountry === "United Kingdom" &&
      deliveryCountryLocal === "United Kingdom" &&
      itemLocation === "uk" &&
      clientLocation === "uk" &&
      result.accountCode === "425"; // UK retail

    if (isPureUKDomestic) {
      return "Treated as part of the cost (not reclaimed)";
    }

    // Import then export scenario
    const isImportThenExport =
      supplierCountry !== "United Kingdom" &&
      itemLocation === "outside" &&
      directShip === "no" &&
      clientLocation === "outside" &&
      deliveryCountryLocal !== "United Kingdom";

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
  }, [result, supplierCountry, deliveryCountryLocal, itemLocation, clientLocation, directShip]);

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

    // Identify the scenario for scenario-specific notes
    const isPureUKDomestic =
      supplierCountry === "United Kingdom" &&
      deliveryCountryLocal === "United Kingdom" &&
      itemLocation === "uk" &&
      clientLocation === "uk" &&
      result.accountCode === "425"; // UK retail

    const isImportThenExport =
      supplierCountry !== "United Kingdom" &&
      itemLocation === "outside" &&
      directShip === "no" && // Item comes via Club 19
      clientLocation === "outside" &&
      deliveryCountryLocal !== "United Kingdom";

    const isNonUKToNonUKDirect =
      supplierCountry !== "United Kingdom" &&
      deliveryCountryLocal !== "United Kingdom" &&
      itemLocation === "outside" &&
      clientLocation === "outside" &&
      directShip === "yes";

    // Scenario-specific notes (max 2-3 bullets)
    if (isPureUKDomestic) {
      notes.push("This is a UK-to-UK sale; VAT on the purchase is treated as part of the cost");
    } else if (isImportThenExport) {
      notes.push("We may pay full UK VAT when the goods land in the UK under Club 19");
      notes.push("The export sale is zero-rated / VAT can be reclaimed if properly documented");
    } else if (isNonUKToNonUKDirect) {
      notes.push("Item ships directly from supplier to client; Club 19 is not the importer of record");
      if (insuranceLanded === "no") {
        notes.push("Because this is not landed delivery, the client may be charged import duties/taxes on receipt – confirm they understand this");
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
  }, [result, directShip, itemLocation, insuranceLanded, supplierCountry, deliveryCountryLocal, clientLocation]);

  // Determine if we should show shipping & logistics questions
  const shouldShowShippingQuestions =
    (itemLocation === "uk" && clientLocation && purchaseType) ||
    (itemLocation === "outside" && clientLocation);

  // Compute tax-aware deal structure suggestion
  const dealSuggestion = useMemo(() => {
    return computeDealStructureSuggestion({
      supplierCountry,
      deliveryCountry: deliveryCountryLocal,
      itemLocation: itemLocation as "uk" | "outside" | null,
      clientLocation: clientLocation as "uk" | "outside" | null,
      supplierShipsDirect: directShip === "yes",
      landedDelivery: insuranceLanded === "yes",
      estimatedImportExportGBP: estimatedDutiesGBP,
      grossMarginGBP,
    });
  }, [
    supplierCountry,
    deliveryCountryLocal,
    itemLocation,
    clientLocation,
    directShip,
    insuranceLanded,
    estimatedDutiesGBP,
    grossMarginGBP,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Deal & Logistics
        </h2>
        <p className="text-sm text-gray-600">
          Supplier details and logistics information
        </p>
      </div>

      {/* Supplier & Purchase Info */}
      <div className="border-2 border-gray-400 bg-gray-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">Supplier & Purchase Info</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supplier Name *
          </label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Bags By Appointment or Harrods"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CountrySelect
            label="Supplier Country"
            value={supplierCountry}
            onChange={setSupplierCountry}
            placeholder="Select supplier country"
            helperText="Where the supplier is based"
            required
          />

          <CountrySelect
            label="Delivery Country"
            value={deliveryCountryLocal}
            onChange={setDeliveryCountryLocal}
            placeholder="Select delivery country"
            helperText="Where the item will ultimately be delivered"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method *
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select payment method...</option>
            <option value={PaymentMethod.CARD}>Card</option>
            <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
          </select>
        </div>
      </div>

      {/* Only show subsequent questions once payment method chosen */}
      {paymentMethod && (
        <>
          {/* Q1: Where is the item? */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">1. Where is the item?</h3>
          <p className="text-xs text-gray-500 mt-1">
            Pre-filled from supplier country. Change this if the item is stored somewhere else.
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
              ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
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
              Pre-filled from delivery country. Change the delivery country above if this is wrong.
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
                ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
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
                  ? "border-blue-600 bg-blue-50 text-blue-900 font-medium"
                  : "border-gray-300 hover:border-gray-400 text-gray-700"
              }`}
            >
              No, via us
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
              Yes, direct to client
            </button>
          </div>
        </>
      )}

      {/* Q5: Landed delivery */}
      {directShip && shouldShowShippingQuestions && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <h3 className="font-semibold text-gray-900">
              {itemLocation === "uk" ? "5" : "4"}. Landed delivery?
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              &ldquo;Landed&rdquo; means duties, customs & insurance are included in the sale price.
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
            Yes
          </button>
        </div>
      )}

      {/* High-tax warning banner */}
      {result &&
        dealSuggestion.hasBetterAlternative &&
        dealSuggestion.alternativeDutiesGBP !== undefined &&
        dealSuggestion.currentDutiesGBP > 0 &&
        dealSuggestion.currentDutiesGBP - dealSuggestion.alternativeDutiesGBP >= 500 && (
          <div className="border-l-4 border-amber-500 bg-amber-50 p-4 rounded-lg animate-fade-in">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <h4 className="font-semibold text-amber-900 mb-1">
                  Higher tax exposure on this structure
                </h4>
                <p className="text-sm text-amber-800 mb-2">
                  Routing via the UK is likely to trigger UK import VAT (est. £
                  {dealSuggestion.currentDutiesGBP.toFixed(2)}).
                </p>
                <p className="text-sm text-amber-800">
                  If the client is happy with direct delivery, consider{" "}
                  <span className="font-medium">
                    {getAlternativeDescriptionShort(dealSuggestion.alternativeDescription)}
                  </span>{" "}
                  to avoid this cost.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Best for margin & lower taxes info strip */}
      {result &&
        dealSuggestion.hasBetterAlternative &&
        dealSuggestion.alternativeDescription &&
        dealSuggestion.alternativeDutiesGBP !== undefined &&
        !(dealSuggestion.currentDutiesGBP > 0 &&
          dealSuggestion.currentDutiesGBP - dealSuggestion.alternativeDutiesGBP >= 500) && (
          <div className="border border-blue-200 bg-blue-50 p-4 rounded-lg animate-fade-in">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900 mb-1">
                  Best for margin & lower taxes
                </h4>
                <p className="text-sm text-blue-800 mb-1">
                  {dealSuggestion.alternativeDescription}
                </p>
                <p className="text-xs text-blue-700">
                  Est. import/export: £{dealSuggestion.alternativeDutiesGBP.toFixed(2)} (vs £
                  {dealSuggestion.currentDutiesGBP.toFixed(2)} if structured this way).
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Summary Card */}
      {result && (
        <div className="border-t-4 border-green-600 bg-green-50 p-5 rounded-lg animate-fade-in transition-all duration-200">
          <h3 className="font-bold text-lg mb-4 text-green-900">
            Tax treatment
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
                Key notes
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
            We&apos;ll handle the tax coding automatically
          </div>

          {/* Advanced details accordion */}
          <div className="mt-4 border-t border-green-300 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-sm font-medium text-green-800 hover:text-green-900 transition-colors"
            >
              <span>Detailed settings</span>
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
        </>
      )}
    </div>
  );
}
