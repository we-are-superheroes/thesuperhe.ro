import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MyStepsClient, type MyStep } from '@/components/platform/my-steps-client'

/* ================================================================
   /my-steps — server component.
   Lists every step the signed-in user has actively joined, with
   their total hours logged and the five most recent log entries
   for inline editing. Step status changes happen on the project
   page; this view is about logging time and reviewing history.
   ================================================================ */

const RECENT_LOGS = 5

export default async function MyStepsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

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
            where: { userId },
            orderBy: { loggedOn: 'desc' },
            take: RECENT_LOGS,
            select: {
              id: true,
              hours: true,
              note: true,
              loggedOn: true,
            },
          },
        },
      },
    },
  })

  const steps: MyStep[] = contributions
    .filter((c) => c.projectStep != null)
    .map((c) => {
      const s = c.projectStep!
      return {
        id: s.id,
        contributionId: c.id,
        name: s.title,
        project: { id: s.project.id, title: s.project.title },
        stepStatus: s.status,
        skill: s.skills[0]?.skill.name ?? null,
        isCoordinator: s.coordinatorId === userId,
        hoursLogged: c.hoursContributed,
        recentLogs: s.timeLogs.map((tl) => ({
          id: tl.id,
          hours: tl.hours,
          note: tl.note,
          loggedOnMs: tl.loggedOn.getTime(),
        })),
      }
    })

  return <MyStepsClient steps={steps} />
}
