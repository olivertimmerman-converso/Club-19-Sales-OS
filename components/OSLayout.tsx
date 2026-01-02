/**
 * Club 19 Sales OS - Layout Wrapper
 *
 * Server Component with client boundary for Clerk UI
 * NEVER crashes - graceful error handling
 */

import { getUserRole } from "@/lib/getUserRole";
import { Sidebar } from "./Sidebar";
import { OSNav } from "./OSNav";
import { ErrorFallback } from "./ErrorFallback";
import * as logger from '@/lib/logger';

interface OSLayoutProps {
  children: React.ReactNode;
}

export async function OSLayout({ children }: OSLayoutProps) {
  logger.info('UI', 'Starting SSR layout render');

  let role;
  let hasError = false;

  try {
    logger.info('UI', 'Calling getUserRole');
    role = await getUserRole();
    logger.info('UI', 'Role resolved', { role });
  } catch (error) {
    hasError = true;
    logger.error('UI', 'Failed to get user role', { error: error as any } as any);
    logger.info('UI', 'Rendering error state');

    // Render error fallback (client component with button)
    return <ErrorFallback />;
  }

  logger.info('UI', 'Rendering layout with role', { role });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Server Component */}
      <Sidebar role={role} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex-1">
            {/* Page-specific content can go here */}
          </div>

          {/* User Profile - Client Component with Clerk */}
          <OSNav role={role} />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
