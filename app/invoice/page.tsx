import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import InvoiceFlow from '@/components/InvoiceFlow'
import AccessDenied from '@/components/AccessDenied'
import { ALLOWED_EMAILS } from '@/lib/constants'
import { logAuditEvent } from '@/lib/audit'

export default async function InvoicePage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await currentUser()

  if (!user || !user.emailAddresses?.[0]?.emailAddress) {
    redirect('/sign-in')
  }

  const userEmail = user.emailAddresses[0].emailAddress
  const userName = user.firstName || user.username || 'User'
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || userName

  const isAuthorized = ALLOWED_EMAILS.includes(userEmail)

  if (isAuthorized) {
    await logAuditEvent(
      'USER_LOGIN_SUCCESS',
      { loginTime: new Date().toISOString() },
      {
        email: userEmail,
        userId: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      }
    )

    return (
      <InvoiceFlow
        user={{
          email: userEmail,
          name: userName,
          fullName: fullName,
          imageUrl: user.imageUrl,
        }}
      />
    )
  } else {
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

    return <AccessDenied userEmail={userEmail} userName={fullName} />
  }
}
