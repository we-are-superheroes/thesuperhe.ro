import 'server-only'
import type { Prisma, NotificationType } from '@prisma/client'

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
       title: `${actorName} joined ${projectTitle}.`,
     })

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
  /** Pre-rendered title copy — snapshotted, not re-fetched at read time. */
  title: string
  /** Optional supporting copy (excerpt, detail). */
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

  const rows = Array.from(dedup).map((userId) => ({
    userId,
    type: params.type,
    actorId: params.actorId ?? null,
    projectId: params.projectId ?? null,
    stepId: params.stepId ?? null,
    blueprintId: params.blueprintId ?? null,
    title: params.title,
    body: params.body ?? null,
    data: (params.data as Prisma.InputJsonValue | undefined) ?? undefined,
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

/** Active project-level members (any role). */
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
  })
  return rows.map((r) => r.userId)
}
