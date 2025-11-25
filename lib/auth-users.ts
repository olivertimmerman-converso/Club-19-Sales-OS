import { ALLOWED_EMAILS } from './constants'

/**
 * Check if user email is authorized to access the app
 */
export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
