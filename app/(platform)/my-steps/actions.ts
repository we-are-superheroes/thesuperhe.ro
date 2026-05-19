'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { notify, getActiveProjectMemberIds } from '@/lib/notifications'
import type { ServerActionResult } from '@/types'

/**
 * Tick / un-tick a step the signed-in user owns.
 *  - Open  → done   (notify leads + active contributors)
 *  - Done  → in_progress (silent — un-tick isn't notable)
 * Step-level Contribution status is updated to match.
 */
export async function toggleStepDoneAction(
  projectStepId: string,
): Promise<ServerActionResult<{ status: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const step = await db.projectStep.findUnique({
    where: { id: projectStepId },
    select: {
      id: true,
      projectId: true,
      assignedToId: true,
      status: true,
      title: true,
      project: { select: { title: true } },
    },
  })
  if (!step) return { success: false, error: 'Step not found.' }
  if (step.assignedToId !== userId) {
    return { success: false, error: 'This step isn’t assigned to you.' }
  }

  const wasDone = step.status === 'completed'
  const nextStatus = wasDone ? 'in_progress' : 'completed'

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'A contributor'

  try {
    await db.$transaction(async (tx) => {
      await tx.projectStep.update({
        where: { id: projectStepId },
        data: {
          status: nextStatus,
          completedAt: wasDone ? null : new Date(),
        },
      })
      await tx.contribution.updateMany({
        where: { userId, projectId: step.projectId, projectStepId },
        data: { status: wasDone ? 'active' : 'completed' },
      })

      // Only the open → done direction is worth a notification.
      if (!wasDone) {
        const recipients = await getActiveProjectMemberIds(tx, step.projectId)
        await notify(tx, {
          type: 'step_completed',
          recipients,
          actorId: userId,
          projectId: step.projectId,
          stepId: projectStepId,
          title: `${actorName} finished “${step.title}” in ${step.project.title}.`,
        })
      }
    })
  } catch {
    return { success: false, error: 'Could not update the step.' }
  }

  revalidatePath('/my-steps')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${step.projectId}`)
  revalidatePath('/notifications')
  return { success: true, data: { status: nextStatus } }
}
