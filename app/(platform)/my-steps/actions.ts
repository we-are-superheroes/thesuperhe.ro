'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { ServerActionResult } from '@/types'

/**
 * Tick / un-tick a step the signed-in user owns.
 *  - Open  → done
 *  - Done  → in_progress (so it returns to the user's "open" list)
 * Step-level Contribution status is updated to match.
 */
export async function toggleStepDoneAction(
  projectStepId: string,
): Promise<ServerActionResult<{ status: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const step = await db.projectStep.findUnique({
    where: { id: projectStepId },
    select: { id: true, projectId: true, assignedToId: true, status: true },
  })
  if (!step) return { success: false, error: 'Step not found.' }
  if (step.assignedToId !== userId) {
    return { success: false, error: 'This step isn’t assigned to you.' }
  }

  const wasDone = step.status === 'done'
  const nextStatus = wasDone ? 'in_progress' : 'done'

  try {
    await db.$transaction([
      db.projectStep.update({
        where: { id: projectStepId },
        data: {
          status: nextStatus,
          completedAt: wasDone ? null : new Date(),
        },
      }),
      db.contribution.updateMany({
        where: { userId, projectId: step.projectId, projectStepId },
        data: { status: wasDone ? 'active' : 'completed' },
      }),
    ])
  } catch {
    return { success: false, error: 'Could not update the step.' }
  }

  revalidatePath('/my-steps')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${step.projectId}`)
  return { success: true, data: { status: nextStatus } }
}
