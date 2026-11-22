import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { countUnreadConversations } from '@/lib/messages'
import { PlatformShell } from '@/components/platform/platform-shell'
import { PublicNavbar } from '@/components/public/navbar'
import { isCuratorRole } from '@/lib/places'
import { ensureUserExists } from '@/lib/users'
import { GroupIntlProvider } from '@/i18n/provider'

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
      <GroupIntlProvider group="public">
        <div className="flex min-h-screen flex-col">
          <PublicNavbar />
          <main className="flex flex-1 flex-col">{children}</main>
        </div>
      </GroupIntlProvider>
    )
  }

  // Presence ping (fire-and-forget) so the "online" dot stays accurate
  // even while the user is browsing public routes.
  void db.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {})

  // Signed-in: load the same data the (platform) layout fetches so the
  // sidebar shows the right counts.
  const [foundUser, unreadNotifications, messagesBadge] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        role: true,
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

  // First signed-in page load without a row in our database (the Clerk
  // webhook was slow, or never arrived): create it now, so the member exists
  // for everything that looks people up — not only once they first save
  // something. A new row has no contributions, so the counts below stay zero.
  let user = foundUser
  if (!user && (await ensureUserExists(userId)).success) {
    const created = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true },
    })
    if (created) user = { ...created, contributions: [] }
  }

  const name = user?.name ?? null
  const isAdmin = user?.role === 'admin'
  const isCurator = isCuratorRole(user?.role)
  // Map suggestions waiting for a curator — only counted for people who can decide them.
  const placeReviewBadge = isCurator
    ? await db.placeProposal.count({ where: { status: 'pending' } })
    : 0
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
  // Badge = steps still to do: joined and not yet completed.
  const stepCount =
    user?.contributions?.filter(
      (c) => c.projectStepId != null && c.projectStep?.status !== 'completed',
    ).length ?? 0
  const hoursContributed =
    user?.contributions?.reduce((sum, c) => sum + c.hoursContributed, 0) ?? 0

  return (
    <GroupIntlProvider group="public">
      <PlatformShell
        userName={name}
        userInitials={initials}
        projectCount={projectCount}
        stepCount={stepCount}
        hoursContributed={hoursContributed}
        notificationsBadge={unreadNotifications}
        messagesBadge={messagesBadge}
        isAdmin={isAdmin}
        isCurator={isCurator}
        placeReviewBadge={placeReviewBadge}
      >
        {children}
      </PlatformShell>
    </GroupIntlProvider>
  )
}
