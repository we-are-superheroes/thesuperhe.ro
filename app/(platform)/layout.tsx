import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { Sidebar } from '@/components/platform/sidebar'

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await db.user.findUnique({
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
  })

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
  const stepCount = user?.contributions?.filter((c) => c.projectStepId != null).length ?? 0
  const hoursContributed = user?.contributions?.reduce((sum, c) => sum + c.hoursContributed, 0) ?? 0

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userName={name}
        userInitials={initials}
        projectCount={projectCount}
        stepCount={stepCount}
        hoursContributed={hoursContributed}
      />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
