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
 * Get Xero tokens from Clerk metadata with shared connection fallback
 *
 * Strategy:
 * 1. Try to get tokens from the current user
 * 2. If not found, fall back to finding any team member with Xero connected
 * 3. This allows all authorized team members to use Xero features without individual OAuth
 *
 * @throws Error if no one on the team has Xero connected
 */
export async function getTokens(userId: string): Promise<XeroTokens> {
  logger.info('XERO_AUTH', `Getting tokens for user: ${userId}`);

  // Try current user first
  const user = await clerkClient.users.getUser(userId);
  const meta = user.privateMetadata as XeroMetadata;

  if (meta.xero?.accessToken && meta.xero?.refreshToken && meta.xero?.tenantId) {
    logger.info('XERO_AUTH', `Tokens found for current user, tenant: ${meta.xero.tenantId}`);
    return {
      accessToken: meta.xero.accessToken,
      refreshToken: meta.xero.refreshToken,
      expiresAt: meta.xero.expiresAt,
      tenantId: meta.xero.tenantId,
      tenantName: meta.xero.tenantName,
    };
  }

  // Current user doesn't have Xero connected, try shared connection
  logger.info('XERO_AUTH', `Current user has no Xero connection, looking for shared connection...`);

  try {
    // Get all users and find one with Xero connected
    const userList = await clerkClient.users.getUserList({ limit: 100 });

    for (const teamUser of userList.data) {
      const teamMeta = teamUser.privateMetadata as XeroMetadata;

      if (teamMeta.xero?.accessToken && teamMeta.xero?.refreshToken && teamMeta.xero?.tenantId) {
        logger.info('XERO_AUTH', `Found shared Xero connection from user ${teamUser.id}, tenant: ${teamMeta.xero.tenantId}`);

        return {
          accessToken: teamMeta.xero.accessToken,
          refreshToken: teamMeta.xero.refreshToken,
          expiresAt: teamMeta.xero.expiresAt,
          tenantId: teamMeta.xero.tenantId,
          tenantName: teamMeta.xero.tenantName,
        };
      }
    }
  } catch (error) {
    logger.error('XERO_AUTH', 'Error looking for shared connection', { error: error as any });
  }

  // No Xero connection found anywhere
  logger.error('XERO_AUTH', 'No Xero connection found for user or team');
  throw new Error("Xero not connected. Please ask an admin to connect Xero.");
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
 * Find which user owns the Xero connection
 * @returns userId of the user who has Xero tokens, or null if none
 */
async function findXeroOwner(): Promise<string | null> {
  try {
    const userList = await clerkClient.users.getUserList({ limit: 100 });

    for (const user of userList.data) {
      const meta = user.privateMetadata as XeroMetadata;
      if (meta.xero?.accessToken && meta.xero?.refreshToken && meta.xero?.tenantId) {
        return user.id;
      }
    }
  } catch (error) {
    logger.error('XERO_AUTH', 'Error finding Xero owner', { error: error as any });
  }

  return null;
}

/**
 * Refresh Xero access token using refresh token
 * Automatically updates Clerk metadata with new tokens
 *
 * With shared connection: saves refreshed tokens back to the user who owns them
 *
 * @throws Error if refresh fails
 */
export async function refreshTokens(userId: string): Promise<XeroTokens> {
  logger.info('XERO_AUTH', `Refreshing tokens for user: ${userId}`);

  // Get current tokens (may come from shared connection)
  const currentTokens = await getTokens(userId);

  // Find who actually owns the Xero connection
  const ownerId = await findXeroOwner();
  if (!ownerId) {
    throw new Error("Cannot find Xero connection owner for refresh");
  }

  logger.info('XERO_AUTH', `Xero connection owned by user: ${ownerId}`);

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

      // If refresh token is invalid (401/400), owner needs to reconnect
      if (refreshResponse.status === 400 || refreshResponse.status === 401) {
        throw new Error("Xero session expired. Please ask an admin to reconnect Xero.");
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

    // Save to the OWNER's account (not necessarily the requesting user)
    await saveTokens(ownerId, newTokens);
    logger.info('XERO_AUTH', `Refreshed tokens saved to owner: ${ownerId}`);

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

  // Defensive check: if expiresAt is missing or invalid, force refresh
  if (!tokens.expiresAt || typeof tokens.expiresAt !== 'number') {
    logger.error('XERO_AUTH', 'Token expiresAt is invalid, forcing refresh', {
      expiresAt: tokens.expiresAt,
      type: typeof tokens.expiresAt,
    });
    return await refreshTokens(userId);
  }

  // Check if token needs refresh (5 minutes before expiry for proactive refresh)
  // This ensures tokens are always fresh and prevents expiry during API calls
  const now = Date.now();
  const expiresIn = tokens.expiresAt - now;
  const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
  const needsRefresh = expiresIn < fiveMinutes;

  logger.info('XERO_AUTH', 'Token status', {
    now: new Date(now).toISOString(),
    expiresAt: new Date(tokens.expiresAt).toISOString(),
    expiresIn: Math.floor(expiresIn / 1000) + "s",
    needsRefresh,
  });

  if (!needsRefresh) {
    logger.info('XERO_AUTH', 'Token still valid, using existing token');
    return tokens;
  }

  // Token expired or about to expire, refresh it
  logger.info('XERO_AUTH', 'Token expiring soon, refreshing proactively...');
  return await refreshTokens(userId);
}

/**
 * Check if user has access to Xero (either their own connection OR shared team connection)
 * Useful for UI to determine whether to show "Connect Xero" button
 *
 * Returns true if:
 * 1. Current user has Xero tokens, OR
 * 2. Any team member has Xero tokens (shared connection)
 */
export async function hasXeroConnection(userId: string): Promise<boolean> {
  try {
    // First check: Does current user have Xero connection?
    const user = await clerkClient.users.getUser(userId);
    const meta = user.privateMetadata as XeroMetadata;
    const hasOwnConnection = !!(
      meta.xero?.accessToken &&
      meta.xero?.refreshToken &&
      meta.xero?.tenantId
    );

    if (hasOwnConnection) {
      logger.info('XERO_AUTH', `User ${userId} has own Xero connection`);
      return true;
    }

    // Second check: Does team have a shared Xero connection?
    logger.info('XERO_AUTH', `User ${userId} has no personal connection, checking for shared team connection...`);

    try {
      const userList = await clerkClient.users.getUserList({ limit: 100 });
      for (const teamUser of userList.data) {
        const teamMeta = teamUser.privateMetadata as XeroMetadata;
        if (
          teamMeta.xero?.accessToken &&
          teamMeta.xero?.refreshToken &&
          teamMeta.xero?.tenantId
        ) {
          logger.info('XERO_AUTH', `Found shared Xero connection from user ${teamUser.id}`);
          return true;
        }
      }
    } catch (error) {
      logger.error('XERO_AUTH', 'Error checking for shared connection', { error: error as any });
    }

    logger.info('XERO_AUTH', `No Xero connection found for user ${userId} or team`);
    return false;
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
