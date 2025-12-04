/**
 * Club 19 Sales OS - Layout Wrapper
 *
 * Wraps OS routes with sidebar navigation
 * Includes comprehensive error handling to prevent crashes
 */

import { getUserRole } from "@/lib/getUserRole";
import { type Role } from "@/lib/roleUtils";
import { Sidebar } from "./Sidebar";
import { UserButton } from "@clerk/nextjs";

interface OSLayoutProps {
  children: React.ReactNode;
}

export async function OSLayout({ children }: OSLayoutProps) {
  console.log("[OSLayout] 🏗️  Starting layout render");

  // Get user role with comprehensive error handling
  let role: Role = "shopper";
  let hasError = false;
  let errorMessage = "";

  try {
    console.log("[OSLayout] 📋 Calling getUserRole()");
    role = await getUserRole();
    console.log(`[OSLayout] ✅ Role resolved: "${role}"`);
  } catch (error) {
    hasError = true;
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[OSLayout] ❌ Failed to get user role:", error);
    console.error("[OSLayout] 🔄 Falling back to 'shopper' role");
    // role remains "shopper" as default fallback
  }

  console.log("[OSLayout] 🎨 Rendering layout with role:", role);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar role={role} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex-1">
            {/* Page-specific content can go here */}
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-4">
            {hasError ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-100 border border-red-300 rounded-md">
                <span className="text-sm font-medium text-red-800">⚠️ Auth Error</span>
              </div>
            ) : (
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{
                  elements: {
                    avatarBox: "w-10 h-10",
                  },
                }}
              />
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
