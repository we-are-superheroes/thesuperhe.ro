'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { ServerActionResult } from '@/types'

/**
 * Ensure a User record exists for the given Clerk userId. The Clerk webhook
 * normally creates this on sign-up, but this fallback prevents a poor UX
 * when the webhook is slow or the user signed up before it was wired up.
 */
async function ensureUserExists(userId: string): Promise<ServerActionResult<void>> {
  const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (existing) return { success: true, data: undefined }

  const cu = await currentUser()
  if (!cu) return { success: false, error: 'Could not load Clerk profile' }

  const email = cu.emailAddresses?.[0]?.emailAddress
  if (!email) return { success: false, error: 'No email on profile' }

  const name =
    [cu.firstName, cu.lastName].filter(Boolean).join(' ') ||
    cu.username ||
    email.split('@')[0]

  try {
    await db.user.create({
      data: {
        id: userId,
        email,
        name,
        avatarUrl: cu.imageUrl ?? null,
      },
    })
    return { success: true, data: undefined }
  } catch {
    // Race condition — another request just created the user. Treat as success.
    const retry = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (retry) return { success: true, data: undefined }
    return { success: false, error: 'Could not create user record' }
  }
}

export async function joinProjectAction(
  projectId: string,
): Promise<ServerActionResult<{ joined: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) return { success: false, error: 'Project not found.' }

  // Project-level uniqueness must be checked manually because Postgres treats
  // NULL != NULL in unique indexes (CLAUDE.md). Reactivate any prior withdrawal.
  const existing = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId: null },
    select: { id: true, status: true },
  })

  try {
    if (existing) {
      if (existing.status === 'active' || existing.status === 'pending') {
        return { success: false, error: 'You’re already in this project.' }
      }
      await db.contribution.update({
        where: { id: existing.id },
        data: { status: 'active' },
      })
    } else {
      await db.contribution.create({
        data: {
          userId,
          projectId,
          projectStepId: null,
          role: 'contributor',
          status: 'active',
        },
      })
    }
  } catch {
    return { success: false, error: 'Could not join project.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  return { success: true, data: { joined: true } }
}

export async function claimStepAction(
  projectId: string,
  projectStepId: string,
): Promise<ServerActionResult<{ claimed: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  // Must be a project-level member to claim steps inside it.
  const membership = await db.contribution.findFirst({
    where: {
      userId,
      projectId,
      projectStepId: null,
      status: { in: ['active', 'pending'] },
    },
    select: { id: true },
  })
  if (!membership) {
    return { success: false, error: 'Join the project before claiming a step.' }
  }

  const step = await db.projectStep.findUnique({
    where: { id: projectStepId },
    select: { id: true, projectId: true, assignedToId: true, status: true },
  })
  if (!step || step.projectId !== projectId) {
    return { success: false, error: 'Step not found in this project.' }
  }
  if (step.assignedToId && step.assignedToId !== userId) {
    return { success: false, error: 'Someone else has already claimed this step.' }
  }

  // Assign step + flip status to in_progress + record a step-level contribution.
  try {
    await db.$transaction([
      db.projectStep.update({
        where: { id: projectStepId },
        data: {
          assignedToId: userId,
          status: step.status === 'needs_help' || step.status === 'not_started' ? 'in_progress' : step.status,
        },
      }),
      // Step-level contribution. The unique index on [userId, projectId, projectStepId]
      // is reliable here because projectStepId is non-null on this row.
      db.contribution.upsert({
        where: {
          userId_projectId_projectStepId: {
            userId,
            projectId,
            projectStepId,
          },
        },
        update: { status: 'active', role: 'contributor' },
        create: {
          userId,
          projectId,
          projectStepId,
          role: 'contributor',
          status: 'active',
        },
      }),
    ])
  } catch {
    return { success: false, error: 'Could not claim step.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  return { success: true, data: { claimed: true } }
}

export async function unclaimStepAction(
  projectId: string,
  projectStepId: string,
): Promise<ServerActionResult<{ unclaimed: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const step = await db.projectStep.findUnique({
    where: { id: projectStepId },
    select: { id: true, projectId: true, assignedToId: true, status: true },
  })
  if (!step || step.projectId !== projectId) {
    return { success: false, error: 'Step not found in this project.' }
  }
  if (step.assignedToId !== userId) {
    return { success: false, error: 'This step isn’t assigned to you.' }
  }

  try {
    await db.$transaction([
      db.projectStep.update({
        where: { id: projectStepId },
        data: {
          assignedToId: null,
          // If the user was actively working it, return the step to the pool.
          status: step.status === 'in_progress' ? 'needs_help' : step.status,
        },
      }),
      db.contribution.updateMany({
        where: { userId, projectId, projectStepId },
        data: { status: 'withdrawn' },
      }),
    ])
  } catch {
    return { success: false, error: 'Could not hand the step back.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  return { success: true, data: { unclaimed: true } }
}

export async function leaveProjectAction(
  projectId: string,
): Promise<ServerActionResult<{ left: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const existing = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId: null },
    select: { id: true, status: true },
  })
  if (!existing || (existing.status !== 'active' && existing.status !== 'pending')) {
    return { success: false, error: 'You’re not in this project.' }
  }

  // Find any steps assigned to this user in this project so we can release
  // them as part of leaving — leaving with steps still on your name would
  // strand the work.
  const assignedSteps = await db.projectStep.findMany({
    where: { projectId, assignedToId: userId },
    select: { id: true, status: true },
  })

  try {
    await db.$transaction([
      // Withdraw the project-level contribution.
      db.contribution.update({
        where: { id: existing.id },
        data: { status: 'withdrawn' },
      }),
      // Unassign every step the user had on this project.
      db.projectStep.updateMany({
        where: { projectId, assignedToId: userId },
        data: { assignedToId: null },
      }),
      // Return any "in_progress" steps to "needs_help" so others can pick up.
      db.projectStep.updateMany({
        where: {
          id: { in: assignedSteps.filter((s) => s.status === 'in_progress').map((s) => s.id) },
        },
        data: { status: 'needs_help' },
      }),
      // Mark step-level contributions in this project as withdrawn.
      db.contribution.updateMany({
        where: {
          userId,
          projectId,
          projectStepId: { not: null },
          status: { in: ['active', 'pending'] },
        },
        data: { status: 'withdrawn' },
      }),
    ])
  } catch {
    return { success: false, error: 'Could not leave project.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  return { success: true, data: { left: true } }
}

