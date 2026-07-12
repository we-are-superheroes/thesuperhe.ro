'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { tError } from '@/lib/errors'
import { db } from '@/lib/db'
import { notify, getProjectLeadIds } from '@/lib/notifications'
import type { ErrorDescriptor } from '@/lib/validation'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Notification actions: mark read + actionable resolve flows
   ================================================================ */

export async function markNotificationReadAction(
  notificationId: string,
): Promise<ServerActionResult<{ markedRead: boolean }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  // Scoped by userId so a caller can't mark someone else's row.
  const result = await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  })

  revalidatePath('/notifications')
  // Sidebar badge lives in the platform layout — revalidate everything platform-side.
  revalidatePath('/dashboard')
  return { success: true, data: { markedRead: result.count > 0 } }
}

export async function markAllNotificationsReadAction(): Promise<
  ServerActionResult<{ markedRead: number }>
> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const result = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })

  revalidatePath('/notifications')
  revalidatePath('/dashboard')
  return { success: true, data: { markedRead: result.count } }
}

/* ================================================================
   Accept / Decline a project_join_request notification.
   Both are lead-authz'd, both set resolvedAt + readAt on the request,
   and accept also flips the pending Contribution to active and pings
   the applicant so they know they're in.
   ================================================================ */

interface JoinRequestData {
  contributionId?: unknown
}

type LoadedRequest = {
  id: string
  userId: string
  projectId: string
  actorId: string
  project: { title: string } | null
}

type LoadResult =
  | { ok: false; error: ErrorDescriptor }
  | { ok: true; notification: LoadedRequest; contributionId: string }

async function loadJoinRequest(notificationId: string, userId: string): Promise<LoadResult> {
  const n = await db.notification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      userId: true,
      type: true,
      projectId: true,
      actorId: true,
      resolvedAt: true,
      data: true,
      project: { select: { title: true } },
    },
  })
  if (!n) return { ok: false, error: { key: 'notifications.notFound' } }
  if (n.userId !== userId) return { ok: false, error: { key: 'notifications.notYours' } }
  if (n.type !== 'project_join_request')
    return { ok: false, error: { key: 'notifications.notAJoinRequest' } }
  if (n.resolvedAt) return { ok: false, error: { key: 'notifications.alreadyResolved' } }
  if (!n.projectId || !n.actorId)
    return { ok: false, error: { key: 'notifications.joinRequestMissingContext' } }

  // Caller must currently be a lead of the referenced project.
  const lead = await db.contribution.findFirst({
    where: {
      userId,
      projectId: n.projectId,
      projectStepId: null,
      role: 'lead',
      status: { in: ['active', 'pending'] },
    },
    select: { id: true },
  })
  if (!lead) return { ok: false, error: { key: 'notifications.onlyLeadCanResolve' } }

  const data = (n.data ?? {}) as JoinRequestData
  const contributionId = typeof data.contributionId === 'string' ? data.contributionId : null
  if (!contributionId)
    return { ok: false, error: { key: 'notifications.joinRequestMissingContributionId' } }

  return {
    ok: true,
    notification: {
      id: n.id,
      userId: n.userId,
      projectId: n.projectId,
      actorId: n.actorId,
      project: n.project,
    },
    contributionId,
  }
}

export async function acceptJoinRequestAction(
  notificationId: string,
): Promise<ServerActionResult<{ accepted: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const loaded = await loadJoinRequest(notificationId, userId)
  if (!loaded.ok) return { success: false, error: await tError(loaded.error) }
  const { notification: n, contributionId } = loaded

  // Look up the applicant's name + the lead's name for the confirmation copy.
  const [applicant, lead] = await Promise.all([
    db.user.findUnique({ where: { id: n.actorId }, select: { name: true } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ])
  const applicantName = applicant?.name ?? 'A contributor'
  const leadName = lead?.name ?? 'The project lead'
  const projectTitle = n.project?.title ?? 'the project'

  try {
    await db.$transaction(async (tx) => {
      // Flip the pending Contribution to active. Idempotent: only update if
      // still pending (don't accidentally re-activate a withdrawn row).
      const flipped = await tx.contribution.updateMany({
        where: { id: contributionId, status: 'pending' },
        data: { status: 'active' },
      })
      // Resolve + mark the request read.
      await tx.notification.update({
        where: { id: n.id },
        data: { resolvedAt: new Date(), readAt: new Date() },
      })

      // If we actually accepted (vs already accepted earlier), notify the
      // applicant + other leads that the join went through.
      if (flipped.count > 0) {
        await notify(tx, {
          type: 'project_join',
          recipients: [n.actorId],
          actorId: userId,
          projectId: n.projectId,
          message: { key: 'projectJoinWelcome', params: { leadName, projectTitle } },
        })
        const leadIds = await getProjectLeadIds(tx, n.projectId)
        await notify(tx, {
          type: 'project_join',
          recipients: leadIds,
          actorId: n.actorId, // self-filter excludes the applicant from leadIds (they're not yet a lead anyway)
          projectId: n.projectId,
          message: { key: 'projectJoin', params: { actorName: applicantName, projectTitle } },
        })
      }
    })
  } catch {
    return { success: false, error: t('notifications.acceptFailed') }
  }

  revalidatePath('/notifications')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${n.projectId}`)
  return { success: true, data: { accepted: true } }
}

export async function declineJoinRequestAction(
  notificationId: string,
): Promise<ServerActionResult<{ declined: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const loaded = await loadJoinRequest(notificationId, userId)
  if (!loaded.ok) return { success: false, error: await tError(loaded.error) }
  const { notification: n, contributionId } = loaded

  const projectTitle = n.project?.title ?? 'the project'

  try {
    await db.$transaction(async (tx) => {
      // Delete the pending Contribution — keeps the unique slot free so the
      // applicant could request again later if they wanted.
      const deleted = await tx.contribution.deleteMany({
        where: { id: contributionId, status: 'pending' },
      })
      await tx.notification.update({
        where: { id: n.id },
        data: { resolvedAt: new Date(), readAt: new Date() },
      })
      // Tell the applicant — being quietly ignored is worse than a polite no.
      // Only on the first resolution (deleted.count guards double-decline).
      if (deleted.count > 0) {
        await notify(tx, {
          type: 'project_join_declined',
          recipients: [n.actorId],
          projectId: n.projectId,
          message: { key: 'projectJoinDeclined', params: { projectTitle } },
          bodyMessage: { key: 'projectJoinDeclined' },
        })
      }
    })
  } catch {
    return { success: false, error: t('notifications.declineFailed') }
  }

  revalidatePath('/notifications')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${n.projectId}`)
  return { success: true, data: { declined: true } }
}
