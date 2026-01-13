/**
 * Club 19 Sales OS - Environment Variable Validation
 *
 * Centralized environment variable validation and type-safe access
 * Validates all required environment variables on startup
 */

import * as logger from './logger';

/**
 * Required environment variables for the application
 */
interface EnvironmentVariables {
  // Xata Database
  XATA_API_KEY: string;
  XATA_BRANCH?: string;

  // Clerk Authentication
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;

  // Xero Integration
  XERO_CLIENT_ID: string;
  XERO_CLIENT_SECRET: string;
  XERO_WEBHOOK_SECRET: string;
  XERO_INTEGRATION_CLERK_USER_ID: string;
}

/**
 * Validate that all required environment variables are set
 * Throws an error if any are missing
 */
export function validateEnvironmentVariables(): void {
  const missing: string[] = [];

  // Required variables
  const required: Array<keyof EnvironmentVariables> = [
    "XATA_API_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "XERO_CLIENT_ID",
    "XERO_CLIENT_SECRET",
    "XERO_WEBHOOK_SECRET",
    "XERO_INTEGRATION_CLERK_USER_ID",
  ];

  for (const key of required) {
    const value = process.env[key];
    if (!value || value === "FILL_ME") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const errorMessage = [
      "❌ Missing or placeholder environment variables:",
      ...missing.map((key) => `  - ${key}`),
      "",
      "Please check your .env.local file and ensure all required variables are set.",
      "Replace any 'FILL_ME' placeholders with actual values.",
    ].join("\n");

    logger.error('ENV', errorMessage);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  logger.info('ENV', "All required environment variables are set");
}

/**
 * Get a required environment variable
 * Throws an error if not set
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Required environment variable ${key} is not set. Please check your .env.local file.`
    );
  }
  return value;
}

/**
 * Get an optional environment variable with a default value
 */
export function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
