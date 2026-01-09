/**
 * Club 19 Sales OS - Instrumentation
 *
 * Next.js automatic instrumentation file
 * Runs once when the server starts (before any requests)
 *
 * Use this for:
 * - Environment variable validation
 * - Global setup
 * - Initialization checks
 * - Xero token refresh on deployment
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { validateEnvironmentVariables } from "./lib/env";

/**
 * Refresh Xero tokens on startup to ensure connection is always fresh
 * This runs on every deployment, providing an extra layer of token refresh
 */
async function refreshXeroOnStartup() {
  const systemUserId = process.env.XERO_SYSTEM_USER_ID;

  if (!systemUserId || systemUserId === 'FILL_ME') {
    console.log("[INSTRUMENTATION] ⚠️ XERO_SYSTEM_USER_ID not configured, skipping Xero refresh");
    return;
  }

  try {
    // Dynamic import to avoid issues with module loading order
    const { refreshTokens } = await import("./lib/xero-auth");

    console.log("[INSTRUMENTATION] 🔄 Refreshing Xero tokens on startup...");
    await refreshTokens(systemUserId);
    console.log("[INSTRUMENTATION] ✅ Xero tokens refreshed successfully");
  } catch (error: any) {
    // Log but don't fail startup - the cron will retry later
    console.error("[INSTRUMENTATION] ⚠️ Xero token refresh failed:", error.message);
    console.log("[INSTRUMENTATION] ℹ️ Xero will be refreshed on next cron run (every 4 hours)");
  }
}

/**
 * Server instrumentation - runs once on startup
 */
export async function register() {
  console.log("[INSTRUMENTATION] 🚀 Server starting...");

  // Validate environment variables
  try {
    validateEnvironmentVariables();
    console.log("[INSTRUMENTATION] ✅ Environment variables validated");
  } catch (error: any) {
    console.error("[INSTRUMENTATION] ❌ Environment validation failed:", error.message);
    // In production, you might want to exit the process here
    // process.exit(1);
  }

  // Refresh Xero tokens on every deployment (non-blocking)
  // Run in background so it doesn't slow down startup
  refreshXeroOnStartup().catch((err) => {
    console.error("[INSTRUMENTATION] Xero refresh background task failed:", err.message);
  });

  console.log("[INSTRUMENTATION] ✓ Initialization complete");
}
