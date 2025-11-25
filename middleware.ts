import { clerkMiddleware } from "@clerk/nextjs/server";

// Bypass Clerk authentication in development mode
const isDevelopment = process.env.NODE_ENV === "development";

export default isDevelopment
  ? () => {} // No-op middleware in development
  : clerkMiddleware(); // Use Clerk in production

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/"],
};
