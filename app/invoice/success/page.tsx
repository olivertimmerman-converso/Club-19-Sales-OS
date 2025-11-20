import { redirect } from 'next/navigation'
import Link from 'next/link'

type SearchParams = {
  invoiceUrl?: string
  invoiceNumber?: string
  contactName?: string
  total?: string
  amountDue?: string
  taxSummary?: string
}

export default function InvoiceSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  // Redirect to error if no invoice URL
  if (!searchParams.invoiceUrl) {
    redirect('/invoice/error')
  }

  const handleViewInXero = () => {
    if (searchParams.invoiceUrl) {
      window.open(searchParams.invoiceUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="font-serif tracking-[0.3em] text-[28px] font-light leading-none mb-1">
            CLUB<span className="text-[32px] font-normal">19</span>
          </div>
          <div className="font-serif tracking-[0.45em] text-[11px] font-extralight text-gray-300">
            LONDON
          </div>
        </div>

        {/* Success Card */}
        <div className="bg-white border-2 border-club19-black shadow-2xl">
          {/* Card Header */}
          <div className="px-8 pt-8 pb-6 border-b border-club19-platinum">
            <h1 className="font-serif text-4xl font-semibold tracking-luxury uppercase text-center">
              Invoice Created
            </h1>
          </div>

          {/* Card Content */}
          <div className="px-8 py-8 space-y-4">
            {/* Invoice Details */}
            <div className="space-y-4">
              {searchParams.contactName && (
                <div className="flex justify-between items-center py-3 border-b border-club19-platinum">
                  <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                    Contact
                  </span>
                  <span className="font-medium text-club19-black text-lg">
                    {searchParams.contactName}
                  </span>
                </div>
              )}

              {searchParams.invoiceNumber && (
                <div className="flex justify-between items-center py-3 border-b border-club19-platinum">
                  <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                    Invoice Number
                  </span>
                  <span className="font-mono font-semibold text-club19-black text-lg">
                    {searchParams.invoiceNumber}
                  </span>
                </div>
              )}

              {searchParams.total && (
                <div className="flex justify-between items-center py-3 border-b border-club19-platinum">
                  <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                    Total
                  </span>
                  <span className="font-semibold text-club19-black text-lg">
                    {searchParams.total}
                  </span>
                </div>
              )}

              {searchParams.amountDue && (
                <div className="flex justify-between items-center py-3 border-b border-club19-platinum">
                  <span className="text-xs uppercase tracking-wide text-club19-charcoal font-medium">
                    Amount Due
                  </span>
                  <span className="font-semibold text-club19-black text-lg">
                    {searchParams.amountDue}
                  </span>
                </div>
              )}
            </div>

            {/* Tax Summary */}
            {searchParams.taxSummary && (
              <div className="border border-club19-platinum bg-club19-off-white p-6 mt-6">
                <h3 className="text-xs uppercase tracking-wide font-medium text-club19-black mb-3">
                  Tax Details
                </h3>
                <p className="text-sm text-club19-charcoal whitespace-pre-line">
                  {decodeURIComponent(searchParams.taxSummary)}
                </p>
              </div>
            )}
          </div>

          {/* Card Actions */}
          <div className="px-8 py-6 border-t border-club19-platinum space-y-3">
            <a
              href={searchParams.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full btn-primary text-center"
            >
              View Invoice in Xero
            </a>

            <Link href="/invoice" className="block w-full btn-outline text-center">
              Create Another Invoice
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
