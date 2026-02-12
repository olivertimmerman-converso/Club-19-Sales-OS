/**
 * Club 19 Sales OS - Clerk Middleware
 *
 * Protects routes using Clerk authentication
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/xero/webhooks(.*)',  // Xero webhooks need to be public
  '/api/cron/(.*)',          // Cron jobs use different auth
]);

export default clerkMiddleware(async (auth, request) => {
  // Log middleware execution for debugging
  console.log('[MIDDLEWARE] Running for:', request.nextUrl.pathname);

  // Ensure session is loaded for protected routes
  if (!isPublicRoute(request)) {
    console.log('[MIDDLEWARE] Loading auth for protected route:', request.nextUrl.pathname);
    await auth();  // Load the session
  } else {
    console.log('[MIDDLEWARE] Public route, skipping auth:', request.nextUrl.pathname);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
