'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { tError } from '@/lib/errors'
import { db } from '@/lib/db'
import { ensureUserExists } from '@/lib/users'
import { notify } from '@/lib/notifications'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import { buildLocation } from '@/lib/location'
import { normaliseCountry, normaliseLanguage } from '@/lib/locales'
import { validateProjectFields } from '@/lib/validation'
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
  /** Optional precise street address or place name. */
  address: string
  /** ISO 3166-1 alpha-2 code; nullable + filterable on the browse page.
   *  Also supplies the country part of the "City, Country" location string. */
  countryCode: string | null
  /** ISO 639-1 code; nullable + filterable on the browse page. */
  languageCode: string | null
  remote: 'yes' | 'some' | 'no'
  joinPolicy: 'open' | 'approval_required'
  /** Owning organisation (the creator must be an active member), or null. */
  orgId: string | null
  /** org_members is only valid together with orgId. */
  visibility: 'public' | 'org_members'
  projectTypeId: string | null
  blueprintId: string | null
  /** Parent blueprint when saving a new blueprint as a localised variant. */
  parentBlueprintId: string | null
  steps: CreateProjectStepInput[]
}



export async function launchProjectAction(
  data: CreateProjectInput,
): Promise<ServerActionResult<{ projectId: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  // Each launch can fan out skill-match notifications — keep it human-paced.
  const rl = rateLimit(`${userId}:launch-project`, 5, 60 * 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }

  const validationError = validateProjectFields(data, 'create')
  if (validationError) return { success: false, error: await tError(validationError) }

  // Validate the locale codes (or fall back to the blueprint's later).
  let countryCode: string | null = null
  let languageCode: string | null = null
  try {
    countryCode = data.countryCode ? normaliseCountry(data.countryCode) : null
    languageCode = data.languageCode ? normaliseLanguage(data.languageCode) : null
  } catch {
    return { success: false, error: t('common.localeCodeInvalid') }
  }

  // Org ownership: the creator must be an active member of an active org
  // (spec invariant 2), and members-only visibility requires an org.
  let orgId: string | null = null
  let visibility: 'public' | 'org_members' = 'public'
  let orgSlug: string | null = null
  if (data.orgId) {
    const membership = await db.userOrganisation.findUnique({
      where: { userId_orgId: { userId, orgId: data.orgId } },
      select: { leftAt: true, org: { select: { status: true, slug: true } } },
    })
    if (!membership || membership.leftAt !== null) {
      return { success: false, error: t('orgs.notAMember') }
    }
    if (membership.org.status !== 'active') {
      return { success: false, error: t('orgs.orgNotActiveOwner') }
    }
    orgId = data.orgId
    orgSlug = membership.org.slug
    visibility = data.visibility === 'org_members' ? 'org_members' : 'public'
  }

  // Verify blueprint id if supplied, and inherit its locale when the user
  // didn't override it on the form.
  let blueprintId: string | null = null
  if (data.blueprintId) {
    const bp = await db.blueprint.findUnique({
      where: { id: data.blueprintId },
      select: { id: true, language: true, country: true },
    })
    if (!bp) return { success: false, error: t('blueprints.notFound') }
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
          return { success: false, error: t('projectForm.unknownStepSkill') }
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
          // countryCode is final here — blueprint inheritance above already
          // ran, so an inherited country lands in the display string too.
          location: buildLocation(data.city, countryCode),
          address: data.address.trim() || null,
          language: languageCode,
          country: countryCode,
          // 'yes' or 'some' → remote contributors welcome.
          remoteOk: data.remote === 'yes' || data.remote === 'some',
          joinPolicy: data.joinPolicy,
          orgId,
          visibility,
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
      // Members-only projects never fan out: the notification would leak the
      // title to people outside the organisation.
      if (newStepSkillIds.size > 0 && visibility === 'public') {
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
    if (orgSlug) revalidatePath(`/orgs/${orgSlug}`)
    return { success: true, data: { projectId: project.id } }
  } catch {
    return { success: false, error: t('projectForm.launchFailed') }
  }
}

export async function saveBlueprintAction(
  data: CreateProjectInput,
): Promise<ServerActionResult<{ blueprintId: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }

  const validationError = validateProjectFields(data, 'create')
  if (validationError) return { success: false, error: await tError(validationError) }

  // Validate the locale codes.
  let countryCode: string | null = null
  let languageCode: string | null = null
  try {
    countryCode = data.countryCode ? normaliseCountry(data.countryCode) : null
    languageCode = data.languageCode ? normaliseLanguage(data.languageCode) : null
  } catch {
    return { success: false, error: t('common.localeCodeInvalid') }
  }

  // Resolve the optional parent. Strict 1-level: a child cannot itself
  // have a parent. Children must declare at least one of language/country.
  let parentBlueprintId: string | null = null
  if (data.parentBlueprintId) {
    const parent = await db.blueprint.findUnique({
      where: { id: data.parentBlueprintId },
      select: { id: true, parentBlueprintId: true },
    })
    if (!parent) return { success: false, error: t('blueprints.parentNotFound') }
    if (parent.parentBlueprintId) {
      return { success: false, error: t('blueprints.parentIsVariant') }
    }
    parentBlueprintId = parent.id
    if (!languageCode && !countryCode) {
      return { success: false, error: t('blueprints.variantNeedsLocale') }
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
          return { success: false, error: t('projectForm.unknownStepSkill') }
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
    return { success: false, error: t('blueprints.saveFailed') }
  }
}
