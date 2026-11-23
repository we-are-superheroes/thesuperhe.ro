'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { tError } from '@/lib/errors'
import { log } from '@/lib/log'
import { notify } from '@/lib/notifications'
import {
  ApplyError,
  MAX_PENDING_PROPOSALS,
  applyProposal,
  countPendingProposals,
  findPlacesNear,
  getEditablePlace,
  isCuratorRole,
  placeEditMode,
} from '@/lib/places'
import { translatePlaceLater } from '@/lib/place-translator'
import {
  diffPlaceData,
  isValidLatLng,
  validatePlaceInput,
  validateProposalNote,
  type PlaceData,
} from '@/lib/places-shared'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import { ensureUserExists } from '@/lib/users'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Adding, changing and removing map places.

   One action serves everyone. What happens depends on who is asking:
     - curators and admins, and the lead of a public Superhero project
       acting on that project's own place → published at once
     - any other signed-in member → saved as a pending proposal that a
       curator reviews at /admin/places

   Either way the change is written as a place_proposals row and goes
   through applyProposal() (lib/places.ts) — the single write path.
   ================================================================ */

export interface SubmitPlaceInput {
  /** Set to change an existing place; absent to add a new one. */
  placeId?: string
  /** New place only: the Superhero project this pin belongs to (lead or curator). */
  projectId?: string
  /** Curators only: decide this pending proposal with the (edited) data. */
  proposalId?: string
  /** The form's fields — untrusted, validated here. */
  data: unknown
  /** Members: why this place fits / where the information comes from. */
  note?: string
}

export type SubmitPlaceOutcome =
  /** Live now. */
  | { outcome: 'published'; slug: string }
  /** Waiting for a curator. */
  | { outcome: 'pending' }
  /** An edit that changed nothing. */
  | { outcome: 'unchanged'; slug: string }

function revalidatePlace(slug: string | null, projectId?: string | null) {
  revalidatePath('/map')
  if (slug) revalidatePath(`/map/${slug}`)
  if (projectId) revalidatePath(`/projects/${projectId}/edit`)
  revalidatePath('/admin/places')
}

export async function submitPlaceAction(
  input: SubmitPlaceInput,
): Promise<ServerActionResult<SubmitPlaceOutcome>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:place-submit`, 10, 10 * 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true },
  })
  if (!user) return { success: false, error: t('common.profileSyncFailed') }

  const checked = validatePlaceInput(input.data)
  if (!checked.ok) return { success: false, error: await tError(checked.error) }
  const data = checked.data
  const noteCheck = validateProposalNote(input.note)
  if (!noteCheck.ok) return { success: false, error: await tError(noteCheck.error) }

  // ── Curator deciding a pending proposal, with their own edits ──────────
  if (input.proposalId) {
    if (!isCuratorRole(user.role)) return { success: false, error: t('admin.notAuthorised') }
    return approveWithData(input.proposalId, data, user.id)
  }

  // ── What is being changed, and may this user change it directly? ───────
  let existing: Awaited<ReturnType<typeof getEditablePlace>> = null
  let projectId: string | null = null

  if (input.placeId) {
    // Curators can also reach hidden places (to correct and restore them).
    existing = await getEditablePlace(db, { id: input.placeId }, {
      includeHidden: isCuratorRole(user.role),
    })
    if (!existing) return { success: false, error: t('places.notFound') }
    projectId = existing.projectId
  } else if (input.projectId) {
    projectId = input.projectId
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, visibility: true, place: { select: { id: true } } },
    })
    // Only a public project can be shown on the public map. Members-only
    // projects get the same answer as a missing one.
    if (!project || project.visibility !== 'public') {
      return { success: false, error: t('places.projectNotEligible') }
    }
    if (project.place) return { success: false, error: t('places.projectAlreadyOnMap') }
  }

  const mode = await placeEditMode(user, projectId)
  // Linking a pin to a project is for that project's lead or a curator —
  // never something a member can propose for someone else's project.
  if (!input.placeId && projectId && mode !== 'direct') {
    return { success: false, error: t('places.projectNotEligible') }
  }

  const kind = existing ? 'edit' : 'new'
  const payload = existing ? diffPlaceData(existing.data, data) : data
  if (existing && Object.keys(payload).length === 0) {
    return { success: true, data: { outcome: 'unchanged', slug: existing.slug } }
  }

  if (mode === 'propose') {
    if ((await countPendingProposals(user.id)) >= MAX_PENDING_PROPOSALS) {
      return {
        success: false,
        error: await tError({
          key: 'places.tooManyPending',
          params: { max: MAX_PENDING_PROPOSALS },
        }),
      }
    }
    try {
      await db.placeProposal.create({
        data: {
          kind,
          placeId: existing?.id ?? null,
          payload: payload as unknown as Prisma.InputJsonValue,
          note: noteCheck.note,
          baseUpdatedAt: existing?.updatedAt ?? null,
          proposerId: user.id,
        },
      })
    } catch {
      return { success: false, error: t('places.saveFailed') }
    }
    revalidatePath('/admin/places')
    return { success: true, data: { outcome: 'pending' } }
  }

  // ── Direct: write the proposal and apply it in one transaction ─────────
  try {
    const applied = await db.$transaction(async (tx) => {
      const proposal = await tx.placeProposal.create({
        data: {
          kind,
          placeId: existing?.id ?? null,
          payload: payload as unknown as Prisma.InputJsonValue,
          note: noteCheck.note,
          baseUpdatedAt: existing?.updatedAt ?? null,
          proposerId: user.id,
        },
        select: { id: true, kind: true, placeId: true, payload: true },
      })
      const result = await applyProposal(tx, proposal, user.id, {
        projectId: existing ? undefined : projectId,
        createdById: user.id,
      })
      if (!result.ok) throw new ApplyError(result)
      return result
    })
    log.info('places.direct_change', { userId: user.id, placeId: applied.placeId, kind })
    translatePlaceLater(applied.placeId)
    revalidatePlace(applied.slug, projectId)
    return { success: true, data: { outcome: 'published', slug: applied.slug } }
  } catch (e) {
    if (e instanceof ApplyError && e.result.reason === 'invalid') {
      return { success: false, error: await tError(e.result.error) }
    }
    return { success: false, error: t('places.saveFailed') }
  }
}

/** A curator approves a pending proposal after editing it in the form. */
async function approveWithData(
  proposalId: string,
  data: PlaceData,
  curatorId: string,
): Promise<ServerActionResult<SubmitPlaceOutcome>> {
  const t = await getTranslations('errors')
  const proposal = await db.placeProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, kind: true, placeId: true, status: true, proposerId: true },
  })
  if (!proposal || proposal.kind === 'remove') return { success: false, error: t('places.proposalNotFound') }
  if (proposal.status !== 'pending') return { success: false, error: t('places.proposalAlreadyResolved') }

  try {
    const applied = await db.$transaction(async (tx) => {
      // Replace the stored payload with what the curator is approving, so the
      // history shows exactly what went live.
      let payload: unknown = data
      if (proposal.kind === 'edit') {
        if (!proposal.placeId) throw new ApplyError({ ok: false, reason: 'place_missing' })
        const current = await getEditablePlace(tx, { id: proposal.placeId }, { includeHidden: true })
        if (!current) throw new ApplyError({ ok: false, reason: 'place_missing' })
        payload = diffPlaceData(current.data, data)
      }
      await tx.placeProposal.update({
        where: { id: proposal.id },
        data: { payload: payload as Prisma.InputJsonValue },
      })
      const result = await applyProposal(
        tx,
        { id: proposal.id, kind: proposal.kind, placeId: proposal.placeId, payload },
        curatorId,
        { createdById: proposal.proposerId },
      )
      if (!result.ok) throw new ApplyError(result)
      if (proposal.proposerId) {
        await notify(tx, {
          type: 'place_proposal_approved',
          recipients: [proposal.proposerId],
          actorId: curatorId,
          message: { key: 'placeProposalApproved', params: { placeName: result.name } },
          data: { placeSlug: result.slug },
        })
      }
      return result
    })
    log.info('places.proposal_approved', { curatorId, proposalId, placeId: applied.placeId, edited: true })
    translatePlaceLater(applied.placeId)
    revalidatePlace(applied.slug)
    revalidatePath('/notifications')
    return { success: true, data: { outcome: 'published', slug: applied.slug } }
  } catch (e) {
    if (e instanceof ApplyError) {
      if (e.result.reason === 'invalid') return { success: false, error: await tError(e.result.error) }
      if (e.result.reason === 'already_resolved') {
        return { success: false, error: t('places.proposalAlreadyResolved') }
      }
      return { success: false, error: t('places.notFound') }
    }
    return { success: false, error: t('places.saveFailed') }
  }
}

/**
 * Ask for a place to be taken off the map (duplicate, wrong, against the
 * guidelines). Curators and the project's own lead remove it at once;
 * everyone else files a proposal. "It has closed" is not this — that is an
 * edit of the open status, so the place page can still say so.
 */
export async function removePlaceAction(
  placeId: string,
  note: string,
): Promise<ServerActionResult<{ outcome: 'removed' | 'pending' }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:place-submit`, 10, 10 * 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!user) return { success: false, error: t('common.profileSyncFailed') }

  const noteCheck = validateProposalNote(note)
  if (!noteCheck.ok) return { success: false, error: await tError(noteCheck.error) }

  const place = await getEditablePlace(db, { id: placeId })
  if (!place) return { success: false, error: t('places.notFound') }

  const mode = await placeEditMode(user, place.projectId)
  if (mode === 'propose') {
    // A member must say why — the curator has nothing else to go on.
    if (!noteCheck.note) return { success: false, error: t('places.removalReasonRequired') }
    if ((await countPendingProposals(user.id)) >= MAX_PENDING_PROPOSALS) {
      return {
        success: false,
        error: await tError({ key: 'places.tooManyPending', params: { max: MAX_PENDING_PROPOSALS } }),
      }
    }
    try {
      await db.placeProposal.create({
        data: {
          kind: 'remove',
          placeId: place.id,
          payload: {},
          note: noteCheck.note,
          baseUpdatedAt: place.updatedAt,
          proposerId: user.id,
        },
      })
    } catch {
      return { success: false, error: t('places.saveFailed') }
    }
    revalidatePath('/admin/places')
    return { success: true, data: { outcome: 'pending' } }
  }

  try {
    await db.$transaction(async (tx) => {
      const proposal = await tx.placeProposal.create({
        data: {
          kind: 'remove',
          placeId: place.id,
          payload: {},
          note: noteCheck.note,
          baseUpdatedAt: place.updatedAt,
          proposerId: user.id,
        },
        select: { id: true, kind: true, placeId: true, payload: true },
      })
      const result = await applyProposal(tx, proposal, user.id)
      if (!result.ok) throw new ApplyError(result)
    })
  } catch {
    return { success: false, error: t('places.saveFailed') }
  }
  log.warn('places.removed', { userId: user.id, placeId: place.id })
  revalidatePlace(place.slug, place.projectId)
  return { success: true, data: { outcome: 'removed' } }
}

/**
 * Places within a few hundred metres of a pin, for the form's "is this
 * already on the map?" warning. Signed-in only; reads through
 * findPlacesNear(), so it only ever returns what the public map shows.
 */
export async function nearbyPlacesAction(position: {
  lat: number
  lng: number
}): Promise<ServerActionResult<Array<{ id: string; slug: string; name: string; lat: number; lng: number }>>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }
  const rl = rateLimit(`${userId}:place-nearby`, 60, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }
  if (!position || !isValidLatLng(position.lat, position.lng)) return { success: true, data: [] }

  try {
    const places = await findPlacesNear(position, 0.5)
    return {
      success: true,
      data: places.map((p) => ({ id: p.id, slug: p.slug, name: p.name, lat: p.lat, lng: p.lng })),
    }
  } catch {
    return { success: true, data: [] }
  }
}
