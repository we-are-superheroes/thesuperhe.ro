'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { uploadImage, deleteImageByUrl } from '@/lib/storage'
import { notify, getActiveProjectMemberIds } from '@/lib/notifications'
import type { ServerActionResult } from '@/types'

/**
 * Authz helper — confirm the calling user is the project's lead. Returns
 * the project id on success so callers can chain.
 */
async function requireLead(
  userId: string,
  projectId: string,
): Promise<ServerActionResult<{ projectId: string }>> {
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
  if (!lead) return { success: false, error: 'Only the project lead can edit this project.' }
  return { success: true, data: { projectId } }
}

export interface UpdateProjectStepInput {
  /** DB id for an existing step, or null/undefined for a brand new one. */
  id: string | null
  title: string
  description: string
  skillId: string | null
}

export interface UpdateProjectInput {
  title: string
  description: string
  city: string
  country: string
  remote: 'yes' | 'some' | 'no'
  joinApprovalRequired: boolean
  steps: UpdateProjectStepInput[]
}

function buildLocation(city: string, country: string): string | null {
  const c = city.trim()
  const co = country.trim()
  if (c && co && co.toLowerCase() !== 'other / multi-country') return `${c}, ${co}`
  if (c) return c
  if (co && co.toLowerCase() !== 'other / multi-country') return co
  return null
}

function validate(data: UpdateProjectInput): string | null {
  const title = data.title.trim()
  if (!title) return 'Title can’t be empty.'
  if (title.length > 200) return 'Title is too long.'
  const desc = data.description.trim()
  if (!desc) return 'Description can’t be empty.'
  if (!['yes', 'some', 'no'].includes(data.remote)) return 'Pick a remote option.'
  return null
}

/**
 * Update an existing project the signed-in user leads.
 * - Replaces basic fields (title, description, location, remoteOk).
 * - Diff-syncs steps:
 *     • existing form rows update the matching ProjectStep in place
 *     • new form rows insert ProjectSteps at their final order
 *     • removed rows delete the ProjectStep (and its step-level
 *       Contributions, since FK cascade isn't set up on that edge)
 * - Replaces the StepSkill row for each kept/new step with the chosen skill
 *   (or none).
 */
export async function updateProjectAction(
  projectId: string,
  data: UpdateProjectInput,
): Promise<ServerActionResult<{ projectId: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const validationError = validate(data)
  if (validationError) return { success: false, error: validationError }

  // Authz: caller must be the project's lead.
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
  if (!lead) return { success: false, error: 'Only the project lead can edit this project.' }

  // Verify the requested skill ids exist
  const requestedSkillIds = Array.from(
    new Set(data.steps.map((s) => s.skillId).filter((id): id is string => !!id)),
  )
  if (requestedSkillIds.length > 0) {
    const realSkills = await db.skill.findMany({
      where: { id: { in: requestedSkillIds } },
      select: { id: true },
    })
    const realIds = new Set(realSkills.map((s) => s.id))
    for (const s of data.steps) {
      if (s.skillId && !realIds.has(s.skillId)) {
        return { success: false, error: 'Unknown skill on one of the steps.' }
      }
    }
  }

  // Filter out empty step rows
  const cleanSteps = data.steps
    .map((s) => ({ ...s, title: s.title.trim(), description: s.description.trim() }))
    .filter((s) => s.title.length > 0)

  // Verify any "existing" ids actually belong to this project
  const submittedIds = cleanSteps
    .map((s) => s.id)
    .filter((id): id is string => !!id && !id.startsWith('tmp-'))
  if (submittedIds.length > 0) {
    const found = await db.projectStep.findMany({
      where: { id: { in: submittedIds }, projectId },
      select: { id: true },
    })
    const foundIds = new Set(found.map((s) => s.id))
    for (const id of submittedIds) {
      if (!foundIds.has(id)) {
        return { success: false, error: 'One of the steps doesn’t belong to this project.' }
      }
    }
  }

  // Capture the pre-update project for the notification title.
  const projectBefore = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  })

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'The project lead'

  try {
    await db.$transaction(async (tx) => {
      // Update project basics
      await tx.project.update({
        where: { id: projectId },
        data: {
          title: data.title.trim(),
          description: data.description.trim(),
          location: buildLocation(data.city, data.country),
          remoteOk: data.remote === 'yes' || data.remote === 'some',
          joinApprovalRequired: data.joinApprovalRequired,
        },
      })

      // Determine which existing steps were removed.
      const existingSteps = await tx.projectStep.findMany({
        where: { projectId },
        select: { id: true },
      })
      const existingIds = new Set(existingSteps.map((s) => s.id))
      const keptIds = new Set(submittedIds)
      const removedIds = [...existingIds].filter((id) => !keptIds.has(id))

      // Remove step-level contributions for steps about to be deleted, then delete steps.
      if (removedIds.length > 0) {
        await tx.contribution.deleteMany({
          where: { projectStepId: { in: removedIds } },
        })
        // StepSkills cascade off ProjectStep already.
        await tx.projectStep.deleteMany({
          where: { id: { in: removedIds } },
        })
      }

      // Walk the form list in order; update existing or insert new.
      for (let i = 0; i < cleanSteps.length; i++) {
        const s = cleanSteps[i]
        const order = i + 1
        let stepId: string

        if (s.id && !s.id.startsWith('tmp-')) {
          // Update existing
          await tx.projectStep.update({
            where: { id: s.id },
            data: {
              title: s.title,
              description: s.description || null,
              order,
            },
          })
          stepId = s.id
        } else {
          // Create new
          const created = await tx.projectStep.create({
            data: {
              projectId,
              title: s.title,
              description: s.description || null,
              order,
              status: 'not_started',
            },
            select: { id: true },
          })
          stepId = created.id
        }

        // Replace this step's skills with the (single) selected one.
        await tx.stepSkill.deleteMany({ where: { projectStepId: stepId } })
        if (s.skillId) {
          await tx.stepSkill.create({
            data: { skillId: s.skillId, projectStepId: stepId },
          })
        }
      }

      // Notify all active members about the edit.
      const recipients = await getActiveProjectMemberIds(tx, projectId)
      const newTitle = data.title.trim()
      const titleChanged = projectBefore?.title && projectBefore.title !== newTitle
      const titleCopy = titleChanged
        ? `${actorName} renamed “${projectBefore!.title}” to “${newTitle}”.`
        : `${actorName} updated ${newTitle}.`
      await notify(tx, {
        type: 'project_updated',
        recipients,
        actorId: userId,
        projectId,
        title: titleCopy,
      })
    })
  } catch {
    return { success: false, error: 'Could not save changes.' }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/edit`)
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  revalidatePath('/my-projects')
  revalidatePath('/notifications')
  return { success: true, data: { projectId } }
}

/**
 * Upload (or replace) a project's cover image. Lead-only. Replaces any
 * prior cover both in the DB and in storage.
 */
export async function uploadProjectCoverAction(
  projectId: string,
  formData: FormData,
): Promise<ServerActionResult<{ url: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const lead = await requireLead(userId, projectId)
  if (!lead.success) return { success: false, error: lead.error }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No file provided.' }
  }

  const existing = await db.project.findUnique({
    where: { id: projectId },
    select: { coverImageUrl: true },
  })

  let url: string
  try {
    const result = await uploadImage(file, 'cover')
    url = result.url
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Could not upload image.',
    }
  }

  try {
    await db.project.update({
      where: { id: projectId },
      data: { coverImageUrl: url },
    })
  } catch {
    await deleteImageByUrl(url)
    return { success: false, error: 'Could not save cover.' }
  }

  if (existing?.coverImageUrl && existing.coverImageUrl !== url) {
    await deleteImageByUrl(existing.coverImageUrl)
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/edit`)
  revalidatePath('/projects')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  return { success: true, data: { url } }
}

/**
 * Clear a project's cover image (revert to the gradient placeholder).
 */
export async function clearProjectCoverAction(
  projectId: string,
): Promise<ServerActionResult<{ cleared: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const lead = await requireLead(userId, projectId)
  if (!lead.success) return { success: false, error: lead.error }

  const existing = await db.project.findUnique({
    where: { id: projectId },
    select: { coverImageUrl: true },
  })

  try {
    await db.project.update({
      where: { id: projectId },
      data: { coverImageUrl: null },
    })
  } catch {
    return { success: false, error: 'Could not clear cover.' }
  }

  if (existing?.coverImageUrl) await deleteImageByUrl(existing.coverImageUrl)

  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/edit`)
  revalidatePath('/projects')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  return { success: true, data: { cleared: true } }
}
