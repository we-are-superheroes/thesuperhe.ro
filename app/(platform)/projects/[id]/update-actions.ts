'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { tError } from '@/lib/errors'
import { db } from '@/lib/db'
import { isCurrentUserAdmin } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import { validateUpdateBody } from '@/lib/validation'
import type { ServerActionResult } from '@/types'

export async function postUpdateAction(
  projectId: string,
  rawBody: string,
  visibility: 'public' | 'members',
): Promise<ServerActionResult<{ id: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  // Every post notifies all members — throttle the fanout.
  const rl = rateLimit(`${userId}:post-update`, 5, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const validated = validateUpdateBody(rawBody)
  if (!validated.ok) return { success: false, error: await tError(validated.error) }

  // Only the project lead can post updates.
  const lead = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId: null, role: 'lead', status: 'active' },
    select: { id: true },
  })
  if (!lead) return { success: false, error: t('updates.onlyLead') }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  })
  if (!project) return { success: false, error: t('updates.projectNotFound') }

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
        take: 500, // fanout ceiling — revisit with digests if teams get bigger
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
    return { success: false, error: t('updates.postFailed') }
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
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const validated = validateUpdateBody(rawBody)
  if (!validated.ok) return { success: false, error: await tError(validated.error) }

  const update = await db.projectUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, authorId: true, projectId: true },
  })
  if (!update) return { success: false, error: t('updates.notFound') }
  if (update.authorId !== userId) {
    return { success: false, error: t('updates.onlyAuthorEdit') }
  }

  try {
    await db.projectUpdate.update({
      where: { id: updateId },
      data: { body: validated.body, editedAt: new Date() },
    })
  } catch {
    return { success: false, error: t('updates.editFailed') }
  }

  revalidatePath(`/projects/${update.projectId}`)
  return { success: true, data: { id: updateId } }
}

export async function deleteUpdateAction(
  updateId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const update = await db.projectUpdate.findUnique({
    where: { id: updateId },
    select: { id: true, authorId: true, projectId: true },
  })
  if (!update) return { success: false, error: t('updates.notFound') }

  // The author can delete their own post; platform admins can moderate any.
  if (update.authorId !== userId && !(await isCurrentUserAdmin())) {
    return { success: false, error: t('updates.cantDelete') }
  }

  try {
    await db.projectUpdate.delete({ where: { id: updateId } })
  } catch {
    return { success: false, error: t('updates.deleteFailed') }
  }

  revalidatePath(`/projects/${update.projectId}`)
  return { success: true, data: { deleted: true } }
}
