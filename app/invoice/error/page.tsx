import Link from 'next/link'

export default function InvoiceErrorPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="font-serif tracking-[0.3em] text-[28px] font-light leading-none mb-1">
            CLUB<span className="text-[32px] font-normal">19</span>
          </div>
          <div className="font-serif tracking-[0.45em] text-[11px] font-extralight text-gray-300">
            LONDON
          </div>
        </div>

        {/* Error Card */}
        <div className="bg-white border-2 border-club19-black shadow-2xl">
          {/* Card Header */}
          <div className="px-8 pt-8 pb-6 border-b border-club19-platinum">
            <h1 className="font-serif text-4xl font-semibold tracking-luxury uppercase text-center">
              Invoice Error
            </h1>
          </div>

          {/* Card Content */}
          <div className="px-8 py-8">
            <div className="text-center space-y-4">
              <svg
                className="w-16 h-16 mx-auto text-club19-charcoal"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>

              <p className="text-base text-club19-black font-light leading-relaxed">
                We were unable to validate the invoice details.
              </p>

              <p className="text-sm text-club19-charcoal font-light">
                The invoice may have been created, but we could not retrieve the confirmation details from Xero. Please check your Xero account to verify.
              </p>
            </div>
          </div>

          {/* Card Actions */}
          <div className="px-8 py-6 border-t border-club19-platinum">
            <Link href="/invoice" className="block w-full btn-primary text-center">
              Return to Invoice Flow
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
