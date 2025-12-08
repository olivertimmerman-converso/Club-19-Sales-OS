import Link from "next/link";

/**
 * Supplier Not Found Page
 *
 * Displayed when a supplier ID does not exist in the database
 */
export default function SupplierNotFound() {
  return (
    <div className="p-6">
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Supplier Not Found</h3>
          <p className="mt-2 text-sm text-gray-500">
            The supplier you are looking for does not exist or may have been deleted.
          </p>
          <div className="mt-6">
            <Link
              href="/suppliers"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Suppliers
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
