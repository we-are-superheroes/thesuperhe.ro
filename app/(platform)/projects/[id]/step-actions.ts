'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import type { StepStatus } from '@prisma/client'
import { db } from '@/lib/db'
import {
  notify,
  getProjectLeadIds,
  getActiveProjectMemberIds,
} from '@/lib/notifications'
import type { ServerActionResult } from '@/types'

/* ================================================================
   setStepStatusAction — free state machine.
   Any active member of the project can change any step's status to
   any of the five values. The contribution status on a step-level
   row is kept in sync (active vs completed) so dashboard counts and
   "my steps" lists stay coherent. step_completed and step_needs_help
   notifications fan out on the transitions that matter.
   ================================================================ */

const VALID_STATUSES = new Set<StepStatus>([
  'open',
  'defining',
  'in_progress',
  'needs_help',
  'completed',
])

export async function setStepStatusAction(
  projectId: string,
  stepId: string,
  next: StepStatus,
): Promise<ServerActionResult<{ status: StepStatus }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  if (!VALID_STATUSES.has(next)) {
    return { success: false, error: 'Unknown status.' }
  }

  const step = await db.projectStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      assignedToId: true,
      project: { select: { id: true, title: true } },
    },
  })
  if (!step || step.projectId !== projectId) {
    return { success: false, error: 'Step not found.' }
  }

  // Authz: must be an active (or pending) member of the project, on any
  // contribution row. This matches the design's "anyone in the project can
  // change a step's state" footer.
  const myMembership = await db.contribution.findFirst({
    where: {
      userId,
      projectId,
      status: { in: ['active', 'pending'] },
    },
    select: { id: true },
  })
  if (!myMembership) {
    return { success: false, error: 'Join the project to change step statuses.' }
  }

  const prev = step.status as StepStatus
  if (prev === next) return { success: true, data: { status: next } }

  const actor = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })
  const actorName = actor?.name ?? 'A contributor'

  try {
    await db.$transaction(async (tx) => {
      await tx.projectStep.update({
        where: { id: stepId },
        data: {
          status: next,
          completedAt: next === 'completed' ? new Date() : null,
        },
      })

      // Keep the step-level contribution status in sync for the assignee.
      if (step.assignedToId) {
        await tx.contribution.updateMany({
          where: {
            userId: step.assignedToId,
            projectId,
            projectStepId: stepId,
          },
          data: {
            status: next === 'completed' ? 'completed' : 'active',
          },
        })
      }

      // step_completed fans out on the open → done transition.
      if (next === 'completed' && prev !== 'completed') {
        const recipients = await getActiveProjectMemberIds(tx, projectId)
        await notify(tx, {
          type: 'step_completed',
          recipients,
          actorId: userId,
          projectId,
          stepId,
          title: `${actorName} finished “${step.title}” in ${step.project.title}.`,
        })
      }

      // step_needs_help: ping the leads when a step is flipped into need.
      if (next === 'needs_help' && prev !== 'needs_help') {
        const leadIds = await getProjectLeadIds(tx, projectId)
        await notify(tx, {
          type: 'step_needs_help',
          recipients: leadIds,
          actorId: userId,
          projectId,
          stepId,
          title: `${actorName} flagged “${step.title}” as needing help in ${step.project.title}.`,
        })
      }
    })
  } catch {
    return { success: false, error: 'Could not update the step.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my-steps')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  revalidatePath('/notifications')
  return { success: true, data: { status: next } }
}
