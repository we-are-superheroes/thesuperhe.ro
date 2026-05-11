import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { NotificationsClient, type NotificationItem } from '@/components/platform/notifications-client'

/* ================================================================
   NOTIFICATIONS — server component
   We don't have a Notification table; we derive an activity feed
   from existing data. Items have stable synthetic ids so the
   client-side "last viewed" timestamp in localStorage can mark
   anything created after it as unread.
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

const NOW = Date.now()
const DAY = 24 * 60 * 60 * 1000
const THIRTY_DAYS_AGO = new Date(NOW - 30 * DAY)
const SEVEN_DAYS_AGO = new Date(NOW - 7 * DAY)

export default async function NotificationsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // ── 1) New contributors to projects where I'm lead ──────────
  const newContributors = await db.contribution.findMany({
    where: {
      projectStepId: null,
      userId: { not: userId },
      joinedAt: { gte: THIRTY_DAYS_AGO },
      status: { in: ['active', 'pending'] },
      project: {
        contributions: {
          some: {
            userId,
            role: 'lead',
            projectStepId: null,
            status: { in: ['active', 'pending'] },
          },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      joinedAt: true,
      role: true,
      user: { select: { id: true, name: true } },
      project: {
        select: {
          id: true,
          title: true,
          projectType: { select: { name: true } },
        },
      },
    },
  })

  // ── 2) Steps completed in projects I'm in, by others ────────
  const stepsCompleted = await db.projectStep.findMany({
    where: {
      status: 'done',
      completedAt: { gte: THIRTY_DAYS_AGO, not: null },
      assignedToId: { not: userId },
      project: {
        contributions: {
          some: {
            userId,
            projectStepId: null,
            status: { in: ['active', 'pending'] },
          },
        },
      },
    },
    orderBy: { completedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      completedAt: true,
      assignedTo: { select: { id: true, name: true } },
      project: {
        select: {
          id: true,
          title: true,
          projectType: { select: { name: true } },
        },
      },
    },
  })

  // ── 3) Idle steps assigned to me ────────────────────────────
  const idleSteps = await db.projectStep.findMany({
    where: {
      assignedToId: userId,
      status: { in: ['in_progress', 'needs_help'] },
      updatedAt: { lte: SEVEN_DAYS_AGO },
    },
    orderBy: { updatedAt: 'asc' },
    take: 5,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      project: {
        select: {
          id: true,
          title: true,
          projectType: { select: { name: true } },
        },
      },
    },
  })

  // ── 4) Skill match: projects with open steps needing one of my seeking skills
  const me = await db.user.findUnique({
    where: { id: userId },
    select: {
      skills: {
        where: { isSeeking: true },
        select: { skill: { select: { id: true, name: true } } },
      },
    },
  })
  const seekingSkillIds = (me?.skills ?? []).map((s) => s.skill.id)

  let skillMatches: Array<{
    id: string
    project: { id: string; title: string; typeName: string | null }
    skill: { name: string }
    createdAt: Date
  }> = []

  if (seekingSkillIds.length > 0) {
    const candidates = await db.projectStep.findMany({
      where: {
        status: 'needs_help',
        createdAt: { gte: THIRTY_DAYS_AGO },
        assignedToId: null,
        // Project I'm not already a member of
        project: {
          contributions: { none: { userId, projectStepId: null } },
        },
        skills: { some: { skillId: { in: seekingSkillIds } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        project: {
          select: { id: true, title: true, projectType: { select: { name: true } } },
        },
        skills: {
          where: { skillId: { in: seekingSkillIds } },
          take: 1,
          select: { skill: { select: { name: true } } },
        },
      },
    })

    skillMatches = candidates
      .filter((c) => c.skills[0])
      .map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        project: {
          id: c.project.id,
          title: c.project.title,
          typeName: c.project.projectType?.name ?? null,
        },
        skill: { name: c.skills[0].skill.name },
      }))
  }

  // ── Compose into NotificationItem[] ──────────────────────────
  const items: NotificationItem[] = []

  for (const c of newContributors) {
    items.push({
      id: `join-${c.id}`,
      type: 'join',
      ts: c.joinedAt.getTime(),
      actor: {
        name: c.user.name,
        initials: initialsFor(c.user.name),
        tint: tintFor(c.user.id),
      },
      project: {
        id: c.project.id,
        name: c.project.title,
        tint: (c.project.projectType?.name && TYPE_TINT[c.project.projectType.name]) ?? DEFAULT_TINT,
      },
      meta:
        c.role === 'lead'
          ? 'Joined as lead.'
          : c.role === 'advisor'
            ? 'Joined as an advisor.'
            : 'Joined as a contributor.',
    })
  }

  for (const s of stepsCompleted) {
    if (!s.assignedTo || !s.completedAt) continue
    items.push({
      id: `step-${s.id}`,
      type: 'step',
      ts: s.completedAt.getTime(),
      actor: {
        name: s.assignedTo.name,
        initials: initialsFor(s.assignedTo.name),
        tint: tintFor(s.assignedTo.id),
      },
      project: {
        id: s.project.id,
        name: s.project.title,
        tint: (s.project.projectType?.name && TYPE_TINT[s.project.projectType.name]) ?? DEFAULT_TINT,
      },
      step: s.title,
    })
  }

  for (const s of idleSteps) {
    const idleDays = Math.max(1, Math.floor((NOW - s.updatedAt.getTime()) / DAY))
    items.push({
      id: `reminder-${s.id}`,
      type: 'reminder',
      ts: s.updatedAt.getTime(),
      project: {
        id: s.project.id,
        name: s.project.title,
        tint: (s.project.projectType?.name && TYPE_TINT[s.project.projectType.name]) ?? DEFAULT_TINT,
      },
      step: s.title,
      idleDays,
    })
  }

  for (const m of skillMatches) {
    items.push({
      id: `skill-${m.id}`,
      type: 'skill',
      ts: m.createdAt.getTime(),
      project: {
        id: m.project.id,
        name: m.project.title,
        tint: (m.project.typeName && TYPE_TINT[m.project.typeName]) ?? DEFAULT_TINT,
      },
      skill: m.skill.name,
    })
  }

  // Newest first
  items.sort((a, b) => b.ts - a.ts)

  return <NotificationsClient initialItems={items} />
}
