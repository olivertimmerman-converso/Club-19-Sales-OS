/**
 * Club 19 Sales OS - Authentication Helpers
 */

import { auth } from '@clerk/nextjs/server';
import { UserRole } from './rbac';

/**
 * Clerk session claims with typed metadata
 */
interface ClerkSessionClaims {
  email?: string;
  name?: string;
  publicMetadata?: {
    role?: UserRole;
    staffRole?: UserRole;  // Support production field name
    xero?: {
      accessToken?: string;
      refreshToken?: string;
      tenantId?: string;
      expiresAt?: number;
    };
  };
}

/**
 * Get the current user's role from Clerk publicMetadata
 */
export async function getUserRole(): Promise<UserRole | null> {
  const { userId, sessionClaims } = await auth();

  if (!userId || !sessionClaims) {
    return null;
  }

  // Read role from Clerk publicMetadata
  // Support both 'staffRole' and 'role' fields for production compatibility
  const claims = sessionClaims as ClerkSessionClaims;
  const metadata = claims.publicMetadata;
  const role = metadata?.staffRole || metadata?.role;

  if (!role) {
    // Default to 'shopper' if no role is set
    return 'shopper';
  }

  return role;
}

/**
 * Get the current user's full information
 */
export async function getCurrentUser() {
  const { userId, sessionClaims } = await auth();

  if (!userId || !sessionClaims) {
    return null;
  }

  const claims = sessionClaims as ClerkSessionClaims;
  const metadata = claims.publicMetadata;
  const role = metadata?.staffRole || metadata?.role || 'shopper';
  const xero = metadata?.xero;

  return {
    userId,
    email: claims.email,
    name: claims.name,
    role,
    xero,
  };
}
