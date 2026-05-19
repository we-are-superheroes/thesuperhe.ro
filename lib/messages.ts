import 'server-only'
import type { Prisma } from '@prisma/client'

/* ================================================================
   Messaging helpers — keep find-or-create deterministic so two
   parallel "send first message to Maya" calls never spawn two
   conversations.

   For 1-to-1 DMs the participants are always exactly two; we sort
   the ids and join with a ":" so every (a, b) pair maps to one
   conversation row via a unique key.
   ================================================================ */

/**
 * Stable key for the 1-to-1 conversation between two users.
 * sort -> join : same input order always yields the same key.
 */
export function participantsKeyFor(a: string, b: string): string {
  if (a === b) {
    throw new Error('A conversation needs two distinct users.')
  }
  return [a, b].sort().join(':')
}

type TxClient =
  | Prisma.TransactionClient
  | {
      conversation: Prisma.ConversationDelegate
      conversationParticipant: Prisma.ConversationParticipantDelegate
      message: Prisma.MessageDelegate
    }

/**
 * Count distinct conversations that have at least one unread message for the
 * given user (excluding archived conversations). Used for the sidebar badge.
 */
export async function countUnreadConversations(
  tx: TxClient,
  userId: string,
): Promise<number> {
  const client = tx as Prisma.TransactionClient
  const participants = await client.conversationParticipant.findMany({
    where: { userId, archivedAt: null },
    select: { conversationId: true, lastReadAt: true },
  })
  if (participants.length === 0) return 0
  const counts = await Promise.all(
    participants.map((p) =>
      client.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          deletedAt: null,
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      }),
    ),
  )
  return counts.filter((c) => c > 0).length
}

/**
 * Find the 1-to-1 conversation between `a` and `b`, creating it (plus
 * both participant rows) if missing. Idempotent under concurrency:
 *
 *   - participantsKey has a UNIQUE index, so two simultaneous creates
 *     will collide on insert and one of them re-fetches the existing row.
 */
export async function findOrCreateConversation(
  tx: TxClient,
  a: string,
  b: string,
): Promise<{ id: string; created: boolean }> {
  const key = participantsKeyFor(a, b)
  const client = tx as Prisma.TransactionClient

  const existing = await client.conversation.findUnique({
    where: { participantsKey: key },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }

  try {
    const created = await client.conversation.create({
      data: {
        participantsKey: key,
        participants: {
          create: [{ userId: a }, { userId: b }],
        },
      },
      select: { id: true },
    })
    return { id: created.id, created: true }
  } catch {
    // Race: another request just created it. Re-fetch.
    const retry = await client.conversation.findUnique({
      where: { participantsKey: key },
      select: { id: true },
    })
    if (retry) return { id: retry.id, created: false }
    throw new Error('Could not create conversation.')
  }
}
