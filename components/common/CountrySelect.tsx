"use client";

import React, { useState, useEffect, useRef } from "react";
import { COUNTRIES, POPULAR_COUNTRIES } from "@/lib/constants";

type CountrySelectProps = {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
};

export function CountrySelect({
  label,
  value,
  onChange,
  placeholder = "Select country",
  helperText,
  required = false,
  disabled = false,
}: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter countries based on search query
  const filteredPopular = POPULAR_COUNTRIES.filter((country) =>
    country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAll = COUNTRIES.filter((country) =>
    country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Focus search input when panel opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle opening the panel
  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchQuery("");
  };

  // Handle closing the panel
  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  // Handle country selection
  const handleSelect = (country: string) => {
    onChange(country);
    handleClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  return (
    <div>
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Field Display */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white hover:border-gray-400 cursor-pointer"
        }`}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {value || placeholder}
        </span>
      </button>

      {/* Helper Text */}
      {helperText && (
        <p className="mt-1 text-xs text-gray-500">{helperText}</p>
      )}

      {/* Selection Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleClose}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[80vh] md:max-h-[600px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Select country
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Search Input */}
            <div className="px-4 py-3 border-b border-gray-200">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search countries..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Popular Countries Section */}
              {filteredPopular.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Common
                  </div>
                  <div className="space-y-1">
                    {filteredPopular.map((country) => (
                      <button
                        key={country}
                        type="button"
                        onClick={() => handleSelect(country)}
                        className={`w-full py-2.5 px-3 text-sm text-left rounded-md transition-colors ${
                          value === country
                            ? "bg-blue-50 text-blue-900 font-medium"
                            : "hover:bg-gray-50 active:bg-gray-100 text-gray-900"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{country}</span>
                          {value === country && (
                            <svg
                              className="w-4 h-4 text-blue-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Divider */}
              {filteredPopular.length > 0 && filteredAll.length > 0 && (
                <div className="border-t border-gray-200" />
              )}

              {/* All Countries Section */}
              {filteredAll.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    All countries
                  </div>
                  <div className="space-y-1">
                    {filteredAll.map((country) => (
                      <button
                        key={country}
                        type="button"
                        onClick={() => handleSelect(country)}
                        className={`w-full py-2.5 px-3 text-sm text-left rounded-md transition-colors ${
                          value === country
                            ? "bg-blue-50 text-blue-900 font-medium"
                            : "hover:bg-gray-50 active:bg-gray-100 text-gray-900"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{country}</span>
                          {value === country && (
                            <svg
                              className="w-4 h-4 text-blue-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {filteredPopular.length === 0 && filteredAll.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No countries found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
