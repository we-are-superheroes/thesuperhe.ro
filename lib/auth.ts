import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function getCurrentUser() {
  const { userId } = await auth()
  if (!userId) return null

  return db.user.findUnique({ where: { id: userId } })
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthenticated')
  return user
}

/**
 * Server-side admin check. Reads the role from the DB (the source of truth),
 * never from anything the client can influence. Returns false for signed-out
 * users and non-admins.
 *
 * IMPORTANT: this is an authorization gate — call it inside every admin-only
 * server action / route. Hiding UI is not enough on its own.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) return false
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  return user?.role === 'admin'
}

/**
 * Returns the admin's id, or null when the caller isn't an authenticated
 * admin. Use at the top of admin-only server actions:
 *   const adminId = await requireAdmin()
 *   if (!adminId) return { success: false, error: 'Not authorised.' }
 */
export async function requireAdmin(): Promise<string | null> {
  const { userId } = await auth()
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  return user?.role === 'admin' ? user.id : null
}

export { auth, currentUser }
