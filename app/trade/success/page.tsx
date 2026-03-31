"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  const saleId = searchParams.get("saleId") || "";

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    if (!saleId) {
      setPdfError("PDF download not available — please use 'View in Xero' instead");
      return;
    }

    setPdfLoading(true);
    setPdfError(null);

    try {
      const response = await fetch(`/api/sales/${saleId}/pdf`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = invoiceNumber ? `Club19-${invoiceNumber}.pdf` : "Club19-Invoice.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download PDF";
      setPdfError(message);
    } finally {
      setPdfLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency,
  }).format(parseFloat(total));

  return (
    <div className="min-h-screen bg-[#F7F3FF] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Main Success Card - Clean White Premium Design */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Top Section - Logo & Success Icon */}
          <div className="px-8 pt-12 pb-8 text-center relative">
            {/* Club 19 Logo */}
            <div className="mb-8 flex justify-center">
              <Image
                src="/club19-wordmark.png"
                alt="Club 19 London"
                width={200}
                height={80}
                priority
                className="object-contain"
              />
            </div>

            {/* Success Icon - Green Check */}
            <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
              <svg
                className="w-12 h-12 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            {/* Title - Elegant Serif */}
            <h1 className="text-3xl font-serif font-bold text-black mb-3">
              Invoice Created Successfully
            </h1>

            {/* Subtitle */}
            <p className="text-gray-600 text-base">
              Your invoice has been generated in Xero and is ready to view.
            </p>
          </div>

          {/* Invoice Details Card - Premium Receipt Style */}
          <div className="px-8 pb-8">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
              {/* Invoice Number - Featured */}
              <div className="pb-4 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-500 mb-2">Invoice Number</p>
                <p className="text-2xl font-serif font-bold text-black">{invoiceNumber}</p>
              </div>

              {/* Details Grid - 2 columns on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Buyer */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Buyer</p>
                  <p className="text-base font-semibold text-black">{contactName}</p>
                </div>

                {/* Total Amount */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Total Amount</p>
                  <p className="text-base font-semibold text-black">{formattedAmount}</p>
                </div>
              </div>

              {/* Invoice ID - Full Width */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-500 mb-1">Invoice ID</p>
                <p className="text-xs text-gray-600 font-mono break-all">{invoiceId}</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-8 pb-8 space-y-3">
            {/* Primary: Download PDF */}
            {saleId && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                aria-label="Download invoice PDF"
                className="block w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-white py-3 text-center font-medium shadow-md hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <span className="flex items-center justify-center gap-2">
                  {pdfLoading ? (
                    <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  {pdfLoading ? "Downloading..." : "Download Invoice PDF"}
                </span>
              </button>
            )}

            {/* PDF error message */}
            {pdfError && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-center">
                {pdfError}
              </p>
            )}

            {/* Secondary: View in Xero */}
            {invoiceUrl && (
              <a
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View invoice in Xero (opens in new tab)"
                className="block w-full border border-purple-300 text-purple-600 rounded-xl py-3 bg-white hover:bg-purple-50 transition-colors text-center font-medium"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View Invoice in Xero
                </span>
              </a>
            )}

            {/* Tertiary: Create Another Invoice */}
            <Link
              href="/trade/new"
              aria-label="Create another invoice"
              className="block w-full border border-purple-300 text-purple-600 rounded-xl py-3 bg-white hover:bg-purple-50 transition-colors text-center font-medium"
            >
              Create Another Invoice
            </Link>

            {/* Quaternary: View in Sales OS */}
            <Link
              href="/sales"
              aria-label="View in Sales OS"
              className="block w-full border border-gray-300 text-gray-700 rounded-xl py-3 bg-white hover:bg-gray-50 transition-colors text-center font-medium"
            >
              My Sales
            </Link>
          </div>

          {/* Footer - Muted Guidance */}
          <div className="px-8 pb-6">
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              This invoice has been created in your Xero account. You can edit, send, or manage it
              directly in Xero.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trade Success Page - Club 19 London Premium Design
 *
 * Displays confirmation after successful Xero invoice creation
 * with luxury brand receipt-style UI.
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
        <div className="min-h-screen bg-[#F7F3FF] flex items-center justify-center">
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
