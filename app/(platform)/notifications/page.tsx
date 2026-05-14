import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import {
  NotificationsClient,
  type NotificationItem,
  type NotificationType,
} from '@/components/platform/notifications-client'

/* ================================================================
   /notifications — server component.
   Pulls real Notification rows from the DB and hands them to the
   client for tab filtering + rendering.
   ================================================================ */

const TYPE_TINT: Record<string, string> = {
  'Community Energy': '#F4A535',
  'Urban Rewilding': '#3DAF7C',
  'Repair & Reuse': '#F7BD64',
  'Policy Advocacy': '#B2D0F5',
  'Food & Agriculture': '#7DD3B0',
  'Transport & Mobility': '#FAD08F',
  'Water & Conservation': '#7AAEE8',
  'Education & Awareness': '#F4A535',
  Biodiversity: '#3DAF7C',
  'Waste Reduction': '#F7BD64',
}
const DEFAULT_TINT = '#7AAEE8'

const AVATAR_TINTS = ['#F7BD64', '#B2D0F5', '#7DD3B0', '#FAD08F', '#7AAEE8', '#F09898']
function tintFor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length]
}
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export default async function NotificationsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      actor: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, projectType: { select: { name: true } } } },
    },
  })

  const items: NotificationItem[] = rows.map((n) => ({
    id: n.id,
    type: n.type as NotificationType,
    ts: n.createdAt.getTime(),
    readAt: n.readAt ? n.readAt.getTime() : null,
    resolvedAt: n.resolvedAt ? n.resolvedAt.getTime() : null,
    title: n.title,
    body: n.body ?? null,
    actor: n.actor
      ? {
          id: n.actor.id,
          name: n.actor.name,
          initials: initialsFor(n.actor.name),
          tint: tintFor(n.actor.id),
        }
      : undefined,
    project: n.project
      ? {
          id: n.project.id,
          name: n.project.title,
          tint: (n.project.projectType?.name && TYPE_TINT[n.project.projectType.name]) ?? DEFAULT_TINT,
        }
      : undefined,
    data: (n.data as Record<string, unknown> | null) ?? null,
  }))

  return <NotificationsClient initialItems={items} />
}
