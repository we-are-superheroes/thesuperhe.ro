'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { tError } from '@/lib/errors'
import { log } from '@/lib/log'
import { validateEmail } from '@/lib/validation'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Granting and revoking the curator role — admins only.

   These actions only ever move a user between `member` and `curator`.
   They never create or remove an admin: that stays an out-of-band
   database change, as before. Every change is logged.
   ================================================================ */

export async function grantCuratorAction(
  rawEmail: string,
): Promise<ServerActionResult<{ id: string; name: string }>> {
  const t = await getTranslations('errors')
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: t('admin.notAuthorised') }

  const check = validateEmail(typeof rawEmail === 'string' ? rawEmail : '')
  if (!check.ok) return { success: false, error: await tError({ key: 'places.curatorEmailInvalid' }) }

  // E-mails are stored as Clerk gives them; match without regard to case.
  const user = await db.user.findFirst({
    where: { email: { equals: check.email, mode: 'insensitive' } },
    select: { id: true, name: true, role: true },
  })
  if (!user) return { success: false, error: t('places.curatorNotFound') }
  if (user.role !== 'member') return { success: false, error: t('places.curatorAlready') }

  try {
    // Guarded on the current role so a concurrent change can't be overwritten.
    const updated = await db.user.updateMany({
      where: { id: user.id, role: 'member' },
      data: { role: 'curator' },
    })
    if (updated.count === 0) return { success: false, error: t('places.curatorAlready') }
  } catch {
    return { success: false, error: t('places.curatorSaveFailed') }
  }

  log.warn('admin.curator_granted', { adminId, userId: user.id })
  revalidatePath('/admin/curators')
  return { success: true, data: { id: user.id, name: user.name } }
}

export async function revokeCuratorAction(
  userId: string,
): Promise<ServerActionResult<{ revoked: true }>> {
  const t = await getTranslations('errors')
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: t('admin.notAuthorised') }

  try {
    // Only ever curator → member: an admin row never matches this filter.
    const updated = await db.user.updateMany({
      where: { id: userId, role: 'curator' },
      data: { role: 'member' },
    })
    if (updated.count === 0) return { success: false, error: t('places.curatorNotFound') }
  } catch {
    return { success: false, error: t('places.curatorSaveFailed') }
  }

  log.warn('admin.curator_revoked', { adminId, userId })
  revalidatePath('/admin/curators')
  return { success: true, data: { revoked: true } }
}
