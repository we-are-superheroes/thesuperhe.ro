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

      // Keep all step-level contributions on this step in sync — every
      // joiner's row moves to "completed" when the step is done, and back to
      // "active" if the step is re-opened.
      await tx.contribution.updateMany({
        where: {
          projectId,
          projectStepId: stepId,
          status: { in: ['active', 'completed'] },
        },
        data: {
          status: next === 'completed' ? 'completed' : 'active',
        },
      })

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

/* ================================================================
   setStepCoordinatorAction — project-lead-only.
   The coordinator must be one of the step's current active joiners (or
   `null` to clear). UI on /modify offers exactly those choices.
   ================================================================ */

export async function setStepCoordinatorAction(
  projectId: string,
  stepId: string,
  nextCoordinatorId: string | null,
): Promise<ServerActionResult<{ coordinatorId: string | null }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  // Authz: project lead only.
  const lead = await db.contribution.findFirst({
    where: {
      userId,
      projectId,
      projectStepId: null,
      role: 'lead',
      status: { in: ['active', 'pending'] },
    },
    select: { id: true },
  })
  if (!lead) {
    return { success: false, error: 'Only the project lead can change coordinators.' }
  }

  const step = await db.projectStep.findUnique({
    where: { id: stepId },
    select: { id: true, projectId: true },
  })
  if (!step || step.projectId !== projectId) {
    return { success: false, error: 'Step not found.' }
  }

  // If a non-null coordinator is requested, they must currently be on the
  // step. This guards against picking someone who left.
  if (nextCoordinatorId) {
    const onStep = await db.contribution.findFirst({
      where: {
        userId: nextCoordinatorId,
        projectId,
        projectStepId: stepId,
        status: 'active',
      },
      select: { id: true },
    })
    if (!onStep) {
      return {
        success: false,
        error: 'That user isn’t currently on this step.',
      }
    }
  }

  await db.projectStep.update({
    where: { id: stepId },
    data: { coordinatorId: nextCoordinatorId },
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/edit`)
  return { success: true, data: { coordinatorId: nextCoordinatorId } }
}
