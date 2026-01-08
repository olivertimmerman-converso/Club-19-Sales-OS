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
import { getXataClient } from '@/src/xata';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

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
    const xata = getXataClient();

    // Find all users with Xero tokens
    const usersWithTokens = await xata.db.XeroTokens
      .filter({ refresh_token: { $exists: true } })
      .getAll();

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

    for (const tokenRecord of usersWithTokens) {
      try {
        logger.info('XERO_CRON', 'Refreshing token', {
          userId: tokenRecord.user_id,
        });

        // Call the refresh endpoint
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const response = await fetch(`${appUrl}/api/xero/oauth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: tokenRecord.user_id }),
        });

        if (response.ok) {
          logger.info('XERO_CRON', 'Token refreshed successfully', {
            userId: tokenRecord.user_id,
          });
          refreshed++;
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          logger.error('XERO_CRON', 'Failed to refresh token', {
            userId: tokenRecord.user_id,
            status: response.status,
            error: errorData,
          });
          errors.push(`User ${tokenRecord.user_id}: ${errorData.error || response.statusText}`);
          failed++;
        }
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('XERO_CRON', 'Error refreshing token', {
          userId: tokenRecord.user_id,
          error: errorMessage,
        });
        errors.push(`User ${tokenRecord.user_id}: ${errorMessage}`);
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
