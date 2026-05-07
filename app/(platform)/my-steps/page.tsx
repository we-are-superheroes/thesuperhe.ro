import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { MyStepsClient, type MyStep } from '@/components/platform/my-steps-client'

export default async function MyStepsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const rows = await db.projectStep.findMany({
    where: {
      assignedToId: userId,
      // Skip 'skipped' — keep only states the user might toggle
      status: { in: ['needs_help', 'in_progress', 'not_started', 'done'] },
    },
    orderBy: [{ updatedAt: 'desc' }, { order: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      project: { select: { id: true, title: true } },
      skills: {
        select: { skill: { select: { name: true } } },
      },
    },
  })

  const steps: MyStep[] = rows.map((s) => ({
    id: s.id,
    name: s.title,
    project: { id: s.project.id, title: s.project.title },
    skill: s.skills[0]?.skill.name ?? null,
    status: s.status === 'done' ? 'closed' : 'open',
    addedAtMs: s.updatedAt.getTime(),
  }))

  return <MyStepsClient steps={steps} />
}
