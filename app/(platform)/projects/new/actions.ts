'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { notify } from '@/lib/notifications'
import { parseCoords } from '@/lib/location'
import { normaliseCountry, normaliseLanguage } from '@/lib/locales'
import type { ServerActionResult } from '@/types'

export interface CreateProjectStepInput {
  title: string
  description: string
  skillIds: string[]
  estimatedHrs: number | null
}

export interface CreateProjectInput {
  title: string
  description: string
  city: string
  /** Free-form country label used in the location string. */
  country: string
  /** Optional precise street address or place name. */
  address: string
  /** Optional "lat, lng" string. Parsed + validated server-side. */
  coordinates: string
  /** ISO 3166-1 alpha-2 code; nullable + filterable on the browse page. */
  countryCode: string | null
  /** ISO 639-1 code; nullable + filterable on the browse page. */
  languageCode: string | null
  remote: 'yes' | 'some' | 'no'
  joinPolicy: 'open' | 'approval_required'
  projectTypeId: string | null
  blueprintId: string | null
  /** Parent blueprint when saving a new blueprint as a localised variant. */
  parentBlueprintId: string | null
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
  if (!['open', 'approval_required'].includes(data.joinPolicy)) {
    return 'Pick a join policy.'
  }
  if (data.address.trim().length > 500) {
    return 'Address is too long.'
  }
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

  // Parse the optional "lat, lng" string into a coords pair (or null).
  let coords: { latitude: number | null; longitude: number | null } = {
    latitude: null,
    longitude: null,
  }
  try {
    const parsed = parseCoords(data.coordinates)
    if (parsed) coords = parsed
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Coordinates couldn’t be parsed.',
    }
  }

  // Validate the locale codes (or fall back to the blueprint's later).
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

  // Verify blueprint id if supplied, and inherit its locale when the user
  // didn't override it on the form.
  let blueprintId: string | null = null
  if (data.blueprintId) {
    const bp = await db.blueprint.findUnique({
      where: { id: data.blueprintId },
      select: { id: true, language: true, country: true },
    })
    if (!bp) return { success: false, error: 'Blueprint not found.' }
    blueprintId = bp.id
    if (!languageCode && bp.language) languageCode = bp.language
    if (!countryCode && bp.country) countryCode = bp.country
  }

  // Verify all requested skill ids exist (across every step's skillIds).
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

  // Filter out empty steps (no title) + dedupe skill ids per step.
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

  // Fetch the actor name (for blueprint_forked title) outside the transaction.
  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'A contributor'

  try {
    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title: data.title.trim(),
          description: data.description.trim(),
          status: 'defining',
          location: buildLocation(data.city, data.country),
          address: data.address.trim() || null,
          latitude: coords.latitude,
          longitude: coords.longitude,
          language: languageCode,
          country: countryCode,
          // 'yes' or 'some' → remote contributors welcome.
          remoteOk: data.remote === 'yes' || data.remote === 'some',
          joinPolicy: data.joinPolicy,
          projectTypeId: data.projectTypeId,
          blueprintId,
        },
      })

      // Create steps + their skills
      const newStepSkillIds = new Set<string>()
      for (let i = 0; i < cleanSteps.length; i++) {
        const s = cleanSteps[i]
        const step = await tx.projectStep.create({
          data: {
            projectId: created.id,
            title: s.title,
            description: s.description || null,
            order: i + 1,
            estimatedHrs: s.estimatedHrs,
            status: 'open',
          },
        })
        if (s.skillIds.length > 0) {
          await tx.stepSkill.createMany({
            data: s.skillIds.map((sid) => ({
              skillId: sid,
              projectStepId: step.id,
            })),
          })
          for (const sid of s.skillIds) newStepSkillIds.add(sid)
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

      // Bump blueprint reuse count + notify the blueprint creator.
      if (blueprintId) {
        const bp = await tx.blueprint.update({
          where: { id: blueprintId },
          data: { reuseCount: { increment: 1 } },
          select: { createdById: true, title: true },
        })
        await notify(tx, {
          type: 'blueprint_forked',
          recipients: [bp.createdById],
          actorId: userId,
          projectId: created.id,
          blueprintId,
          title: `${actorName} forked your “${bp.title}” blueprint as “${created.title}”.`,
        })
      }

      // Skill-match fanout. Find users who list any of this project's step
      // skills as seeking — excluding the creator. Keep it bounded.
      if (newStepSkillIds.size > 0) {
        const matchers = await tx.userSkill.findMany({
          where: {
            skillId: { in: Array.from(newStepSkillIds) },
            isSeeking: true,
            userId: { not: userId },
          },
          select: { userId: true, skill: { select: { name: true } } },
          take: 200,
        })
        // Group: each user gets ONE notification mentioning their first matched skill.
        const seen = new Map<string, string>()
        for (const m of matchers) {
          if (!seen.has(m.userId)) seen.set(m.userId, m.skill.name)
        }
        const recipients = Array.from(seen.keys())
        if (recipients.length > 0) {
          // One row per recipient, with a personalised skill name in data.
          // We can't pass per-recipient titles through notify() in one call,
          // so we loop — fine for the small list bound above.
          for (const rid of recipients) {
            const skillName = seen.get(rid)!
            await notify(tx, {
              type: 'skill_match',
              recipients: [rid],
              actorId: userId,
              projectId: created.id,
              title: `New project “${created.title}” needs ${skillName}.`,
              data: { skill: skillName },
            })
          }
        }
      }

      return created
    })

    revalidatePath('/dashboard')
    revalidatePath('/projects')
    revalidatePath('/my-projects')
    revalidatePath('/notifications')
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

  // Validate the locale codes.
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

  // Resolve the optional parent. Strict 1-level: a child cannot itself
  // have a parent. Children must declare at least one of language/country.
  let parentBlueprintId: string | null = null
  if (data.parentBlueprintId) {
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
  }

  // Same skill validation as launch — every per-step skillId must exist.
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

  try {
    const bp = await db.$transaction(async (tx) => {
      const created = await tx.blueprint.create({
        data: {
          createdById: userId,
          projectTypeId: data.projectTypeId,
          title: data.title.trim(),
          description: data.description.trim(),
          parentBlueprintId,
          language: languageCode,
          country: countryCode,
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
            estimatedHrs: s.estimatedHrs,
            statusDefault: 'open',
          },
        })
        if (s.skillIds.length > 0) {
          await tx.stepSkill.createMany({
            data: s.skillIds.map((sid) => ({
              skillId: sid,
              blueprintStepId: step.id,
            })),
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
