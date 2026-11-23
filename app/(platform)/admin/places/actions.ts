'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireCurator } from '@/lib/auth'
import { db } from '@/lib/db'
import { tError } from '@/lib/errors'
import { log } from '@/lib/log'
import { notify } from '@/lib/notifications'
import { ApplyError, applyProposal } from '@/lib/places'
import { translatePlaceLater } from '@/lib/place-translator'
import { PLACE_LIMITS } from '@/lib/places-shared'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Review queue actions — curators and admins only.

   Authorisation is enforced here on every call via requireCurator()
   (role read from the DB). The page hiding itself from non-curators
   is not the gate.

   Both actions are idempotent: the proposal is claimed with an update
   guarded on `status: 'pending'`, so two curators pressing at once
   cannot apply or reject the same proposal twice.
   ================================================================ */

/** Name to show the proposer when the place itself can't supply one. */
function nameFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const name = (payload as { name?: unknown }).name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

export async function approveProposalAction(
  proposalId: string,
): Promise<ServerActionResult<{ slug: string }>> {
  const t = await getTranslations('errors')
  const curator = await requireCurator()
  if (!curator) return { success: false, error: t('admin.notAuthorised') }

  const proposal = await db.placeProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, kind: true, placeId: true, payload: true, proposerId: true, status: true },
  })
  if (!proposal) return { success: false, error: t('places.proposalNotFound') }
  if (proposal.status !== 'pending') return { success: false, error: t('places.proposalAlreadyResolved') }

  try {
    const applied = await db.$transaction(async (tx) => {
      const result = await applyProposal(tx, proposal, curator.id, {
        createdById: proposal.proposerId,
      })
      if (!result.ok) throw new ApplyError(result)
      if (proposal.proposerId) {
        await notify(tx, {
          type: 'place_proposal_approved',
          recipients: [proposal.proposerId],
          actorId: curator.id,
          message: { key: 'placeProposalApproved', params: { placeName: result.name } },
          // A removed place has no page to link to.
          data: proposal.kind === 'remove' ? {} : { placeSlug: result.slug },
        })
      }
      return result
    })
    log.info('places.proposal_approved', {
      curatorId: curator.id,
      proposalId,
      placeId: applied.placeId,
      kind: proposal.kind,
    })
    if (proposal.kind !== 'remove') translatePlaceLater(applied.placeId)
    revalidatePath('/admin/places')
    revalidatePath('/map')
    revalidatePath(`/map/${applied.slug}`)
    revalidatePath('/notifications')
    return { success: true, data: { slug: applied.slug } }
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

export async function rejectProposalAction(
  proposalId: string,
  reason: string,
): Promise<ServerActionResult<{ rejected: true }>> {
  const t = await getTranslations('errors')
  const curator = await requireCurator()
  if (!curator) return { success: false, error: t('admin.notAuthorised') }

  // The proposer is told why, so a reason is required.
  const reviewNote = typeof reason === 'string' ? reason.trim() : ''
  if (!reviewNote) return { success: false, error: t('places.rejectReasonRequired') }
  if (reviewNote.length > PLACE_LIMITS.proposalNote) {
    return {
      success: false,
      error: await tError({
        key: 'places.fieldTooLong',
        params: { field: 'reviewNote', max: PLACE_LIMITS.proposalNote },
      }),
    }
  }

  const proposal = await db.placeProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      payload: true,
      proposerId: true,
      status: true,
      place: { select: { name: true } },
    },
  })
  if (!proposal) return { success: false, error: t('places.proposalNotFound') }

  try {
    const rejected = await db.$transaction(async (tx) => {
      const claimed = await tx.placeProposal.updateMany({
        where: { id: proposalId, status: 'pending' },
        data: { status: 'rejected', reviewerId: curator.id, reviewedAt: new Date(), reviewNote },
      })
      if (claimed.count === 0) return false
      if (proposal.proposerId) {
        await notify(tx, {
          type: 'place_proposal_rejected',
          recipients: [proposal.proposerId],
          actorId: curator.id,
          message: {
            key: 'placeProposalRejected',
            params: { placeName: proposal.place?.name ?? nameFromPayload(proposal.payload) ?? '—' },
          },
          // The curator's own words, shown as written (not translated).
          body: reviewNote,
        })
      }
      return true
    })
    if (!rejected) return { success: false, error: t('places.proposalAlreadyResolved') }
  } catch {
    return { success: false, error: t('places.saveFailed') }
  }

  log.info('places.proposal_rejected', { curatorId: curator.id, proposalId })
  revalidatePath('/admin/places')
  revalidatePath('/notifications')
  return { success: true, data: { rejected: true } }
}
