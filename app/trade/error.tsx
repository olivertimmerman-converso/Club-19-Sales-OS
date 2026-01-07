/**
 * Club 19 Sales OS - Trade (Deal Studio) Error Boundary
 *
 * Catches errors in the trade/deal creation flow
 */

"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console for debugging
    console.error("[Trade Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <ErrorDisplay
        message="Invoice creation error"
        description="An error occurred while creating your invoice. Please try again or contact support if the problem persists."
        onRetry={reset}
      />
    </div>
  );
}
