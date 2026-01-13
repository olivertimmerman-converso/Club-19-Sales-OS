/**
 * Club 19 Sales OS - Xero Health Check Endpoint
 *
 * Tests that the Xero connection is actually working, not just that tokens exist.
 * Use with external monitoring services like UptimeRobot.
 *
 * Returns:
 * - 200: Xero connection is healthy
 * - 503: Xero is disconnected or erroring
 */

import { NextResponse } from 'next/server';
import { getValidTokens } from '@/lib/xero-auth';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();

  try {
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;

    if (!integrationUserId) {
      logger.warn('XERO_HEALTH', 'XERO_INTEGRATION_CLERK_USER_ID not configured');
      return NextResponse.json({
        status: 'misconfigured',
        message: 'XERO_INTEGRATION_CLERK_USER_ID not configured',
        healthy: false,
      }, { status: 503 });
    }

    // Try to get valid tokens (this will attempt refresh if needed)
    let tokens;
    try {
      tokens = await getValidTokens(integrationUserId);
    } catch (tokenError: any) {
      logger.error('XERO_HEALTH', 'Failed to get valid tokens', {
        message: tokenError.message,
      });
      return NextResponse.json({
        status: 'disconnected',
        message: tokenError.message || 'No valid Xero tokens',
        healthy: false,
        action: 'Admin must reconnect Xero at /admin/xero',
      }, { status: 503 });
    }

    if (!tokens || !tokens.accessToken) {
      return NextResponse.json({
        status: 'disconnected',
        message: 'No valid Xero tokens available',
        healthy: false,
        action: 'Admin must reconnect Xero at /admin/xero',
      }, { status: 503 });
    }

    // Actually test the connection with a simple API call
    const response = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Accept': 'application/json',
      },
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('XERO_HEALTH', 'Xero API returned error', {
        status: response.status,
        error: errorText,
      });
      return NextResponse.json({
        status: 'error',
        message: `Xero API returned ${response.status}`,
        healthy: false,
        duration,
      }, { status: 503 });
    }

    // Parse connections to verify tenant is accessible
    const connections = await response.json();
    const activeConnection = connections.find((c: any) => c.tenantId === tokens.tenantId);

    if (!activeConnection) {
      logger.warn('XERO_HEALTH', 'Tenant not found in connections', {
        tenantId: tokens.tenantId,
        availableTenants: connections.map((c: any) => c.tenantId),
      });
      return NextResponse.json({
        status: 'tenant_mismatch',
        message: 'Connected tenant not found',
        healthy: false,
        duration,
      }, { status: 503 });
    }

    logger.info('XERO_HEALTH', 'Health check passed', {
      tenantName: activeConnection.tenantName,
      duration,
    });

    return NextResponse.json({
      status: 'connected',
      message: 'Xero connection healthy',
      healthy: true,
      tenantName: activeConnection.tenantName,
      duration,
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('XERO_HEALTH', 'Health check failed', {
      message: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      status: 'error',
      message: error.message || 'Unknown error',
      healthy: false,
      duration,
    }, { status: 503 });
  }
}
