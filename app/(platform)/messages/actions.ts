'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { findOrCreateConversation } from '@/lib/messages'
import { notifyMessageReceived } from '@/lib/notifications'
import type { ServerActionResult } from '@/types'

const BODY_MAX = 4000

/**
 * Ensure a User row exists for the Clerk userId. Used by send + new-message
 * paths in case the Clerk webhook hasn't synced yet.
 */
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

/**
 * Send a message to another user. Find-or-creates the 1-to-1 conversation
 * by the deterministic participantsKey, inserts the message, bumps the
 * conversation timestamp, and fires a coalesced message_received
 * notification (unless the recipient has muted it).
 */
export async function sendMessageAction(
  recipientUserId: string,
  body: string,
): Promise<ServerActionResult<{ conversationId: string; messageId: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }
  if (recipientUserId === userId) {
    return { success: false, error: 'You can’t message yourself.' }
  }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  const trimmed = body.trim()
  if (!trimmed) return { success: false, error: 'Message can’t be empty.' }
  if (trimmed.length > BODY_MAX) return { success: false, error: `Max ${BODY_MAX} characters.` }

  const recipient = await db.user.findUnique({
    where: { id: recipientUserId },
    select: { id: true },
  })
  if (!recipient) return { success: false, error: 'Recipient not found.' }

  const sender = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })
  const senderName = sender?.name ?? 'Someone'

  let conversationId = ''
  let messageId = ''
  try {
    await db.$transaction(async (tx) => {
      const { id } = await findOrCreateConversation(tx, userId, recipientUserId)
      conversationId = id

      const created = await tx.message.create({
        data: {
          conversationId: id,
          senderId: userId,
          body: trimmed,
        },
        select: { id: true },
      })
      messageId = created.id

      // Bump conversation.updatedAt by touching it (Prisma's @updatedAt fires
      // on any update — we use a no-op data change).
      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      })

      // Stamp the sender's own participant row as read up to this moment so
      // their own message doesn't count as unread for them.
      await tx.conversationParticipant.update({
        where: {
          conversationId_userId: { conversationId: id, userId },
        },
        data: { lastReadAt: new Date() },
      })

      await notifyMessageReceived(tx, {
        recipientId: recipientUserId,
        senderId: userId,
        senderName,
        conversationId: id,
      })
    })
  } catch {
    return { success: false, error: 'Could not send message.' }
  }

  revalidatePath('/messages')
  revalidatePath('/notifications')
  return { success: true, data: { conversationId, messageId } }
}

/**
 * Mark every message in this conversation as read for the caller, by
 * stamping `lastReadAt` on their participant row.
 */
export async function markConversationReadAction(
  conversationId: string,
): Promise<ServerActionResult<{ readAt: number }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const at = new Date()
  const result = await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: at },
  })
  if (result.count === 0) {
    return { success: false, error: 'You’re not in this conversation.' }
  }

  revalidatePath('/messages')
  revalidatePath('/dashboard') // sidebar badge refreshes here
  return { success: true, data: { readAt: at.getTime() } }
}

export async function muteConversationAction(
  conversationId: string,
  muted: boolean,
): Promise<ServerActionResult<{ muted: boolean }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }
  await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { mutedAt: muted ? new Date() : null },
  })
  revalidatePath('/messages')
  return { success: true, data: { muted } }
}

export async function archiveConversationAction(
  conversationId: string,
  archived: boolean,
): Promise<ServerActionResult<{ archived: boolean }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }
  await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { archivedAt: archived ? new Date() : null },
  })
  revalidatePath('/messages')
  return { success: true, data: { archived } }
}

export async function deleteMessageAction(
  messageId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, conversationId: true, deletedAt: true },
  })
  if (!message) return { success: false, error: 'Message not found.' }
  if (message.senderId !== userId) {
    return { success: false, error: 'You can only delete your own messages.' }
  }
  if (message.deletedAt) return { success: true, data: { deleted: true } }

  await db.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  })

  revalidatePath('/messages')
  return { success: true, data: { deleted: true } }
}

/**
 * Type-ahead user search for the "New message" popover. Returns up to 10
 * users whose name or email starts with / contains the query. Excludes
 * the caller.
 */
export async function searchUsersAction(
  query: string,
): Promise<
  ServerActionResult<
    { id: string; name: string; avatarUrl: string | null; location: string | null }[]
  >
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const q = query.trim()
  if (q.length < 1) return { success: true, data: [] }

  const matches = await db.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ name: 'asc' }],
    take: 10,
    select: { id: true, name: true, avatarUrl: true, location: true },
  })

  return { success: true, data: matches }
}
