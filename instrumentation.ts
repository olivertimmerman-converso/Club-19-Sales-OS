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
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { validateEnvironmentVariables } from "./lib/env";

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

  console.log("[INSTRUMENTATION] ✓ Initialization complete");
}
