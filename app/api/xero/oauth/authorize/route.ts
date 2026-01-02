import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/xero/oauth/authorize
 * Initiates Xero OAuth 2.0 flow by redirecting user to Xero login
 */
export async function GET(request: NextRequest) {
  logger.info("XERO_OAUTH", "Initiating OAuth flow");

  try {
    // 1. Verify user is authenticated
    const { userId } = await auth();

    if (!userId) {
      logger.error("XERO_OAUTH", "No userId - user not authenticated");
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    logger.info("XERO_OAUTH", "User authenticated", { userId });

    // 2. Validate environment configuration
    const clientId = process.env.NEXT_PUBLIC_XERO_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId || !appUrl) {
      logger.error("XERO_OAUTH", "Missing environment variables", {
        hasClientId: !!clientId,
        hasAppUrl: !!appUrl,
      });
      return NextResponse.redirect(
        new URL("/trade/new?xero_error=config_missing", request.url)
      );
    }

    // 3. Build Xero OAuth authorization URL
    const redirectUri = `${appUrl}/api/xero/oauth/callback`;
    const scope = "openid profile email accounting.contacts accounting.transactions offline_access";
    const state = userId; // Use userId as state for security verification

    const authUrl = new URL("https://login.xero.com/identity/connect/authorize");
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("scope", scope);
    authUrl.searchParams.append("state", state);

    logger.info("XERO_OAUTH", "Redirecting to Xero", { redirectUri });

    // 4. Redirect to Xero
    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    logger.error("XERO_OAUTH", "Fatal error", { error });
    return NextResponse.redirect(
      new URL("/trade/new?xero_error=authorize_failed", request.url)
    );
  }
}
