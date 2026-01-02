import * as logger from './logger';
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Type-safe Xero metadata stored in Clerk privateMetadata
 */
interface XeroMetadata {
  xero?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tenantId: string;
    tenantName?: string;
    connectedAt?: number;
  };
}

/**
 * Xero token data
 */
export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tenantId: string;
  tenantName?: string;
}

/**
 * Xero token refresh response
 */
interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Get Xero tokens from Clerk metadata
 * @throws Error if Xero is not connected
 */
export async function getTokens(userId: string): Promise<XeroTokens> {
  logger.info('XERO_AUTH', `Getting tokens for user: ${userId}`);

  const user = await clerkClient.users.getUser(userId);
  const meta = user.privateMetadata as XeroMetadata;

  if (!meta.xero?.accessToken || !meta.xero?.refreshToken || !meta.xero?.tenantId) {
    logger.error('XERO_AUTH', 'Xero not connected - missing tokens in metadata');
    throw new Error("Xero not connected. Please connect your Xero account.");
  }

  logger.info('XERO_AUTH', `Tokens found for tenant: ${meta.xero.tenantId}`);

  return {
    accessToken: meta.xero.accessToken,
    refreshToken: meta.xero.refreshToken,
    expiresAt: meta.xero.expiresAt,
    tenantId: meta.xero.tenantId,
    tenantName: meta.xero.tenantName,
  };
}

/**
 * Save Xero tokens to Clerk metadata
 */
export async function saveTokens(userId: string, tokens: XeroTokens): Promise<void> {
  logger.info('XERO_AUTH', `Saving tokens for user: ${userId}`);

  await clerkClient.users.updateUser(userId, {
    privateMetadata: {
      xero: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        tenantId: tokens.tenantId,
        tenantName: tokens.tenantName,
        connectedAt: Date.now(),
      },
    },
  });

  logger.info('XERO_AUTH', 'Tokens saved successfully');
}

/**
 * Refresh Xero access token using refresh token
 * Automatically updates Clerk metadata with new tokens
 * @throws Error if refresh fails
 */
export async function refreshTokens(userId: string): Promise<XeroTokens> {
  logger.info('XERO_AUTH', `Refreshing tokens for user: ${userId}`);

  // Get current tokens
  const currentTokens = await getTokens(userId);

  // Validate environment
  const clientId = process.env.NEXT_PUBLIC_XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error('XERO_AUTH', 'Missing Xero OAuth configuration');
    throw new Error("Xero OAuth configuration missing on server");
  }

  try {
    logger.info('XERO_AUTH', 'Calling Xero token refresh endpoint...');
    const refreshResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentTokens.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      logger.error('XERO_AUTH', 'Token refresh failed', {
        status: refreshResponse.status,
        error: errorText,
      });

      // If refresh token is invalid (401/400), user needs to reconnect
      if (refreshResponse.status === 400 || refreshResponse.status === 401) {
        throw new Error("Xero session expired. Please reconnect your Xero account.");
      }

      throw new Error(`Failed to refresh Xero token: ${errorText}`);
    }

    const newTokenData: XeroTokenResponse = await refreshResponse.json();
    const newExpiresAt = Date.now() + newTokenData.expires_in * 1000;

    logger.info('XERO_AUTH', `Token refreshed successfully (expires in ${newTokenData.expires_in}s)`);

    // Create new tokens object
    const newTokens: XeroTokens = {
      accessToken: newTokenData.access_token,
      refreshToken: newTokenData.refresh_token,
      expiresAt: newExpiresAt,
      tenantId: currentTokens.tenantId,
      tenantName: currentTokens.tenantName,
    };

    // Save to Clerk
    await saveTokens(userId, newTokens);

    return newTokens;
  } catch (error: any) {
    logger.error('XERO_AUTH', 'Token refresh error', { error: error as any } as any);
    throw error;
  }
}

/**
 * Get valid Xero tokens, automatically refreshing if expired
 * This is the main function to use in API routes
 *
 * @param userId - Clerk user ID
 * @returns Valid access token and tenant ID
 * @throws Error if Xero is not connected or refresh fails
 */
export async function getValidTokens(userId: string): Promise<XeroTokens> {
  logger.info('XERO_AUTH', `Getting valid tokens for user: ${userId}`);

  // Get current tokens
  const tokens = await getTokens(userId);

  // Check if token needs refresh (60 seconds before expiry)
  const now = Date.now();
  const expiresIn = tokens.expiresAt - now;
  const needsRefresh = expiresIn < 60_000; // 60 seconds

  logger.info('XERO_AUTH', 'Token status', {
    expiresIn: Math.floor(expiresIn / 1000) + "s",
    needsRefresh,
  });

  if (!needsRefresh) {
    logger.info('XERO_AUTH', 'Token still valid, using existing token');
    return tokens;
  }

  // Token expired or about to expire, refresh it
  logger.info('XERO_AUTH', 'Token expiring soon, refreshing...');
  return await refreshTokens(userId);
}

/**
 * Check if user has Xero connected (without throwing error)
 * Useful for UI to determine whether to show "Connect Xero" button
 */
export async function hasXeroConnection(userId: string): Promise<boolean> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const meta = user.privateMetadata as XeroMetadata;
    const hasConnection = !!(
      meta.xero?.accessToken &&
      meta.xero?.refreshToken &&
      meta.xero?.tenantId
    );
    logger.info('XERO_AUTH', `Connection check for ${userId}: ${hasConnection}`);
    return hasConnection;
  } catch (error) {
    logger.error('XERO_AUTH', 'Error checking connection', { error: error as any });
    return false;
  }
}

/**
 * Disconnect Xero account (clear all metadata)
 * Useful for "Disconnect" button in UI
 */
export async function disconnectXero(userId: string): Promise<void> {
  logger.info('XERO_AUTH', `Disconnecting Xero for user: ${userId}`);

  await clerkClient.users.updateUser(userId, {
    privateMetadata: {
      xero: null,
    },
  });

  logger.info('XERO_AUTH', 'Xero disconnected successfully');
}
