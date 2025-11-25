import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import InvoiceFlow from '@/components/InvoiceFlow'
import { logAuditEvent } from '@/lib/audit'

export default async function InvoicePage() {
  // Middleware has already verified auth + authorization
  // This page only renders for authorized users
  const user = await currentUser()

  if (!user || !user.emailAddresses?.[0]?.emailAddress) {
    redirect('/sign-in')
  }

  const userEmail = user.emailAddresses[0].emailAddress
  const userName = user.firstName || user.username || 'User'
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || userName

  // Log successful access
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
}
