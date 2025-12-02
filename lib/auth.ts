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
  const claims = sessionClaims as ClerkSessionClaims;
  const role = claims.publicMetadata?.role;

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
  const role = claims.publicMetadata?.role || 'shopper';

  return {
    userId,
    email: claims.email,
    name: claims.name,
    role,
  };
}
