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
 *
 * NOTE: In Stage 1 architecture, refreshTokens() only works with forceCron: true
 * On startup, we just log that cron will handle it - no point trying to refresh here
 */
async function refreshXeroOnStartup() {
  const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;

  if (!integrationUserId) {
    console.log("[INSTRUMENTATION] ⚠️ XERO_INTEGRATION_CLERK_USER_ID not configured, skipping Xero check");
    return;
  }

  // Stage 1: Only cron can refresh tokens to prevent race conditions
  // Just log that we have an integration user configured
  console.log("[INSTRUMENTATION] ✅ Xero integration user configured");
  console.log("[INSTRUMENTATION] ℹ️ Token refresh handled by cron job (every 10 minutes)");
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
