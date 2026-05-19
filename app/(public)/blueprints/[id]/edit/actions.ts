'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { normaliseCountry, normaliseLanguage } from '@/lib/locales'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Blueprint edit / delete actions.
   Authz: only the blueprint's creator can change or remove it. A
   variant cannot itself have children, so changing the parent is
   guarded by the same rule used when saving a new blueprint.
   ================================================================ */

export interface UpdateBlueprintStepInput {
  /** DB id for existing steps, or null for new ones. */
  id: string | null
  title: string
  description: string
  skillIds: string[]
  estimatedHrs: number | null
}

export interface UpdateBlueprintInput {
  title: string
  description: string
  projectTypeId: string | null
  parentBlueprintId: string | null
  countryCode: string | null
  languageCode: string | null
  steps: UpdateBlueprintStepInput[]
}

async function requireCreator(
  userId: string,
  blueprintId: string,
): Promise<
  ServerActionResult<{
    blueprintId: string
    isVariant: boolean
    childCount: number
  }>
> {
  const bp = await db.blueprint.findUnique({
    where: { id: blueprintId },
    select: {
      id: true,
      createdById: true,
      parentBlueprintId: true,
      _count: { select: { variants: true } },
    },
  })
  if (!bp) return { success: false, error: 'Blueprint not found.' }
  if (bp.createdById !== userId) {
    return { success: false, error: 'Only the blueprint creator can edit it.' }
  }
  return {
    success: true,
    data: {
      blueprintId: bp.id,
      isVariant: !!bp.parentBlueprintId,
      childCount: bp._count.variants,
    },
  }
}

function validate(data: UpdateBlueprintInput): string | null {
  const title = data.title.trim()
  if (!title) return 'Title can’t be empty.'
  if (title.length > 200) return 'Title is too long.'
  const desc = data.description.trim()
  if (!desc) return 'Description can’t be empty.'
  return null
}

export async function updateBlueprintAction(
  blueprintId: string,
  data: UpdateBlueprintInput,
): Promise<ServerActionResult<{ blueprintId: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const authz = await requireCreator(userId, blueprintId)
  if (!authz.success) return { success: false, error: authz.error }
  const { isVariant, childCount } = authz.data

  const validationError = validate(data)
  if (validationError) return { success: false, error: validationError }

  // Locale codes.
  let countryCode: string | null = null
  let languageCode: string | null = null
  try {
    countryCode = data.countryCode ? normaliseCountry(data.countryCode) : null
    languageCode = data.languageCode ? normaliseLanguage(data.languageCode) : null
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Locale code not recognised.',
    }
  }

  // Parent rules:
  //  • A blueprint that has children of its own can't become a variant
  //    (strict 1-level rule — children would otherwise be 2 deep).
  //  • The chosen parent can't itself be a variant.
  //  • A blueprint can't be its own parent.
  //  • If a parent is set, at least one locale must be set so the variant
  //    is distinguishable from its parent.
  let parentBlueprintId: string | null = null
  if (data.parentBlueprintId) {
    if (data.parentBlueprintId === blueprintId) {
      return { success: false, error: 'A blueprint can’t be its own parent.' }
    }
    if (childCount > 0) {
      return {
        success: false,
        error:
          'This blueprint already has variants of its own, so it can’t become a variant itself.',
      }
    }
    const parent = await db.blueprint.findUnique({
      where: { id: data.parentBlueprintId },
      select: { id: true, parentBlueprintId: true },
    })
    if (!parent) return { success: false, error: 'Parent blueprint not found.' }
    if (parent.parentBlueprintId) {
      return {
        success: false,
        error:
          'You can only adapt root blueprints — that one is already a variant.',
      }
    }
    parentBlueprintId = parent.id
    if (!languageCode && !countryCode) {
      return {
        success: false,
        error:
          'A variant needs a language or a country so people can tell it apart.',
      }
    }
  } else if (isVariant && !languageCode && !countryCode) {
    // Already a variant and the user is keeping it that way — same rule.
    return {
      success: false,
      error:
        'A variant needs a language or a country so people can tell it apart.',
    }
  }

  // Verify all requested skills exist + sanitise steps.
  const requestedSkillIds = Array.from(
    new Set(data.steps.flatMap((s) => s.skillIds)),
  )
  if (requestedSkillIds.length > 0) {
    const realSkills = await db.skill.findMany({
      where: { id: { in: requestedSkillIds } },
      select: { id: true },
    })
    const realIds = new Set(realSkills.map((s) => s.id))
    for (const s of data.steps) {
      for (const sid of s.skillIds) {
        if (!realIds.has(sid)) {
          return { success: false, error: 'Unknown skill on one of the steps.' }
        }
      }
    }
  }

  const cleanSteps = data.steps
    .map((s) => ({
      ...s,
      title: s.title.trim(),
      description: s.description.trim(),
      skillIds: Array.from(new Set(s.skillIds)),
      estimatedHrs:
        s.estimatedHrs != null && Number.isFinite(s.estimatedHrs) && s.estimatedHrs >= 0
          ? Math.round(s.estimatedHrs)
          : null,
    }))
    .filter((s) => s.title.length > 0)

  // Verify any submitted existing-step ids belong to this blueprint.
  const submittedIds = cleanSteps
    .map((s) => s.id)
    .filter((id): id is string => !!id && !id.startsWith('tmp-'))
  if (submittedIds.length > 0) {
    const found = await db.blueprintStep.findMany({
      where: { id: { in: submittedIds }, blueprintId },
      select: { id: true },
    })
    const foundIds = new Set(found.map((s) => s.id))
    for (const id of submittedIds) {
      if (!foundIds.has(id)) {
        return {
          success: false,
          error: 'One of the steps doesn’t belong to this blueprint.',
        }
      }
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.blueprint.update({
        where: { id: blueprintId },
        data: {
          title: data.title.trim(),
          description: data.description.trim(),
          projectTypeId: data.projectTypeId,
          parentBlueprintId,
          country: countryCode,
          language: languageCode,
        },
      })

      const existingSteps = await tx.blueprintStep.findMany({
        where: { blueprintId },
        select: { id: true },
      })
      const existingIds = new Set(existingSteps.map((s) => s.id))
      const keptIds = new Set(submittedIds)
      const removedIds = [...existingIds].filter((id) => !keptIds.has(id))

      if (removedIds.length > 0) {
        // StepSkills cascade off the step row.
        await tx.blueprintStep.deleteMany({ where: { id: { in: removedIds } } })
      }

      for (let i = 0; i < cleanSteps.length; i++) {
        const s = cleanSteps[i]
        const order = i + 1
        let stepId: string

        if (s.id && !s.id.startsWith('tmp-')) {
          await tx.blueprintStep.update({
            where: { id: s.id },
            data: {
              title: s.title,
              description: s.description || null,
              order,
              estimatedHrs: s.estimatedHrs,
            },
          })
          stepId = s.id
        } else {
          const created = await tx.blueprintStep.create({
            data: {
              blueprintId,
              title: s.title,
              description: s.description || null,
              order,
              estimatedHrs: s.estimatedHrs,
              statusDefault: 'open',
            },
            select: { id: true },
          })
          stepId = created.id
        }

        // Replace the step's skills with the new set.
        await tx.stepSkill.deleteMany({ where: { blueprintStepId: stepId } })
        if (s.skillIds.length > 0) {
          await tx.stepSkill.createMany({
            data: s.skillIds.map((sid) => ({
              skillId: sid,
              blueprintStepId: stepId,
            })),
          })
        }
      }
    })
  } catch {
    return { success: false, error: 'Could not save the blueprint.' }
  }

  revalidatePath('/blueprints')
  revalidatePath(`/blueprints/${blueprintId}`)
  return { success: true, data: { blueprintId } }
}

