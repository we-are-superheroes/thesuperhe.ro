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

export { auth, currentUser }
