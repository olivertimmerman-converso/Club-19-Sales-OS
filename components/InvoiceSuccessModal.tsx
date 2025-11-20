'use client'

import { useState } from 'react'

type InvoiceSuccessModalProps = {
  show: boolean
  onClose: () => void
  invoiceNumber: string
  contactName: string
  total: number | string
  amountDue: number | string
  taxSummary: string
  invoiceUrl: string
  onCreateAnother: () => void
}

export default function InvoiceSuccessModal({
  show,
  onClose,
  invoiceNumber,
  contactName,
  total,
  amountDue,
  taxSummary,
  invoiceUrl,
  onCreateAnother,
}: InvoiceSuccessModalProps) {
  const [showTaxDetails, setShowTaxDetails] = useState(false)

  if (!show) return null

  const handleViewInXero = () => {
    window.open(invoiceUrl, '_blank', 'noopener,noreferrer')
  }

  const handleCreateAnother = () => {
    onClose()
    onCreateAnother()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-60 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white border-2 border-club19-black shadow-2xl max-w-lg w-full pointer-events-auto animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-club19-charcoal hover:text-club19-black transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
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

          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-club19-platinum">
            <h2 className="font-serif text-3xl font-semibold tracking-luxury uppercase text-center">
              Invoice Created
            </h2>
          </div>

          {/* Content */}
          <div className="px-8 py-6 space-y-4">
            {/* Invoice Details */}
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-club19-platinum">
                <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                  Contact
                </span>
                <span className="font-medium text-club19-black">
                  {contactName}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-club19-platinum">
                <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                  Invoice Number
                </span>
                <span className="font-mono font-semibold text-club19-black">
                  {invoiceNumber}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-club19-platinum">
                <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                  Total
                </span>
                <span className="font-semibold text-club19-black">
                  {total}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-club19-platinum">
                <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                  Amount Due
                </span>
                <span className="font-semibold text-club19-black">
                  {amountDue}
                </span>
              </div>
            </div>

            {/* Tax Summary Collapsible */}
            {taxSummary && (
              <div className="border border-club19-platinum">
                <button
                  onClick={() => setShowTaxDetails(!showTaxDetails)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-club19-off-white transition-colors"
                >
                  <span className="text-xs uppercase tracking-wide font-medium text-club19-black">
                    Tax Details
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform ${
                      showTaxDetails ? 'rotate-180' : ''
                    }`}
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

                {showTaxDetails && (
                  <div className="px-4 py-3 border-t border-club19-platinum bg-club19-off-white">
                    <p className="text-sm text-club19-charcoal whitespace-pre-line">
                      {taxSummary}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-8 py-6 border-t border-club19-platinum space-y-3">
            <button
              onClick={handleViewInXero}
              className="w-full btn-primary"
            >
              View Invoice in Xero
            </button>

            <button
              onClick={handleCreateAnother}
              className="w-full btn-outline"
            >
              Create Another Invoice
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
