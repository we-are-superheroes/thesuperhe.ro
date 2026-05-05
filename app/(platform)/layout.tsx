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
    select: { name: true },
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={name} userInitials={initials} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
