import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { findOrCreateConversation } from '@/lib/messages'
import {
  MessagesClient,
  type ConversationListItem,
  type ThreadData,
} from '@/components/platform/messages-client'

/* ================================================================
   /messages — server component.
   Resolves which conversation to open from the query string
   (?conversation=<id> or ?to=<userId>), loads the conversation
   list + the chosen thread, and hands it to the client.
   ================================================================ */

interface SearchParams {
  searchParams: Promise<{
    conversation?: string
    to?: string
    view?: string
  }>
}

const PRESENCE_WINDOW_MS = 5 * 60 * 1000

export default async function MessagesPage({ searchParams }: SearchParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const params = await searchParams
  const view: 'inbox' | 'archived' = params.view === 'archived' ? 'archived' : 'inbox'

  // If ?to=<userId> is set, find-or-create the conversation and use it as
  // the open thread. Lets the "Send a message" button from a profile drop
  // us straight into a DM.
  let openConversationId: string | null = params.conversation ?? null
  if (!openConversationId && params.to) {
    const toUser = await db.user.findUnique({
      where: { id: params.to },
      select: { id: true },
    })
    if (toUser && toUser.id !== userId) {
      const { id } = await findOrCreateConversation(db, userId, toUser.id)
      openConversationId = id
    }
  }

  // Conversation list — all the user's participant rows, with the peer
  // user, the latest message, and the unread count derived from
  // (lastReadAt, message.createdAt).
  const myParticipants = await db.conversationParticipant.findMany({
    where: {
      userId,
      ...(view === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
    select: {
      lastReadAt: true,
      mutedAt: true,
      conversation: {
        select: {
          id: true,
          updatedAt: true,
          participants: {
            where: { userId: { not: userId } },
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  location: true,
                  timezone: true,
                  lastSeenAt: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              body: true,
              senderId: true,
              createdAt: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  })

  // Compute per-conversation unread counts in one round-trip.
  const conversationIds = myParticipants.map((p) => p.conversation.id)
  const unreadCounts = new Map<string, number>()
  if (conversationIds.length > 0) {
    // For each conversation, count messages from other senders whose
    // createdAt > the caller's lastReadAt (or any, if lastReadAt is null).
    const counts = await Promise.all(
      myParticipants.map(async (p) =>
        db.message.count({
          where: {
            conversationId: p.conversation.id,
            senderId: { not: userId },
            deletedAt: null,
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        }),
      ),
    )
    myParticipants.forEach((p, i) => unreadCounts.set(p.conversation.id, counts[i]))
  }

  const now = Date.now()
  const presenceOnline = (lastSeenAt: Date | null): boolean =>
    !!lastSeenAt && now - lastSeenAt.getTime() < PRESENCE_WINDOW_MS

  const conversations: ConversationListItem[] = myParticipants.map((p) => {
    const peer = p.conversation.participants[0]?.user
    const last = p.conversation.messages[0]
    return {
      id: p.conversation.id,
      peer: peer
        ? {
            id: peer.id,
            name: peer.name,
            avatarUrl: peer.avatarUrl,
            location: peer.location,
            timezone: peer.timezone,
            online: presenceOnline(peer.lastSeenAt),
          }
        : null,
      lastMessage: last
        ? {
            id: last.id,
            // Snippet: empty if deleted, "You: …" prefix if sent by caller.
            preview: last.deletedAt
              ? '[deleted]'
              : last.senderId === userId
                ? `You: ${last.body}`
                : last.body,
            ts: last.createdAt.getTime(),
          }
        : null,
      unreadCount: unreadCounts.get(p.conversation.id) ?? 0,
      muted: !!p.mutedAt,
      updatedAt: p.conversation.updatedAt.getTime(),
    }
  })

  // If no ?conversation specified, default to the most recent one.
  if (!openConversationId && conversations.length > 0) {
    openConversationId = conversations[0].id
  }

  // Open thread payload.
  let thread: ThreadData | null = null
  if (openConversationId) {
    const conv = await db.conversation.findUnique({
      where: { id: openConversationId },
      select: {
        id: true,
        participants: {
          select: {
            userId: true,
            mutedAt: true,
            archivedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                location: true,
                timezone: true,
                lastSeenAt: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: {
            id: true,
            body: true,
            senderId: true,
            createdAt: true,
            editedAt: true,
            deletedAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Only render if the caller is actually a participant.
    const mine = conv?.participants.find((p) => p.userId === userId)
    if (conv && mine) {
      const peerParticipant = conv.participants.find((p) => p.userId !== userId)
      const peer = peerParticipant?.user ?? null

      thread = {
        conversationId: conv.id,
        muted: !!mine.mutedAt,
        archived: !!mine.archivedAt,
        peer: peer
          ? {
              id: peer.id,
              name: peer.name,
              avatarUrl: peer.avatarUrl,
              location: peer.location,
              timezone: peer.timezone,
              online: presenceOnline(peer.lastSeenAt),
            }
          : null,
        messages: conv.messages.map((m) => ({
          id: m.id,
          body: m.body,
          senderId: m.senderId,
          senderName: m.sender?.name ?? null,
          ts: m.createdAt.getTime(),
          edited: !!m.editedAt,
          deleted: !!m.deletedAt,
          mine: m.senderId === userId,
        })),
      }
    }
  }

  // Current user (for the "mine" message avatar).
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarUrl: true },
  })

  return (
    <MessagesClient
      currentUser={{
        id: me?.id ?? userId,
        name: me?.name ?? 'You',
        avatarUrl: me?.avatarUrl ?? null,
      }}
      conversations={conversations}
      openConversationId={openConversationId}
      thread={thread}
      view={view}
    />
  )
}
