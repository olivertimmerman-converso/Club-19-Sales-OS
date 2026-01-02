"use client";

import React, { useState, useEffect } from "react";
import { useTrade } from "@/contexts/TradeContext";
import { BRANDS, CATEGORIES } from "@/lib/constants";
import * as logger from '@/lib/logger';

export function StepItemDetails() {
  const { state, setCurrentItem } = useTrade();

  // Xero connection state
  const [xeroError, setXeroError] = useState<string | null>(null);
  const [showXeroSuccess, setShowXeroSuccess] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);

  // Initialize from context if available
  const [brand, setBrand] = useState(state.currentItem?.brand || "");
  const [brandOther, setBrandOther] = useState("");
  const [category, setCategory] = useState(state.currentItem?.category || "");
  const [categoryOther, setCategoryOther] = useState("");
  const [description, setDescription] = useState(state.currentItem?.description || "");
  const [quantity, setQuantity] = useState(state.currentItem?.quantity || 1);

  // Show "Other" input fields
  const showBrandOther = brand === "Other";
  const showCategoryOther = category === "Other";

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

  // Sync to context whenever values change
  useEffect(() => {
    const finalBrand = showBrandOther ? brandOther : brand;
    const finalCategory = showCategoryOther ? categoryOther : category;

    if (finalBrand && finalCategory && description && quantity > 0) {
      setCurrentItem({
        brand: finalBrand,
        category: finalCategory,
        description,
        quantity,
        buyPrice: state.currentItem?.buyPrice,
        sellPrice: state.currentItem?.sellPrice,
      });
    } else if (finalBrand || finalCategory || description) {
      // Partial data - store what we have
      setCurrentItem({
        brand: finalBrand,
        category: finalCategory,
        description,
        quantity,
        buyPrice: state.currentItem?.buyPrice,
        sellPrice: state.currentItem?.sellPrice,
      });
    }
  }, [brand, brandOther, category, categoryOther, description, quantity, showBrandOther, showCategoryOther, setCurrentItem, state.currentItem?.buyPrice, state.currentItem?.sellPrice]);

  // Handler to initiate Xero OAuth flow
  const handleConnectXero = () => {
    window.location.href = "/api/xero/oauth/authorize";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Item Details
        </h2>
        <p className="text-sm text-gray-600">
          Tell us about the item you&apos;re sourcing
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

      {/* Item Details Card */}
      <div className="border-t-4 border-blue-600 bg-blue-50 p-4 rounded-lg space-y-4">
        <h3 className="font-semibold text-gray-900">What is the item?</h3>

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
      </div>
    </div>
  );
}
