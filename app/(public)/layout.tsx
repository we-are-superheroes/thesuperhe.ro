import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { PlatformShell } from '@/components/platform/platform-shell'
import { PublicNavbar } from '@/components/public/navbar'

/**
 * Layout for routes that are readable by anyone but useful to signed-in
 * members in their authenticated shell. Today: the project browse page
 * and individual project view. Anonymous visitors get a marketing-style
 * top nav; signed-in members get the same sidebar + drawer shell as the
 * (platform) routes.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()

  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicNavbar />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    )
  }

  // Signed-in: load the same data the (platform) layout fetches so the
  // sidebar shows the right counts.
  const [user, unreadNotifications] = await Promise.all([
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
          },
        },
      },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
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

  const uniqueProjectIds = new Set(user?.contributions?.map((c) => c.projectId) ?? [])
  const projectCount = uniqueProjectIds.size
  const stepCount = user?.contributions?.filter((c) => c.projectStepId != null).length ?? 0
  const hoursContributed =
    user?.contributions?.reduce((sum, c) => sum + c.hoursContributed, 0) ?? 0

  return (
    <PlatformShell
      userName={name}
      userInitials={initials}
      projectCount={projectCount}
      stepCount={stepCount}
      hoursContributed={hoursContributed}
      notificationsBadge={unreadNotifications}
    >
      {children}
    </PlatformShell>
  )
}
