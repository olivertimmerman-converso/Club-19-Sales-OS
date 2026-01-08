/**
 * Club 19 Sales OS - Xero Token Refresh Cron Job
 *
 * Automatically refreshes Xero tokens to keep connection alive indefinitely.
 * Xero tokens expire after 30 minutes, but refresh tokens last 60 days.
 * By refreshing daily, we ensure the connection never expires.
 *
 * This endpoint is called by Vercel Cron (configured in vercel.json).
 * Runs daily at 6am UTC to refresh all active Xero connections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { refreshTokens } from '@/lib/xero-auth';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface XeroMetadata {
  xero?: {
    accessToken?: string;
    refreshToken?: string;
    tenantId?: string;
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.info('XERO_CRON', 'Starting scheduled token refresh');

  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET) {
    logger.error('XERO_CRON', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== expectedAuth) {
    logger.error('XERO_CRON', 'Unauthorized cron request', {
      hasAuth: !!authHeader,
      authPrefix: authHeader?.substring(0, 10),
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all users from Clerk
    const users = await clerkClient.users.getUserList({ limit: 100 });

    // Filter for users with Xero tokens in privateMetadata
    const usersWithTokens = users.data.filter(user => {
      const meta = user.privateMetadata as XeroMetadata;
      return !!(meta.xero?.accessToken && meta.xero?.refreshToken && meta.xero?.tenantId);
    });

    if (usersWithTokens.length === 0) {
      logger.info('XERO_CRON', 'No Xero tokens found');
      return NextResponse.json({
        message: 'No tokens to refresh',
        refreshed: 0,
        failed: 0,
        duration: Date.now() - startTime,
      });
    }

    logger.info('XERO_CRON', 'Found tokens to refresh', {
      count: usersWithTokens.length,
    });

    let refreshed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of usersWithTokens) {
      try {
        logger.info('XERO_CRON', 'Refreshing token', {
          userId: user.id,
        });

        // Use existing refreshTokens function from lib/xero-auth.ts
        await refreshTokens(user.id);

        logger.info('XERO_CRON', 'Token refreshed successfully', {
          userId: user.id,
        });
        refreshed++;
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('XERO_CRON', 'Error refreshing token', {
          userId: user.id,
          error: errorMessage,
        });
        errors.push(`User ${user.id}: ${errorMessage}`);
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('XERO_CRON', 'Cron job complete', {
      refreshed,
      failed,
      duration,
    });

    return NextResponse.json({
      success: true,
      refreshed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration,
    });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('XERO_CRON', 'Fatal error in cron job', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json({
      error: 'Cron job failed',
      details: errorMessage,
    }, { status: 500 });
  }
}
