'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { isCurrentUserAdmin } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import type { ServerActionResult } from '@/types'

const MAX_UPDATE_LENGTH = 5000

function validateBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim()
  if (!body) return { ok: false, error: 'An update needs some text.' }
  if (body.length > MAX_UPDATE_LENGTH) {
    return { ok: false, error: `Updates are capped at ${MAX_UPDATE_LENGTH} characters.` }
  }
  return { ok: true, body }
}

export async function postUpdateAction(
  projectId: string,
  rawBody: string,
  visibility: 'public' | 'members',
): Promise<ServerActionResult<{ id: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const validated = validateBody(rawBody)
  if (!validated.ok) return { success: false, error: validated.error }

  // Only the project lead can post updates.
  const lead = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId: null, role: 'lead', status: 'active' },
    select: { id: true },
  })
  if (!lead) return { success: false, error: 'Only the project lead can post updates.' }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  })
  if (!project) return { success: false, error: 'Project not found.' }

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'The project lead'

  let createdId: string
  try {
    createdId = await db.$transaction(async (tx) => {
      const created = await tx.projectUpdate.create({
        data: { projectId, authorId: userId, body: validated.body, visibility },
        select: { id: true },
      })

      // Notify active project-level members. Not getActiveProjectMemberIds —
      // that helper includes pending join requests, who can't read
      // members-only updates yet.
      const members = await tx.contribution.findMany({
        where: { projectId, projectStepId: null, status: 'active' },
        select: { userId: true },
      })
      const excerpt =
        validated.body.length > 140 ? `${validated.body.slice(0, 139)}…` : validated.body
      await notify(tx, {
        type: 'project_updated',
        recipients: members.map((m) => m.userId),
        actorId: userId,
        projectId,
        title: `${actorName} posted an update in ${project.title}.`,
        body: excerpt,
        data: { updateId: created.id, visibility },
      })

      return created.id
    })
  } catch {
    return { success: false, error: 'Could not post the update.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/notifications')
  return { success: true, data: { id: createdId } }
}

export async function editUpdateAction(
  updateId: string,
  rawBody: string,
): Promise<ServerActionResult<{ id: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const validated = validateBody(rawBody)
  if (!validated.ok) return { success: false, error: validated.error }

  const update = await db.projectUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, authorId: true, projectId: true },
  })
  if (!update) return { success: false, error: 'Update not found.' }
  if (update.authorId !== userId) {
    return { success: false, error: 'Only the author can edit an update.' }
  }

  try {
    await db.projectUpdate.update({
      where: { id: updateId },
      data: { body: validated.body, editedAt: new Date() },
    })
  } catch {
    return { success: false, error: 'Could not save the edit.' }
  }

  revalidatePath(`/projects/${update.projectId}`)
  return { success: true, data: { id: updateId } }
}

export async function deleteUpdateAction(
  updateId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const update = await db.projectUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, authorId: true, projectId: true },
  })
  if (!update) return { success: false, error: 'Update not found.' }

  // The author can delete their own post; platform admins can moderate any.
  if (update.authorId !== userId && !(await isCurrentUserAdmin())) {
    return { success: false, error: 'You can’t delete this update.' }
  }

  try {
    await db.projectUpdate.delete({ where: { id: updateId } })
  } catch {
    return { success: false, error: 'Could not delete the update.' }
  }

  revalidatePath(`/projects/${update.projectId}`)
  return { success: true, data: { deleted: true } }
}
