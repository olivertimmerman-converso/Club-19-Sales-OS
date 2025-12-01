"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Success page content (wrapped in Suspense for useSearchParams)
 */
function SuccessContent() {
  const searchParams = useSearchParams();

  const invoiceId = searchParams.get("invoiceId") || "";
  const invoiceNumber = searchParams.get("invoiceNumber") || "";
  const contactName = searchParams.get("contact") || "";
  const total = searchParams.get("amount") || "0";
  const currency = searchParams.get("currency") || "GBP";
  const invoiceUrl = searchParams.get("url") || "";

  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency,
  }).format(parseFloat(total));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-12 text-center">
            {/* Large checkmark icon */}
            <div className="mx-auto w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6">
              <svg
                className="w-16 h-16 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-4xl font-bold text-white mb-2">Invoice Created Successfully!</h1>
            <p className="text-purple-100 text-lg">
              Your Xero invoice has been generated and is ready to view
            </p>
          </div>

          {/* Invoice Details */}
          <div className="px-8 py-8 space-y-6">
            {/* Invoice Number */}
            <div className="border-l-4 border-purple-600 bg-purple-50 px-6 py-4 rounded-r-lg">
              <p className="text-sm font-medium text-purple-900 mb-1">Invoice Number</p>
              <p className="text-3xl font-bold text-purple-600">{invoiceNumber}</p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Buyer */}
              <div className="bg-gray-50 px-6 py-4 rounded-lg">
                <p className="text-sm font-medium text-gray-600 mb-2">Buyer</p>
                <p className="text-xl font-semibold text-gray-900">{contactName}</p>
              </div>

              {/* Total Amount */}
              <div className="bg-gray-50 px-6 py-4 rounded-lg">
                <p className="text-sm font-medium text-gray-600 mb-2">Total Amount</p>
                <p className="text-xl font-semibold text-gray-900">{formattedAmount}</p>
              </div>
            </div>

            {/* Invoice ID (for reference) */}
            <div className="bg-gray-50 px-6 py-4 rounded-lg">
              <p className="text-sm font-medium text-gray-600 mb-2">Invoice ID</p>
              <p className="text-sm text-gray-700 font-mono">{invoiceId}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-8 pb-8 space-y-4">
            {/* Primary: View in Xero */}
            {invoiceUrl && (
              <a
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-center font-semibold py-4 px-6 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  View Invoice in Xero
                </span>
              </a>
            )}

            {/* Secondary Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Create Another Invoice */}
              <Link
                href="/trade/new"
                className="block bg-white border-2 border-purple-600 text-purple-600 text-center font-semibold py-3 px-6 rounded-lg hover:bg-purple-50 transition-all"
              >
                Create Another Invoice
              </Link>

              {/* Back to Dashboard */}
              <Link
                href="/"
                className="block bg-white border-2 border-gray-300 text-gray-700 text-center font-semibold py-3 px-6 rounded-lg hover:bg-gray-50 transition-all"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>

          {/* Footer Note */}
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              This invoice has been created in your Xero account. You can edit, send, or manage it
              directly in Xero.
            </p>
          </div>
        </div>

        {/* Additional Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg px-6 py-4">
          <div className="flex gap-3">
            <svg
              className="w-6 h-6 text-blue-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">Next Steps</p>
              <p className="text-sm text-blue-800">
                Review the invoice in Xero, add any additional details if needed, and send it to
                your client. The invoice number is automatically generated by Xero.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trade Success Page
 *
 * Displays confirmation after successful Xero invoice creation
 *
 * Query params:
 * - invoiceId: Xero invoice ID
 * - invoiceNumber: Auto-generated invoice number
 * - contact: Buyer contact name
 * - amount: Total invoice amount
 * - currency: Currency code (e.g., "GBP")
 * - url: Direct Xero invoice URL
 */
export default function TradeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading invoice details...</p>
          </div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
