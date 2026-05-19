import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MyStepsClient, type MyStep } from '@/components/platform/my-steps-client'

/* ================================================================
   /my-steps — server component.
   Lists every step the signed-in user has actively joined, with
   the same time-logging UI used on the project page: a per-step
   summary row plus a popover form that lets the user add or
   delete log entries. Status changes happen on the project page.
   ================================================================ */

const RECENT_LOGS = 4

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export default async function MyStepsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Steps I've joined.
  const contributions = await db.contribution.findMany({
    where: {
      userId,
      projectStepId: { not: null },
      status: { in: ['active', 'completed'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      status: true,
      hoursContributed: true,
      projectStep: {
        select: {
          id: true,
          title: true,
          status: true,
          order: true,
          coordinatorId: true,
          project: { select: { id: true, title: true } },
          skills: { select: { skill: { select: { name: true } } } },
          timeLogs: {
            orderBy: { loggedOn: 'desc' },
            take: RECENT_LOGS,
            select: {
              id: true,
              hours: true,
              note: true,
              loggedOn: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })

  // Aggregate per-step total hours + entry count across ALL contributors
  // (not just the caller) so the summary row matches what they see on the
  // project page.
  const stepIds = contributions
    .map((c) => c.projectStep?.id)
    .filter((id): id is string => !!id)
  const stats = stepIds.length
    ? await db.timeLog.groupBy({
        by: ['projectStepId'],
        where: { projectStepId: { in: stepIds } },
        _sum: { hours: true },
        _count: { _all: true },
      })
    : []
  const statsByStep = new Map(
    stats.map((t) => [
      t.projectStepId,
      { total: t._sum.hours ?? 0, count: t._count._all },
    ]),
  )

  const steps: MyStep[] = contributions
    .filter((c) => c.projectStep != null)
    .map((c) => {
      const s = c.projectStep!
      const stat = statsByStep.get(s.id) ?? { total: 0, count: 0 }
      const recentLogs = s.timeLogs.map((tl) => {
        const name = tl.user?.name ?? 'Someone'
        return {
          id: tl.id,
          hours: tl.hours,
          note: tl.note,
          loggedOnMs: tl.loggedOn.getTime(),
          user: tl.user
            ? {
                id: tl.user.id,
                name,
                initials: initialsOf(name),
                isMe: tl.user.id === userId,
              }
            : null,
        }
      })
      const seen = new Set<string>()
      const contributors: { id: string; name: string; initials: string }[] = []
      for (const log of recentLogs) {
        if (!log.user) continue
        if (seen.has(log.user.id)) continue
        seen.add(log.user.id)
        contributors.push({
          id: log.user.id,
          name: log.user.name,
          initials: log.user.initials,
        })
      }
      return {
        id: s.id,
        name: s.title,
        project: { id: s.project.id, title: s.project.title },
        stepStatus: s.status,
        skill: s.skills[0]?.skill.name ?? null,
        isCoordinator: s.coordinatorId === userId,
        myHoursLogged: c.hoursContributed,
        timeLog: {
          stepId: s.id,
          totalHours: stat.total,
          totalEntryCount: stat.count,
          contributors,
          recentLogs,
        },
      }
    })

  return <MyStepsClient steps={steps} />
}
