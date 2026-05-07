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

  try {
    await db.contribution.update({
      where: { id: existing.id },
      data: { status: 'withdrawn' },
    })
  } catch {
    return { success: false, error: 'Could not leave project.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  return { success: true, data: { left: true } }
}
