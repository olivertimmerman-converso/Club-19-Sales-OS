/**
 * Club 19 Sales OS - Layout Wrapper
 *
 * Server Component with client boundary for Clerk UI
 * Responsive: sidebar on desktop, bottom tabs + drawer on mobile
 * NEVER crashes - graceful error handling
 */

import { getUserRole } from "@/lib/getUserRole";
import { Sidebar } from "./Sidebar";
import { OSNav } from "./OSNav";
import { MobileNav } from "./MobileNav";
import { ErrorFallback } from "./ErrorFallback";
import { XeroStatusBanner } from "./XeroStatusBanner";
import * as logger from '@/lib/logger';

interface OSLayoutProps {
  children: React.ReactNode;
}

export async function OSLayout({ children }: OSLayoutProps) {
  let role;

  try {
    role = await getUserRole();
  } catch (error) {
    logger.error('UI', 'Failed to get user role', { error: error as any } as any);
    return <ErrorFallback />;
  }

  return (
    <div className="flex h-screen bg-club19-offwhite">
      {/* Desktop Sidebar — hidden on mobile */}
      <div className="hidden md:flex">
        <Sidebar role={role} />
      </div>

      {/* Mobile Navigation — header, bottom tabs, drawer */}
      <MobileNav role={role} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Xero Disconnection Warning Banner */}
        <XeroStatusBanner role={role} />

        {/* Desktop Top Bar — hidden on mobile */}
        <header className="hidden md:flex h-16 bg-white border-b border-club19-warmgrey items-center justify-between px-6">
          <div className="flex-1">
            {/* Page-specific content can go here */}
          </div>

          {/* User Profile - Client Component with Clerk */}
          <OSNav role={role} />
        </header>

        {/* Page Content — padded for mobile header (top) and tab bar (bottom) */}
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0 pb-16 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
