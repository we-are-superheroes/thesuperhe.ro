'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { tError } from '@/lib/errors'
import { db } from '@/lib/db'
import { ensureUserExists } from '@/lib/users'
import { uploadImage, deleteImageByUrl, StorageError } from '@/lib/storage'
import { notify } from '@/lib/notifications'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import {
  buildInviteCode,
  inviteProblem,
  isOrgAdminRole,
  randomCodeBlock,
  slugifyOrgName,
} from '@/lib/org-utils'
import type { OrgType } from '@prisma/client'
import type { ErrorDescriptor } from '@/lib/validation'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Organisation actions: gated creation requests, invite codes,
   membership management, and the per-org sharing toggle.

   Role model: the creator holds `owner` (an admin who cannot be
   removed); promoted members hold `admin`. Suspended and pending
   orgs are frozen — no invites, no joins, no role changes. Leaving
   and the sharing toggle always work: they are the member's call.
   ================================================================ */

/** Admin gate: the caller's active admin membership, or an error descriptor. */
type AdminGate =
  | { ok: false; error: ErrorDescriptor }
  | {
      ok: true
      org: { status: 'pending' | 'active' | 'suspended'; name: string; slug: string }
    }

async function requireAdmin(orgId: string, userId: string): Promise<AdminGate> {
  const m = await db.userOrganisation.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, leftAt: true, org: { select: { status: true, name: true, slug: true } } },
  })
  if (!m || m.leftAt !== null || !isOrgAdminRole(m.role)) {
    return { ok: false, error: { key: 'orgs.adminsOnly' } }
  }
  return { ok: true, org: m.org }
}

/** Maps inviteProblem() return strings (lib/org-utils.ts) to error-catalogue keys. */
const INVITE_PROBLEM_KEY: Record<string, string> = {
  'This invite code has been cancelled.': 'orgs.inviteCancelled',
  'This invite code has expired.': 'orgs.inviteExpired',
  'This invite code has been used the maximum number of times.': 'orgs.inviteMaxUses',
  'This invite was sent to a different email address.': 'orgs.inviteWrongEmail',
}

/* ── F1: gated creation ─────────────────────────────────────── */

export async function requestOrganisationAction(input: {
  name: string
  type: OrgType
  website: string
  intendedUse: string
  listed: boolean
}): Promise<ServerActionResult<{ slug: string; orgId: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:org-request`, 3, 60 * 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }

  const name = input.name.trim()
  if (name.length < 3) {
    return { success: false, error: t('orgs.nameRequired') }
  }
  if (name.length > 80) {
    return { success: false, error: t('orgs.nameTooLong') }
  }
  if (input.type !== 'nonprofit' && input.type !== 'company') {
    return { success: false, error: t('orgs.typeRequired') }
  }
  const intendedUse = input.intendedUse.trim()
  if (intendedUse.length < 20) {
    return {
      success: false,
      error: t('orgs.intendedUseTooShort'),
    }
  }
  const website = input.website.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')

  // Idempotent retry guard: if this user already requested an organisation
  // with this name (e.g. resubmitting after a flaky upload), hand back the
  // existing one instead of creating a duplicate.
  const existing = await db.organisation.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      members: { some: { userId, role: 'owner' } },
    },
    select: { id: true, slug: true },
  })
  if (existing) {
    return { success: true, data: { slug: existing.slug, orgId: existing.id } }
  }

  try {
    // Uniquify the slug: base, base-2, base-3, …
    const base = slugifyOrgName(name)
    const taken = await db.organisation.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    })
    const takenSet = new Set(taken.map((t) => t.slug))
    // /orgs/request is a page, not a profile — never hand out that slug.
    takenSet.add('request')
    let slug = base
    for (let i = 2; takenSet.has(slug); i++) slug = `${base}-${i}`

    const orgId = await db.$transaction(async (tx) => {
      const org = await tx.organisation.create({
        data: {
          name,
          slug,
          type: input.type,
          status: 'pending',
          listed: !!input.listed,
          description: intendedUse,
          website: website || null,
        },
        select: { id: true },
      })
      await tx.userOrganisation.create({
        data: { userId, orgId: org.id, role: 'owner' },
      })
      return org.id
    })

    return { success: true, data: { slug, orgId } }
  } catch {
    return { success: false, error: t('orgs.requestFailed') }
  }
}

/* ── F2: invites ────────────────────────────────────────────── */

export async function createInviteCodeAction(
  orgId: string,
  input: { maxUses: number | null; expiresInDays: number | null },
): Promise<ServerActionResult<{ code: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:org-invite`, 10, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }
  if (gate.org.status !== 'active') {
    return { success: false, error: t('orgs.invitesRequireActive') }
  }

  const maxUses =
    input.maxUses === null ? null : Math.max(1, Math.min(10_000, Math.floor(input.maxUses)))
  const expiresAt =
    input.expiresInDays === null
      ? null
      : new Date(Date.now() + Math.max(1, Math.min(365, input.expiresInDays)) * 86_400_000)

  try {
    // Regenerate on the (unlikely) code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = buildInviteCode(gate.org.name, randomCodeBlock())
      const clash = await db.organisationInvite.findUnique({ where: { code }, select: { id: true } })
      if (clash) continue
      await db.organisationInvite.create({
        data: { orgId, code, invitedById: userId, maxUses, expiresAt },
      })
      revalidatePath(`/orgs/${gate.org.slug}`)
      return { success: true, data: { code } }
    }
    return { success: false, error: t('orgs.inviteCodeCollision') }
  } catch {
    return { success: false, error: t('orgs.inviteCreateFailed') }
  }
}

export async function revokeInviteAction(
  inviteId: string,
): Promise<ServerActionResult<{ revoked: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const invite = await db.organisationInvite.findUnique({
    where: { id: inviteId },
    select: { id: true, orgId: true, revokedAt: true, org: { select: { slug: true } } },
  })
  if (!invite) return { success: false, error: t('orgs.inviteNotFound') }

  const gate = await requireAdmin(invite.orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }

  if (!invite.revokedAt) {
    await db.organisationInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    })
  }
  revalidatePath(`/orgs/${invite.org.slug}`)
  return { success: true, data: { revoked: true } }
}

export async function inviteByEmailAction(
  orgId: string,
  email: string,
): Promise<ServerActionResult<{ code: string; delivered: boolean }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:org-invite`, 10, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }
  if (gate.org.status !== 'active') {
    return { success: false, error: t('orgs.invitesRequireActive') }
  }

  const target = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { success: false, error: t('orgs.emailInvalid') }
  }

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const recipient = await db.user.findUnique({
    where: { email: target },
    select: { id: true },
  })

  try {
    const code = buildInviteCode(gate.org.name, randomCodeBlock(6))
    await db.$transaction(async (tx) => {
      await tx.organisationInvite.create({
        data: {
          orgId,
          code,
          email: target,
          invitedById: userId,
          maxUses: 1,
          // Targeted invites quietly lapse after 90 days.
          expiresAt: new Date(Date.now() + 90 * 86_400_000),
        },
      })
      if (recipient) {
        await notify(tx, {
          type: 'invite_received',
          recipients: [recipient.id],
          actorId: userId,
          title: `${actor?.name ?? 'Someone'} invited you to join ${gate.org.name}.`,
          body: `Use invite code ${code} on the organisation page.`,
          data: { orgSlug: gate.org.slug, code },
        })
      }
    })
    revalidatePath(`/orgs/${gate.org.slug}`)
    // If they have no account yet, the admin shares the code by hand — we
    // don't send emails yet.
    return { success: true, data: { code, delivered: !!recipient } }
  } catch {
    return { success: false, error: t('orgs.inviteEmailFailed') }
  }
}

export async function redeemInviteAction(
  rawCode: string,
): Promise<ServerActionResult<{ slug: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:org-join`, 5, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }

  const code = rawCode.trim().toUpperCase()
  if (!code) return { success: false, error: t('orgs.inviteCodeRequired') }

  const invite = await db.organisationInvite.findUnique({
    where: { code },
    select: {
      id: true,
      orgId: true,
      email: true,
      revokedAt: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      org: { select: { slug: true, status: true } },
    },
  })
  if (!invite) return { success: false, error: t('orgs.inviteCodeUnknown') }
  if (invite.org.status !== 'active') {
    return { success: false, error: t('orgs.orgNotAcceptingMembers') }
  }

  const me = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  const problem = inviteProblem(invite, new Date(), me?.email)
  if (problem) {
    // inviteProblem (lib/org-utils.ts) returns English strings; map them
    // to catalogue keys here so the refusal renders in the user's language.
    return {
      success: false,
      error: await tError({ key: INVITE_PROBLEM_KEY[problem] ?? 'orgs.inviteNoLongerValid' }),
    }
  }

  const existing = await db.userOrganisation.findUnique({
    where: { userId_orgId: { userId, orgId: invite.orgId } },
    select: { leftAt: true },
  })
  if (existing && existing.leftAt === null) {
    return { success: false, error: t('orgs.alreadyMember') }
  }

  try {
    await db.$transaction(async (tx) => {
      // Re-check the use count inside the transaction so two racing
      // redemptions can't both squeeze through a maxUses boundary.
      const fresh = await tx.organisationInvite.findUnique({
        where: { id: invite.id },
        select: { useCount: true, maxUses: true, revokedAt: true },
      })
      if (
        !fresh ||
        fresh.revokedAt ||
        (fresh.maxUses !== null && fresh.useCount >= fresh.maxUses)
      ) {
        throw new Error('invite-no-longer-valid')
      }
      await tx.organisationInvite.update({
        where: { id: invite.id },
        data: { useCount: { increment: 1 } },
      })
      if (existing) {
        // Re-join: reactivate the row with a fresh membership window (the
        // attribution maths reads joinedAt/leftAt).
        await tx.userOrganisation.update({
          where: { userId_orgId: { userId, orgId: invite.orgId } },
          data: { leftAt: null, joinedAt: new Date(), role: 'member' },
        })
      } else {
        await tx.userOrganisation.create({
          data: { userId, orgId: invite.orgId, role: 'member' },
        })
      }
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'invite-no-longer-valid') {
      return { success: false, error: t('orgs.inviteNoLongerValid') }
    }
    return { success: false, error: t('orgs.joinFailed') }
  }

  revalidatePath(`/orgs/${invite.org.slug}`)
  revalidatePath('/profile')
  return { success: true, data: { slug: invite.org.slug } }
}

/* ── F2: membership management ──────────────────────────────── */

export async function leaveOrgAction(
  orgId: string,
): Promise<ServerActionResult<{ left: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const m = await db.userOrganisation.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, leftAt: true, org: { select: { slug: true } } },
  })
  if (!m || m.leftAt !== null) {
    return { success: false, error: t('orgs.notMemberOfThisOrg') }
  }

  // The last active admin must hand over first — otherwise the org is
  // unmanageable (nobody can invite, promote, or export).
  if (isOrgAdminRole(m.role)) {
    const otherAdmins = await db.userOrganisation.count({
      where: {
        orgId,
        leftAt: null,
        role: { in: ['owner', 'admin'] },
        NOT: { userId },
      },
    })
    if (otherAdmins === 0) {
      return {
        success: false,
        error: t('orgs.lastAdmin'),
      }
    }
  }

  await db.userOrganisation.update({
    where: { userId_orgId: { userId, orgId } },
    data: { leftAt: new Date() },
  })
  revalidatePath(`/orgs/${m.org.slug}`)
  revalidatePath('/profile')
  return { success: true, data: { left: true } }
}

export async function removeMemberAction(
  orgId: string,
  targetUserId: string,
): Promise<ServerActionResult<{ removed: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }
  if (targetUserId === userId) {
    return { success: false, error: t('orgs.useLeaveForSelf') }
  }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }

  const target = await db.userOrganisation.findUnique({
    where: { userId_orgId: { userId: targetUserId, orgId } },
    select: { role: true, leftAt: true },
  })
  if (!target || target.leftAt !== null) {
    return { success: false, error: t('orgs.notActiveMember') }
  }
  if (target.role === 'owner') {
    return { success: false, error: t('orgs.ownerCannotBeRemoved') }
  }

  await db.userOrganisation.update({
    where: { userId_orgId: { userId: targetUserId, orgId } },
    data: { leftAt: new Date() },
  })
  revalidatePath(`/orgs/${gate.org.slug}`)
  return { success: true, data: { removed: true } }
}

export async function promoteMemberAction(
  orgId: string,
  targetUserId: string,
): Promise<ServerActionResult<{ promoted: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }
  if (gate.org.status !== 'active') {
    return { success: false, error: t('orgs.rolesRequireActive') }
  }

  const target = await db.userOrganisation.findUnique({
    where: { userId_orgId: { userId: targetUserId, orgId } },
    select: { role: true, leftAt: true },
  })
  if (!target || target.leftAt !== null) {
    return { success: false, error: t('orgs.notActiveMember') }
  }
  if (target.role !== 'member') {
    return { success: false, error: t('orgs.alreadyAdmin') }
  }

  await db.userOrganisation.update({
    where: { userId_orgId: { userId: targetUserId, orgId } },
    data: { role: 'admin' },
  })
  revalidatePath(`/orgs/${gate.org.slug}`)
  return { success: true, data: { promoted: true } }
}

/* ── F6: sharing toggle ─────────────────────────────────────── */

export async function setShareContributionsAction(
  orgId: string,
  share: boolean,
): Promise<ServerActionResult<{ share: boolean }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const m = await db.userOrganisation.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { leftAt: true, org: { select: { slug: true } } },
  })
  if (!m || m.leftAt !== null) {
    return { success: false, error: t('orgs.notMemberOfThisOrg') }
  }

  await db.userOrganisation.update({
    where: { userId_orgId: { userId, orgId } },
    data: { shareContributions: share },
  })
  revalidatePath(`/orgs/${m.org.slug}`)
  revalidatePath('/profile')
  return { success: true, data: { share } }
}

/* ── Org profile editing (admins) ───────────────────────────── */

export async function updateOrgProfileAction(
  orgId: string,
  input: { description: string; website: string; listed: boolean },
): Promise<ServerActionResult<{ updated: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }

  const description = input.description.trim()
  if (description.length > 2000) {
    return { success: false, error: t('orgs.descriptionTooLong') }
  }
  const website = input.website.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (website.length > 200) {
    return { success: false, error: t('orgs.websiteTooLong') }
  }

  await db.organisation.update({
    where: { id: orgId },
    data: {
      description: description || null,
      website: website || null,
      listed: !!input.listed,
    },
  })
  revalidatePath(`/orgs/${gate.org.slug}`)
  revalidatePath('/organisations')
  return { success: true, data: { updated: true } }
}

/* ── Logo + banner images ───────────────────────────────────── */

const ORG_IMAGE_FIELD = {
  logo: { column: 'logoUrl', kind: 'orgLogo' },
  banner: { column: 'bannerUrl', kind: 'orgBanner' },
} as const

export type OrgImageKind = keyof typeof ORG_IMAGE_FIELD

export async function uploadOrgImageAction(
  orgId: string,
  image: OrgImageKind,
  formData: FormData,
): Promise<ServerActionResult<{ url: string }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:org-image`, 10, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const field = ORG_IMAGE_FIELD[image]
  if (!field) return { success: false, error: t('orgs.imageKindUnknown') }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: t('orgs.imageFileMissing') }
  }

  const existing = await db.organisation.findUnique({
    where: { id: orgId },
    select: { logoUrl: true, bannerUrl: true },
  })

  let url: string
  try {
    const result = await uploadImage(file, field.kind)
    url = result.url
  } catch (e) {
    if (e instanceof StorageError) {
      return { success: false, error: await tError(e.descriptor) }
    }
    return { success: false, error: t('orgs.imageUploadFailed') }
  }

  try {
    await db.organisation.update({
      where: { id: orgId },
      data: { [field.column]: url },
    })
  } catch {
    // The file made it into storage but the DB write failed. Clean up.
    await deleteImageByUrl(url)
    return { success: false, error: t('orgs.imageSaveFailed') }
  }

  // Now that the new URL is committed, prune the old object.
  const oldUrl = image === 'logo' ? existing?.logoUrl : existing?.bannerUrl
  if (oldUrl && oldUrl !== url) await deleteImageByUrl(oldUrl)

  revalidatePath(`/orgs/${gate.org.slug}`)
  revalidatePath('/organisations')
  return { success: true, data: { url } }
}

export async function clearOrgImageAction(
  orgId: string,
  image: OrgImageKind,
): Promise<ServerActionResult<{ cleared: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const field = ORG_IMAGE_FIELD[image]
  if (!field) return { success: false, error: t('orgs.imageKindUnknown') }

  const gate = await requireAdmin(orgId, userId)
  if (!gate.ok) return { success: false, error: await tError(gate.error) }

  const existing = await db.organisation.findUnique({
    where: { id: orgId },
    select: { logoUrl: true, bannerUrl: true },
  })
  const oldUrl = image === 'logo' ? existing?.logoUrl : existing?.bannerUrl

  await db.organisation.update({
    where: { id: orgId },
    data: { [field.column]: null },
  })
  if (oldUrl) await deleteImageByUrl(oldUrl)

  revalidatePath(`/orgs/${gate.org.slug}`)
  revalidatePath('/organisations')
  return { success: true, data: { cleared: true } }
}
