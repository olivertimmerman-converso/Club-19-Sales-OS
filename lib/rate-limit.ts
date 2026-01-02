/**
 * Club 19 Sales OS - Rate Limiting
 *
 * Provides rate limiting functionality for API endpoints to prevent abuse.
 * Uses in-memory rate limiting with IP-based tracking.
 *
 * PRODUCTION NOTE: For production deployments, consider using:
 * - Upstash Redis (@upstash/ratelimit)
 * - Vercel Edge Config
 * - External rate limiting service
 */

import * as logger from './logger';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Default rate limit configurations
 */
export const RATE_LIMITS = {
  // Error reporting endpoints - 10 requests per minute
  errors: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },
  // Xero sync endpoints - 5 requests per minute
  xeroSync: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  },
  // Contact search endpoints - 30 requests per minute
  contacts: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  // General API endpoints - 60 requests per minute
  general: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
  },
} as const;

/**
 * Get client identifier from request
 * Uses IP address or falls back to a generic identifier
 */
function getClientIdentifier(request: Request): string {
  // Try to get IP from various headers
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");

  const ip = forwarded?.split(",")[0] || realIp || cfIp || "unknown";

  // Include user agent for additional uniqueness
  const userAgent = request.headers.get("user-agent") || "unknown";

  return `${ip}:${userAgent.substring(0, 50)}`;
}

/**
 * Clean up expired entries from the rate limit store
 * Called periodically to prevent memory leaks
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

/**
 * Check if a request should be rate limited
 *
 * @param request - The incoming request
 * @param config - Rate limit configuration
 * @returns Object with success flag and remaining requests
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMITS.general
): {
  success: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
} {
  const clientId = getClientIdentifier(request);
  const key = `${clientId}:${config.windowMs}:${config.maxRequests}`;
  const now = Date.now();

  // Get or create entry
  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  // Increment counter
  entry.count++;

  // Check if limit exceeded
  const success = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  logger.info('RATE_LIMIT', `${clientId.split(":")[0]} - ${entry.count}/${config.maxRequests} (${success ? "✓" : "✗ BLOCKED"})`);

  return {
    success,
    remaining,
    resetTime: entry.resetTime,
    limit: config.maxRequests,
  };
}

/**
 * Middleware wrapper for rate limiting API routes
 *
 * Usage:
 * ```typescript
 * export async function GET(request: Request) {
 *   const rateLimitResult = withRateLimit(request, RATE_LIMITS.errors);
 *   if (rateLimitResult) {
 *     return rateLimitResult; // Returns 429 response
 *   }
 *   // ... handle request
 * }
 * ```
 */
export function withRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMITS.general
): Response | null {
  const result = checkRateLimit(request, config);

  if (!result.success) {
    logger.error('RATE_LIMIT', `Request blocked - limit exceeded (${result.limit} requests per ${config.windowMs}ms)`);

    return new Response(
      JSON.stringify({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Please try again later.`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        limit: result.limit,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": result.limit.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.resetTime.toString(),
        },
      }
    );
  }

  // Add rate limit headers to successful response (caller should include these)
  return null;
}

/**
 * Get rate limit headers to include in successful responses
 */
export function getRateLimitHeaders(
  request: Request,
  config: RateLimitConfig = RATE_LIMITS.general
): Record<string, string> {
  const result = checkRateLimit(request, config);

  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.resetTime.toString(),
  };
}

/**
 * Reset rate limit for a specific client (for testing or admin override)
 */
export function resetRateLimit(request: Request, config: RateLimitConfig): void {
  const clientId = getClientIdentifier(request);
  const key = `${clientId}:${config.windowMs}:${config.maxRequests}`;
  rateLimitStore.delete(key);
  logger.info('RATE_LIMIT', `Reset for client: ${clientId.split(":")[0]}`);
}
