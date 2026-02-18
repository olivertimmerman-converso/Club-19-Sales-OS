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
  // Protect non-public routes — redirects unauthenticated users to sign-in
  if (!isPublicRoute(request)) {
    auth().protect();
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
