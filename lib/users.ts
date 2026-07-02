import 'server-only'
import { currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ServerActionResult } from '@/types'

/**
 * Ensure a User row exists for the given Clerk userId. The Clerk webhook
 * normally creates it on sign-up; this fallback covers the window where the
 * webhook is slow (or wasn't configured yet) so first-session actions don't
 * fail. Race-safe: a concurrent insert is treated as success.
 */
export async function ensureUserExists(userId: string): Promise<ServerActionResult<void>> {
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
    // Race — another request (or the webhook) just created the row.
    const retry = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (retry) return { success: true, data: undefined }
    return { success: false, error: 'Could not create user record' }
  }
}
