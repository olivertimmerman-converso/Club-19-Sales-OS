/**
 * Club 19 Sales OS - Current User Helper
 *
 * Gets current user information from Clerk for filtering
 */

import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import * as logger from './logger';

export interface CurrentUser {
  userId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/**
 * Get the current logged-in user's information from Clerk
 *
 * Used for filtering shopper data to match sales.shopper_name
 *
 * @returns CurrentUser | null - User info or null if not authenticated
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    // Get userId from Clerk auth
    const { userId } = await auth();

    if (!userId) {
      return null;
    }

    // Fetch full user details from Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Build full name (matches shopper_name format)
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    return {
      userId: user.id,
      fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emailAddresses[0]?.emailAddress || null,
    };
  } catch (error) {
    logger.error('AUTH', 'Error fetching user', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
    });
    return null;
  }
}
