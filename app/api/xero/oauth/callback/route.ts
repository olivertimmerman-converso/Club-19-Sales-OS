import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Xero OAuth Token Response
 */
interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
}

/**
 * Xero Connection (Tenant)
 */
interface XeroConnection {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
}

/**
 * GET /api/xero/oauth/callback
 * Handles OAuth 2.0 callback from Xero
 * Exchanges authorization code for tokens and stores in Clerk privateMetadata
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.info("XERO_OAUTH", "OAuth callback initiated");

  try {
    // 1. Verify user is authenticated via Clerk
    const { userId } = await auth();

    if (!userId) {
      logger.error("XERO_OAUTH", "No userId - user not authenticated");
      return NextResponse.redirect(
        new URL("/sign-in?error=xero_auth_failed", request.url)
      );
    }

    logger.info("XERO_OAUTH", "User authenticated", { userId });

    // 2. Extract authorization code and state from query params
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle OAuth errors from Xero
    if (error) {
      logger.error("XERO_OAUTH", "Xero returned error", { error, errorDescription });
      return NextResponse.redirect(
        new URL(`/trade/new?xero_error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      logger.error("XERO_OAUTH", "Missing authorization code");
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=missing_code", request.url)
      );
    }

    // Verify state matches userId for security
    if (state !== userId) {
      logger.error("XERO_OAUTH", "State mismatch", { expected: userId, received: state });
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=invalid_state", request.url)
      );
    }

    logger.info("XERO_OAUTH", "Authorization code received", { codeLength: code.length });

    // 3. Validate environment configuration
    // NOTE: OAuth 2.0 spec allows client_id to be public - this is intentional
    const clientId = process.env.NEXT_PUBLIC_XERO_CLIENT_ID;
    // client_secret is server-only and never exposed to client
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId || !clientSecret || !appUrl) {
      logger.error("XERO_OAUTH", "Missing environment variables", {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasAppUrl: !!appUrl,
      });
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=config_missing", request.url)
      );
    }

    const redirectUri = `${appUrl}/api/xero/oauth/callback`;
    logger.info("XERO_OAUTH", "Redirect URI", { redirectUri });

    // 4. Exchange authorization code for access token
    logger.info("XERO_OAUTH", "Exchanging code for tokens...");
    const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error("XERO_OAUTH", "Token exchange failed", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
      });
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=token_exchange_failed", request.url)
      );
    }

    const tokens: XeroTokenResponse = await tokenResponse.json();
    logger.info("XERO_OAUTH", "Tokens received", { expiresIn: tokens.expires_in });

    // 5. Fetch tenant/organization information
    logger.info("XERO_OAUTH", "Fetching Xero tenant connections...");
    const connectionsResponse = await fetch("https://api.xero.com/connections", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!connectionsResponse.ok) {
      const errorText = await connectionsResponse.text();
      logger.error("XERO_OAUTH", "Connections fetch failed", {
        status: connectionsResponse.status,
        error: errorText,
      });
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=connections_failed", request.url)
      );
    }

    const connections: XeroConnection[] = await connectionsResponse.json();

    if (!connections || connections.length === 0) {
      logger.error("XERO_OAUTH", "No Xero organizations found for user");
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=no_organizations", request.url)
      );
    }

    const primaryConnection = connections[0];
    logger.info("XERO_OAUTH", "Tenant found", {
      tenantName: primaryConnection.tenantName,
      tenantId: primaryConnection.tenantId
    });

    // 6. Calculate token expiration timestamp
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    // 7. Store tokens in Clerk user privateMetadata with nested structure
    logger.info("XERO_OAUTH", "Storing tokens in Clerk privateMetadata...");
    await clerkClient.users.updateUser(userId, {
      privateMetadata: {
        xero: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt,
          tenantId: primaryConnection.tenantId,
          tenantName: primaryConnection.tenantName,
          connectedAt: Date.now(),
        },
      },
    });

    const duration = Date.now() - startTime;
    logger.info("XERO_OAUTH", "SUCCESS! Xero connected", {
      duration_ms: duration,
      tenantId: primaryConnection.tenantId,
      tenantName: primaryConnection.tenantName,
      expiresIn: tokens.expires_in
    });

    // 8. Redirect back to trade wizard with success message
    return NextResponse.redirect(
      new URL("/trade/new?xero_connected=true", request.url)
    );
  } catch (error: any) {
    logger.error("XERO_OAUTH", "Fatal error", { error, stack: error.stack });
    return NextResponse.redirect(
      new URL("/trade/new?xero_error=oauth_failed", request.url)
    );
  }
}
