import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MyProjectsClient, type MyProject } from '@/components/platform/my-projects-client'

const TYPE_IMG_KEY: Record<string, string> = {
  'Community Energy': 'energy',
  'Urban Rewilding': 'rewild',
  'Repair & Reuse': 'circular',
  'Policy Advocacy': 'policy',
  'Food & Agriculture': 'food',
  'Transport & Mobility': 'mobility',
  'Water & Conservation': 'water',
  'Education & Awareness': 'education',
  Biodiversity: 'rewild',
  'Waste Reduction': 'circular',
  'Climate Finance': 'energy',
  'Research & Data': 'policy',
  'Built Environment': 'mobility',
  'Ocean & Marine': 'water',
}

/** Elapsed ms — module-scope so the wall-clock read stays out of render. */
function msSince(d: Date): number {
  return Date.now() - d.getTime()
}

function humanise(d: Date): string {
  const ms = msSince(d)
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`
  return `${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`
}

function dueLabel(due: Date | null): { text: string; urgent: boolean; sort: number } {
  if (!due) return { text: 'When you can', urgent: false, sort: 9999 }
  const days = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0)
    return { text: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`, urgent: true, sort: -days }
  if (days === 0) return { text: 'Due today', urgent: true, sort: 0 }
  if (days === 1) return { text: 'Due tomorrow', urgent: true, sort: 1 }
  if (days <= 7) return { text: `Due in ${days} days`, urgent: days <= 3, sort: days }
  if (days <= 14) return { text: 'Due in 1 week', urgent: false, sort: days }
  return { text: `Due in ${days} days`, urgent: false, sort: days }
}

const STEP_PRIORITY: Record<string, number> = {
  needs_help: 0,
  in_progress: 1,
  defining: 2,
  open: 3,
}

export default async function MyProjectsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const contributions = await db.contribution.findMany({
    where: { userId, projectStepId: null },
    select: {
      role: true,
      status: true,
      hoursContributed: true,
      joinedAt: true,
      project: {
        select: {
          id: true,
          title: true,
          location: true,
          status: true,
          updatedAt: true,
          coverImageUrl: true,
          projectType: { select: { name: true } },
          steps: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              title: true,
              status: true,
              order: true,
              dueDate: true,
              contributions: {
                where: { userId, status: 'active' },
                select: { id: true },
              },
            },
          },
          contributions: {
            where: { projectStepId: null, status: { in: ['active', 'pending'] } },
            select: {
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })

  const projects: MyProject[] = contributions.map((c) => {
    const p = c.project
    const totalSteps = p.steps.length
    const doneSteps = p.steps.filter((s) => s.status === 'completed').length
    const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0

    // Status bucket
    let bucket: 'active' | 'finished' | 'archived'
    if (c.status === 'withdrawn') bucket = 'archived'
    else if (p.status === 'completed') bucket = 'finished'
    else bucket = 'active'

    // My next step: any step I've joined that isn't done, ordered by status
    // priority then order. With multi-joiner steps, "joined" is determined by
    // whether the user has an active step-level contribution.
    const mySteps = p.steps
      .filter(
        (s) =>
          s.contributions.length > 0 &&
          (s.status === 'needs_help' ||
            s.status === 'in_progress' ||
            s.status === 'defining' ||
            s.status === 'open'),
      )
      .sort(
        (a, b) =>
          (STEP_PRIORITY[a.status] ?? 99) - (STEP_PRIORITY[b.status] ?? 99) || a.order - b.order,
      )
    const next = mySteps[0]
    const due = next ? dueLabel(next.dueDate) : null
    const nextStep = next && due
      ? {
          id: next.id,
          name: next.title,
          // Map StepStatus → card status indicator key
          status: (next.status === 'needs_help'
            ? 'needs_help'
            : next.status === 'in_progress'
              ? 'in_progress'
              : 'review') as 'needs_help' | 'in_progress' | 'review',
          due: due.text,
          urgent: due.urgent,
          dueSort: due.sort,
        }
      : null

    // Contributor initials (deduped, deterministic order)
    const seenIds = new Set<string>()
    const contributorInitials: string[] = []
    for (const cc of p.contributions) {
      if (cc.user && !seenIds.has(cc.user.id)) {
        seenIds.add(cc.user.id)
        const initial = cc.user.name.trim().charAt(0).toUpperCase() || '?'
        contributorInitials.push(initial)
      }
    }

    return {
      id: p.id,
      title: p.title,
      type: p.projectType?.name ?? 'Other',
      imgKey: (p.projectType?.name && TYPE_IMG_KEY[p.projectType.name]) ?? 'rewild',
      coverImageUrl: p.coverImageUrl ?? null,
      location: p.location ?? 'Remote',
      role: c.role,
      status: bucket,
      progress,
      contributors: contributorInitials.length,
      contributorInitials,
      lastActivity: humanise(p.updatedAt),
      lastActivityMs: msSince(p.updatedAt),
      hoursContributed: c.hoursContributed,
      nextStep,
    }
  })

  // Quick stats
  const activeProjects = projects.filter((p) => p.status === 'active')
  const openSteps = activeProjects.reduce((n, p) => n + (p.nextStep ? 1 : 0), 0)
  const totalHours = projects.reduce((n, p) => n + p.hoursContributed, 0)

  return (
    <MyProjectsClient
      projects={projects}
      stats={{
        active: activeProjects.length,
        openSteps,
        totalHours,
      }}
    />
  )
}
