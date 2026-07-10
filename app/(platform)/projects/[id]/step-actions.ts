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
   Step lifecycle actions. A step's status is maintained by the
   system (joining/leaving flips open ↔ in_progress); people get two
   controls: "Mark complete / Reopen" and the "Ask for help" toggle
   (helpWanted — orthogonal to status, so a step can be in progress
   AND asking for more hands). All three are gated the same way:
   the project lead can act on any step, everyone else must have
   joined that step.
   ================================================================ */

/** Shared gate: the step (with project title), or a friendly error. */
async function requireStepInvolvement(
  projectId: string,
  stepId: string,
  userId: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true
      step: {
        id: string
        title: string
        status: StepStatus
        helpWanted: boolean
        projectTitle: string
      }
    }
> {
  const step = await db.projectStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      helpWanted: true,
      project: { select: { title: true } },
    },
  })
  if (!step || step.projectId !== projectId) {
    return { ok: false, error: 'Step not found.' }
  }

  const myRows = await db.contribution.findMany({
    where: { userId, projectId, status: { in: ['active', 'pending'] } },
    select: { projectStepId: true, role: true, status: true },
  })
  const isLead = myRows.some((r) => r.projectStepId === null && r.role === 'lead')
  const onStep = myRows.some((r) => r.projectStepId === stepId && r.status === 'active')
  if (!isLead && !onStep) {
    return {
      ok: false,
      error:
        myRows.length === 0
          ? 'Join the project to work on its steps.'
          : 'Join this step before changing it.',
    }
  }

  return {
    ok: true,
    step: {
      id: step.id,
      title: step.title,
      status: step.status,
      helpWanted: step.helpWanted,
      projectTitle: step.project.title,
    },
  }
}

async function actorNameOf(userId: string): Promise<string> {
  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  return actor?.name ?? 'A contributor'
}

function revalidateStepSurfaces(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my-steps')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  revalidatePath('/notifications')
}

/** Mark a step done: sets completedAt, clears the help flag, tells the team. */
export async function completeStepAction(
  projectId: string,
  stepId: string,
): Promise<ServerActionResult<{ status: StepStatus }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const gate = await requireStepInvolvement(projectId, stepId, userId)
  if (!gate.ok) return { success: false, error: gate.error }
  if (gate.step.status === 'completed') {
    return { success: true, data: { status: 'completed' } }
  }

  const actorName = await actorNameOf(userId)

  try {
    await db.$transaction(async (tx) => {
      await tx.projectStep.update({
        where: { id: stepId },
        data: { status: 'completed', completedAt: new Date(), helpWanted: false },
      })
      const recipients = await getActiveProjectMemberIds(tx, projectId)
      await notify(tx, {
        type: 'step_completed',
        recipients,
        actorId: userId,
        projectId,
        stepId,
        title: `${actorName} finished “${gate.step.title}” in ${gate.step.projectTitle}.`,
      })
    })
  } catch {
    return { success: false, error: 'Could not complete the step.' }
  }

  revalidateStepSurfaces(projectId)
  return { success: true, data: { status: 'completed' } }
}

/** Reopen a completed step: back to in_progress if anyone is on it, else open. */
export async function reopenStepAction(
  projectId: string,
  stepId: string,
): Promise<ServerActionResult<{ status: StepStatus }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const gate = await requireStepInvolvement(projectId, stepId, userId)
  if (!gate.ok) return { success: false, error: gate.error }
  if (gate.step.status !== 'completed') {
    return { success: true, data: { status: gate.step.status } }
  }

  try {
    const next = await db.$transaction(async (tx) => {
      const joiners = await tx.contribution.count({
        where: { projectId, projectStepId: stepId, status: 'active' },
      })
      const status: StepStatus = joiners > 0 ? 'in_progress' : 'open'
      await tx.projectStep.update({
        where: { id: stepId },
        data: { status, completedAt: null },
      })
      return status
    })
    revalidateStepSurfaces(projectId)
    return { success: true, data: { status: next } }
  } catch {
    return { success: false, error: 'Could not reopen the step.' }
  }
}

/** Toggle the "Ask for help" flag. Turning it on tells the leads. */
export async function setStepHelpWantedAction(
  projectId: string,
  stepId: string,
  helpWanted: boolean,
): Promise<ServerActionResult<{ helpWanted: boolean }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const gate = await requireStepInvolvement(projectId, stepId, userId)
  if (!gate.ok) return { success: false, error: gate.error }
  if (gate.step.status === 'completed' && helpWanted) {
    return { success: false, error: 'This step is already completed.' }
  }
  if (gate.step.helpWanted === helpWanted) {
    return { success: true, data: { helpWanted } }
  }

  const actorName = await actorNameOf(userId)

  try {
    await db.$transaction(async (tx) => {
      await tx.projectStep.update({
        where: { id: stepId },
        data: { helpWanted },
      })
      if (helpWanted) {
        const leadIds = await getProjectLeadIds(tx, projectId)
        await notify(tx, {
          type: 'step_needs_help',
          recipients: leadIds,
          actorId: userId,
          projectId,
          stepId,
          title: `${actorName} asked for help on “${gate.step.title}” in ${gate.step.projectTitle}.`,
        })
      }
    })
  } catch {
    return { success: false, error: 'Could not update the step.' }
  }

  revalidateStepSurfaces(projectId)
  return { success: true, data: { helpWanted } }
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
