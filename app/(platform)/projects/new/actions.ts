'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { ServerActionResult } from '@/types'

export interface CreateProjectStepInput {
  title: string
  description: string
  skillId: string | null
}

export interface CreateProjectInput {
  title: string
  description: string
  city: string
  country: string
  remote: 'yes' | 'some' | 'no'
  projectTypeId: string | null
  blueprintId: string | null
  steps: CreateProjectStepInput[]
}

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
      data: { id: userId, email, name, avatarUrl: cu.imageUrl ?? null },
    })
    return { success: true, data: undefined }
  } catch {
    const retry = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (retry) return { success: true, data: undefined }
    return { success: false, error: 'Could not create user record' }
  }
}

function buildLocation(city: string, country: string): string | null {
  const c = city.trim()
  const co = country.trim()
  if (c && co && co.toLowerCase() !== 'other / multi-country') return `${c}, ${co}`
  if (c) return c
  if (co && co.toLowerCase() !== 'other / multi-country') return co
  return null
}

function validateProject(data: CreateProjectInput): string | null {
  const title = data.title.trim()
  if (!title) return 'Give your project a title first.'
  if (title.length > 200) return 'Title is too long.'
  const desc = data.description.trim()
  if (!desc) return 'Add a short description so people know what they’re joining.'
  if (!['yes', 'some', 'no'].includes(data.remote)) return 'Pick a remote option.'
  return null
}

export async function launchProjectAction(
  data: CreateProjectInput,
): Promise<ServerActionResult<{ projectId: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  const validationError = validateProject(data)
  if (validationError) return { success: false, error: validationError }

  // Verify blueprint id if supplied
  let blueprintId: string | null = null
  if (data.blueprintId) {
    const bp = await db.blueprint.findUnique({
      where: { id: data.blueprintId },
      select: { id: true },
    })
    if (!bp) return { success: false, error: 'Blueprint not found.' }
    blueprintId = bp.id
  }

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

  // Filter out empty steps (no title)
  const cleanSteps = data.steps
    .map((s) => ({ ...s, title: s.title.trim(), description: s.description.trim() }))
    .filter((s) => s.title.length > 0)

  try {
    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title: data.title.trim(),
          description: data.description.trim(),
          status: 'active',
          location: buildLocation(data.city, data.country),
          // 'yes' or 'some' → remote contributors welcome.
          remoteOk: data.remote === 'yes' || data.remote === 'some',
          projectTypeId: data.projectTypeId,
          blueprintId,
        },
      })

      // Create steps + their skills
      for (let i = 0; i < cleanSteps.length; i++) {
        const s = cleanSteps[i]
        const step = await tx.projectStep.create({
          data: {
            projectId: created.id,
            title: s.title,
            description: s.description || null,
            order: i + 1,
            status: 'not_started',
          },
        })
        if (s.skillId) {
          await tx.stepSkill.create({
            data: { skillId: s.skillId, projectStepId: step.id },
          })
        }
      }

      // Lead contribution for the creator
      await tx.contribution.create({
        data: {
          userId,
          projectId: created.id,
          projectStepId: null,
          role: 'lead',
          status: 'active',
        },
      })

      // Bump blueprint reuse count if forked
      if (blueprintId) {
        await tx.blueprint.update({
          where: { id: blueprintId },
          data: { reuseCount: { increment: 1 } },
        })
      }

      return created
    })

    revalidatePath('/dashboard')
    revalidatePath('/projects')
    revalidatePath('/my-projects')
    return { success: true, data: { projectId: project.id } }
  } catch {
    return { success: false, error: 'Could not launch the project.' }
  }
}

export async function saveBlueprintAction(
  data: CreateProjectInput,
): Promise<ServerActionResult<{ blueprintId: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  const validationError = validateProject(data)
  if (validationError) return { success: false, error: validationError }

  // Same skill validation as launch
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

  const cleanSteps = data.steps
    .map((s) => ({ ...s, title: s.title.trim(), description: s.description.trim() }))
    .filter((s) => s.title.length > 0)

  try {
    const bp = await db.$transaction(async (tx) => {
      const created = await tx.blueprint.create({
        data: {
          createdById: userId,
          projectTypeId: data.projectTypeId,
          title: data.title.trim(),
          description: data.description.trim(),
        },
      })

      for (let i = 0; i < cleanSteps.length; i++) {
        const s = cleanSteps[i]
        const step = await tx.blueprintStep.create({
          data: {
            blueprintId: created.id,
            title: s.title,
            description: s.description || null,
            order: i + 1,
            statusDefault: 'not_started',
          },
        })
        if (s.skillId) {
          await tx.stepSkill.create({
            data: { skillId: s.skillId, blueprintStepId: step.id },
          })
        }
      }

      return created
    })

    return { success: true, data: { blueprintId: bp.id } }
  } catch {
    return { success: false, error: 'Could not save the blueprint.' }
  }
}
