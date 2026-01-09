/**
 * Club 19 Sales OS - Xero Token Refresh Cron Job
 *
 * Automatically refreshes Xero tokens to keep connection alive PERMANENTLY.
 * Xero access tokens expire after 30 minutes, refresh tokens after 60 days of non-use.
 * By refreshing every 4 hours (6x/day), we ensure tokens never expire.
 *
 * This endpoint is called by Vercel Cron (configured in vercel.json).
 * Runs every 4 hours to refresh all active Xero connections.
 *
 * After refresh, we verify the tokens work by making a test API call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { refreshTokens, getValidTokens } from '@/lib/xero-auth';
import { getXataClient } from '@/src/xata';
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

        // Force refresh tokens regardless of expiry time
        await refreshTokens(user.id);

        // Verify the refresh worked by making a test API call
        const tokens = await getValidTokens(user.id);
        if (!tokens || !tokens.accessToken) {
          throw new Error('Token refresh succeeded but no access token returned');
        }

        const testResponse = await fetch('https://api.xero.com/connections', {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (!testResponse.ok) {
          throw new Error(`Xero API verification failed: ${testResponse.status}`);
        }

        logger.info('XERO_CRON', 'Token refreshed and verified successfully', {
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

        // Log critical error to Xata for visibility
        try {
          const xata = getXataClient();
          await xata.db.Errors.create({
            severity: 'high',
            source: 'xero-cron',
            message: [`Cron refresh failed for user ${user.id}: ${errorMessage}`],
            timestamp: new Date(),
            resolved: false,
          });
        } catch (logErr) {
          logger.error('XERO_CRON', 'Failed to log error to Xata', {
            error: logErr instanceof Error ? logErr.message : String(logErr),
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info('XERO_CRON', 'Cron job complete', {
      refreshed,
      failed,
      duration,
    });

    // Send alert if any refresh failed
    if (failed > 0 && process.env.ALERT_WEBHOOK_URL) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sales.club19london.com';
        await fetch(process.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 URGENT: Xero token refresh failed for ${failed} user(s). Admin must reconnect at ${appUrl}/admin/xero`,
            priority: 'high',
            errors: errors,
            timestamp: new Date().toISOString(),
          }),
        });
        logger.info('XERO_CRON', 'Alert sent for refresh failures');
      } catch (alertError) {
        logger.error('XERO_CRON', 'Failed to send alert', {
          error: alertError instanceof Error ? alertError.message : String(alertError),
        });
      }
    }

    return NextResponse.json({
      success: true,
      refreshed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      alertSent: failed > 0 && !!process.env.ALERT_WEBHOOK_URL,
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
