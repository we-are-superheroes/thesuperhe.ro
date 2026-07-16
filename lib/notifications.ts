import 'server-only'
import type { Prisma, NotificationType } from '@prisma/client'
import {
  renderNotificationTitleEn,
  renderNotificationBodyEn,
  type NotificationMessage,
  type NotificationBodyMessage,
} from '@/lib/notification-messages'

/* ================================================================
   notify() — the single entry point that server actions call to
   write notifications. Always invoked inside the calling action's
   transaction so a state change without its notification (or vice
   versa) cannot happen.

     await notify(tx, {
       type: 'project_join',
       recipients: [leadId],
       actorId: userId,
       projectId,
       message: { key: 'projectJoin', params: { actorName, projectTitle } },
     })

   The stored `title`/`body` are rendered English (snapshot fallback);
   the message key + params are stored in `data.i18n` so the
   notifications page can re-render the row in the reader's language.

   Recipients are computed by the caller (typically the project's
   active leads, or leads + active contributors). This helper:
     - dedupes the recipient list
     - removes the actor from recipients (no self-notify)
     - drops empties / no-ops gracefully
     - inserts in bulk via createMany
   ================================================================ */

/**
 * Prisma's transaction client is a structural subset of the regular client —
 * accept either so callers can pass either `db` or a `tx` from `db.$transaction`.
 */
type TxClient =
  | Prisma.TransactionClient
  | { notification: Prisma.NotificationDelegate }

export interface NotifyParams {
  type: NotificationType
  /** User ids to deliver to. Deduped + actor-filtered internally. */
  recipients: string[]
  actorId?: string
  projectId?: string
  stepId?: string
  blueprintId?: string
  /** Title message key + params — rendered to English for the stored snapshot. */
  message: NotificationMessage
  /** Optional supporting copy (catalogued key + params). */
  bodyMessage?: NotificationBodyMessage
  /** Free-text supporting copy (user-authored excerpts) — not translated. */
  body?: string
  /** Type-specific payload kept small (skill name, milestone amount, etc.). */
  data?: Record<string, unknown>
}

export async function notify(
  tx: TxClient,
  params: NotifyParams,
): Promise<void> {
  // Dedupe + filter out the actor so they don't see their own event.
  const dedup = new Set<string>()
  for (const id of params.recipients) {
    if (!id) continue
    if (params.actorId && id === params.actorId) continue
    dedup.add(id)
  }
  if (dedup.size === 0) return

  // English snapshot for the stored columns; key + params in data.i18n so
  // the reader's locale can re-render the copy at read time.
  const title = renderNotificationTitleEn(params.message)
  const body = params.bodyMessage
    ? renderNotificationBodyEn(params.bodyMessage)
    : (params.body ?? null)
  const data = {
    ...params.data,
    i18n: {
      key: params.message.key,
      ...(params.message.params ? { params: params.message.params } : {}),
      ...(params.bodyMessage
        ? {
            bodyKey: params.bodyMessage.key,
            ...(params.bodyMessage.params ? { bodyParams: params.bodyMessage.params } : {}),
          }
        : {}),
    },
  }

  const rows = Array.from(dedup).map((userId) => ({
    userId,
    type: params.type,
    actorId: params.actorId ?? null,
    projectId: params.projectId ?? null,
    stepId: params.stepId ?? null,
    blueprintId: params.blueprintId ?? null,
    title,
    body,
    data: data as Prisma.InputJsonValue,
  }))

  await (tx as Prisma.TransactionClient).notification.createMany({ data: rows })
}

/* ================================================================
   Small recipient-helper queries used in several server actions.
   ================================================================ */

/** Active project-level leads of a project (excluding the optional caller). */
export async function getProjectLeadIds(
  tx: TxClient,
  projectId: string,
): Promise<string[]> {
  const rows = await (tx as Prisma.TransactionClient).contribution.findMany({
    where: {
      projectId,
      projectStepId: null,
      role: 'lead',
      status: { in: ['active', 'pending'] },
    },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

/** Active project-level members (any role). Capped so a huge team can't
 *  turn one event into an unbounded notification fanout. */
export async function getActiveProjectMemberIds(
  tx: TxClient,
  projectId: string,
): Promise<string[]> {
  const rows = await (tx as Prisma.TransactionClient).contribution.findMany({
    where: {
      projectId,
      projectStepId: null,
      status: { in: ['active', 'pending'] },
    },
    select: { userId: true },
    take: 500,
  })
  return rows.map((r) => r.userId)
}

/* ================================================================
   Message-received notifications — coalesce a burst of unread
   messages from the same sender into a single notification row
   that updates in place. Keeps the inbox readable when someone
   fires off five lines in a row.
   ================================================================ */

const COALESCE_WINDOW_MS = 5 * 60 * 1000

export async function notifyMessageReceived(
  tx: TxClient,
  params: {
    recipientId: string
    senderId: string
    senderName: string
    conversationId: string
  },
): Promise<void> {
  // Skip if the recipient muted this conversation.
  const participant = await (tx as Prisma.TransactionClient).conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: params.conversationId,
        userId: params.recipientId,
      },
    },
    select: { mutedAt: true },
  })
  if (participant?.mutedAt) return

  const cutoff = new Date(Date.now() - COALESCE_WINDOW_MS)
  const client = tx as Prisma.TransactionClient

  // Look for an unread message_received from the same sender in this
  // conversation within the coalesce window.
  const existing = await client.notification.findFirst({
    where: {
      userId: params.recipientId,
      type: 'message_received',
      actorId: params.senderId,
      readAt: null,
      createdAt: { gte: cutoff },
      // Same conversation — stored in data.conversationId on the row.
      data: {
        path: ['conversationId'],
        equals: params.conversationId,
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, data: true },
  })

  if (existing) {
    // Bump the timestamp + increment the count in data so the UI can render
    // "3 new messages from Anna" instead of one stale row.
    const prevData = (existing.data ?? {}) as Record<string, unknown>
    const prevCount =
      typeof prevData.count === 'number' && prevData.count > 0 ? prevData.count : 1
    const nextCount = prevCount + 1
    await client.notification.update({
      where: { id: existing.id },
      data: {
        createdAt: new Date(),
        // The ICU plural covers both the singular and the N-messages copy.
        title: renderNotificationTitleEn({
          key: 'messageReceived',
          params: { senderName: params.senderName, count: nextCount },
        }),
        data: {
          conversationId: params.conversationId,
          count: nextCount,
          i18n: {
            key: 'messageReceived',
            params: { senderName: params.senderName, count: nextCount },
          },
        },
      },
    })
    return
  }

  // Fresh row.
  await client.notification.create({
    data: {
      userId: params.recipientId,
      type: 'message_received',
      actorId: params.senderId,
      title: renderNotificationTitleEn({
        key: 'messageReceived',
        params: { senderName: params.senderName, count: 1 },
      }),
      data: {
        conversationId: params.conversationId,
        count: 1,
        i18n: {
          key: 'messageReceived',
          params: { senderName: params.senderName, count: 1 },
        },
      },
    },
  })
}
