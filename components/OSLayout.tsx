/**
 * Club 19 Sales OS - Layout Wrapper
 *
 * Wraps OS routes with sidebar navigation
 */

import { getUserRole } from "@/lib/getUserRole";
import { type Role } from "@/lib/roleUtils";
import { Sidebar } from "./Sidebar";
import { UserButton } from "@clerk/nextjs";

interface OSLayoutProps {
  children: React.ReactNode;
}

export async function OSLayout({ children }: OSLayoutProps) {
  // ---------------------------------------------
  // TEST MODE OVERRIDE (RBAC + AUTH DISABLED)
  // In test mode, default to superadmin role and hide user button
  // ---------------------------------------------
  let role: Role = "shopper";
  let isTestMode = false;

  if (process.env.TEST_MODE === "true") {
    console.warn("[TEST MODE] OSLayout bypassing getUserRole() - returning 'superadmin'");
    role = "superadmin";
    isTestMode = true;
  } else {
    role = await getUserRole();
  }

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

          {/* User Profile - Only show if not in test mode */}
          {!isTestMode && (
            <div className="flex items-center gap-4">
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{
                  elements: {
                    avatarBox: "w-10 h-10",
                  },
                }}
              />
            </div>
          )}

          {/* Test Mode Indicator */}
          {isTestMode && (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 border border-yellow-300 rounded-md">
              <span className="text-sm font-medium text-yellow-800">⚠️ TEST MODE</span>
            </div>
          )}
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
