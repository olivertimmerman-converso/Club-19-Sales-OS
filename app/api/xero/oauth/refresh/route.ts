/**
 * Club 19 Sales OS - Xero Token Refresh Endpoint
 *
 * Programmatically refreshes Xero access tokens using refresh tokens.
 * Called by:
 * - Cron job (daily automated refresh)
 * - getValidTokens() when token is expiring soon
 *
 * Xero token lifecycle:
 * - Access token: Expires after 30 minutes
 * - Refresh token: Expires after 60 days of non-use
 * - By refreshing regularly, connection stays alive indefinitely
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshTokens } from '@/lib/xero-auth';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { userId } = await request.json();

    if (!userId) {
      logger.error('XERO_REFRESH', 'Missing userId in request');
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    logger.info('XERO_REFRESH', 'Starting token refresh', { userId });

    // Use existing refreshTokens function from lib/xero-auth.ts
    // This handles Clerk privateMetadata access and token refresh logic
    const newTokens = await refreshTokens(userId);

    const duration = Date.now() - startTime;
    logger.info('XERO_REFRESH', 'Successfully refreshed tokens', {
      userId,
      expiresAt: new Date(newTokens.expiresAt).toISOString(),
      duration,
    });

    return NextResponse.json({
      success: true,
      expiresAt: new Date(newTokens.expiresAt).toISOString(),
      duration,
    });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('XERO_REFRESH', 'Error refreshing token', {
      error: errorMessage,
      stack: errorStack,
    });

    return NextResponse.json({
      error: 'Internal server error',
      details: errorMessage,
    }, { status: 500 });
  }
}
