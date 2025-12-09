/**
 * Club 19 Sales OS - Navigation (Client Component)
 *
 * Client-side navigation with Clerk UserButton
 * Handles Clerk hydration errors gracefully
 */

"use client";

import { UserButton } from "@clerk/nextjs";
import { type StaffRole } from "@/lib/permissions";
import { useState, useEffect } from "react";

interface OSNavProps {
  role: StaffRole;
}

export function OSNav({ role }: OSNavProps) {
  const [mounted, setMounted] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
      </div>
    );
  }

  // Show error state if UserButton fails
  if (hasError) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-red-100 border border-red-300 rounded-md">
        <span className="text-sm font-medium text-red-800">⚠️ Auth Error</span>
      </div>
    );
  }

  // Render UserButton with error boundary
  try {
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm text-gray-600">
          Role: <span className="font-medium text-gray-900">{role}</span>
        </div>
        <UserButton
          afterSignOutUrl="/sign-in"
          appearance={{
            elements: {
              avatarBox: "w-10 h-10",
            },
          }}
        />
      </div>
    );
  } catch (error) {
    console.error("[OSNav] ❌ UserButton error:", error);
    setHasError(true);
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-red-100 border border-red-300 rounded-md">
        <span className="text-sm font-medium text-red-800">⚠️ Auth Error</span>
      </div>
    );
  }
}
