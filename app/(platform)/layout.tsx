import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { countUnreadConversations } from '@/lib/messages'
import { PlatformShell } from '@/components/platform/platform-shell'

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Presence ping — every authenticated render bumps lastSeenAt so the
  // "online" dot for peers stays accurate. Fire-and-forget; failure here
  // should never block rendering.
  void db.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {})

  const [user, unreadNotifications, messagesBadge] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        contributions: {
          where: { status: { in: ['active', 'pending'] } },
          select: {
            hoursContributed: true,
            projectId: true,
            projectStepId: true,
            projectStep: { select: { status: true } },
          },
        },
      },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
    countUnreadConversations(db, userId),
  ])

  const name = user?.name ?? null
  const initials = name
    ? name
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  // Compute sidebar counts from contributions
  const uniqueProjectIds = new Set(user?.contributions?.map((c) => c.projectId) ?? [])
  const projectCount = uniqueProjectIds.size
  // Badge = steps still to do: joined and not yet completed.
  const stepCount =
    user?.contributions?.filter(
      (c) => c.projectStepId != null && c.projectStep?.status !== 'completed',
    ).length ?? 0
  const hoursContributed = user?.contributions?.reduce((sum, c) => sum + c.hoursContributed, 0) ?? 0

  return (
    <PlatformShell
      userName={name}
      userInitials={initials}
      projectCount={projectCount}
      stepCount={stepCount}
      hoursContributed={hoursContributed}
      notificationsBadge={unreadNotifications}
      messagesBadge={messagesBadge}
    >
      {children}
    </PlatformShell>
  )
}
