import { currentUser } from '@clerk/nextjs/server'
import AccessDenied from '@/components/AccessDenied'
import { logAuditEvent } from '@/lib/audit'

export default async function AccessDeniedPage() {
  const user = await currentUser()

  const userEmail = user?.emailAddresses?.[0]?.emailAddress || 'unknown'
  const fullName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.username || 'User'

  // Log access denial
  if (user) {
    await logAuditEvent(
      'USER_LOGIN_DENIED',
      {
        attemptTime: new Date().toISOString(),
        reason: 'Email not in allowed list',
      },
      {
        email: userEmail,
        userId: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      }
    )
  }

  return <AccessDenied userEmail={userEmail} userName={fullName} />
}
