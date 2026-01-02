/**
 * Xero Branding Themes Cache
 *
 * Fetches and caches branding themes from Xero with 10-minute TTL.
 * Branding themes are needed to map display names to GUIDs for invoice creation.
 */

import * as logger from './logger';
import { getValidTokens } from "./xero-auth";

export interface BrandingTheme {
  BrandingThemeID: string;
  Name: string;
  SortOrder?: number;
  CreatedDateUTC?: string;
}

interface BrandingThemesResponse {
  BrandingThemes: BrandingTheme[];
}

interface CacheEntry {
  themes: BrandingTheme[];
  fetchedAt: number;
  userId: string;
}

// In-memory cache: userId -> CacheEntry
const themesCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Periodic cache cleanup to prevent memory leaks
// Runs every 10 minutes to remove expired entries
setInterval(() => {
  const now = Date.now();
  let removedCount = 0;

  for (const [userId, entry] of themesCache.entries()) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) {
      themesCache.delete(userId);
      removedCount++;
      logger.info('XERO', `Branding cache cleanup: Removed expired cache for user ${userId}`);
    }
  }

  if (removedCount > 0) {
    logger.info('XERO', `Branding cache cleanup: Cleaned up ${removedCount} expired cache entries`);
  }
}, CACHE_TTL_MS);

/**
 * Fetch all branding themes from Xero
 *
 * @param userId - Clerk user ID for authentication
 * @returns Array of branding themes with IDs and names
 */
async function fetchBrandingThemesFromXero(userId: string): Promise<BrandingTheme[]> {
  const startTime = Date.now();
  logger.info('XERO', 'Fetching branding themes from Xero');

  // Get valid OAuth tokens
  let accessToken: string;
  let tenantId: string;

  try {
    const tokens = await getValidTokens(userId);
    accessToken = tokens.accessToken;
    tenantId = tokens.tenantId;
    logger.info('XERO', `Valid tokens obtained for tenant: ${tenantId}`);
  } catch (error: any) {
    logger.error('XERO', `Failed to get tokens: ${error.message}`);
    throw error;
  }

  // Call Xero API
  const xeroUrl = "https://api.xero.com/api.xro/2.0/BrandingThemes";
  logger.info('XERO', `Fetching from: ${xeroUrl}`);

  const response = await fetch(xeroUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });

  logger.info('XERO', `Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('XERO', 'Xero API error', {
      status: response.status,
      error: errorText,
    });
    throw new Error(`Failed to fetch branding themes: ${response.status}`);
  }

  const data: BrandingThemesResponse = await response.json();
  const themes = data.BrandingThemes || [];

  const duration = Date.now() - startTime;
  logger.info('XERO', `Fetched ${themes.length} branding themes in ${duration}ms`);

  // Log themes for debugging
  themes.forEach((theme) => {
    logger.info('XERO', `  - "${theme.Name}" → ${theme.BrandingThemeID}`);
  });

  return themes;
}

/**
 * Get all branding themes (cached)
 *
 * Returns cached themes if available and fresh (< 10 minutes old).
 * Otherwise, fetches fresh data from Xero API.
 *
 * @param userId - Clerk user ID for authentication
 * @returns Array of branding themes
 */
export async function getBrandingThemes(userId: string): Promise<BrandingTheme[]> {
  const now = Date.now();

  // Check cache
  const cached = themesCache.get(userId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const age = Math.round((now - cached.fetchedAt) / 1000);
    logger.info('XERO', `Using cached themes (${cached.themes.length} themes, ${age}s old)`);
    return cached.themes;
  }

  // Cache miss or expired - fetch fresh data
  logger.info('XERO', 'Cache miss or expired, fetching fresh data...');
  const themes = await fetchBrandingThemesFromXero(userId);

  // Store in cache
  themesCache.set(userId, {
    themes,
    fetchedAt: now,
    userId,
  });

  return themes;
}

/**
 * Find branding theme ID by name
 *
 * @param userId - Clerk user ID for authentication
 * @param themeName - Display name of the branding theme (e.g., "CN 20% VAT")
 * @returns Branding theme GUID or undefined if not found
 */
export async function getBrandingThemeId(userId: string, themeName: string): Promise<string | undefined> {
  const themes = await getBrandingThemes(userId);
  const theme = themes.find((t) => t.Name === themeName);

  if (theme) {
    logger.info('XERO', `Resolved "${themeName}" → ${theme.BrandingThemeID}`);
    return theme.BrandingThemeID;
  }

  logger.warn('XERO', `Branding theme not found: "${themeName}"`);
  return undefined;
}

/**
 * Clear cache for a specific user (useful for testing)
 */
export function clearBrandingThemesCache(userId: string): void {
  themesCache.delete(userId);
  logger.info('XERO', `Cleared cache for user: ${userId}`);
}

/**
 * Clear all caches (useful for testing)
 */
export function clearAllBrandingThemesCaches(): void {
  themesCache.clear();
  logger.info('XERO', 'Cleared all caches');
}
