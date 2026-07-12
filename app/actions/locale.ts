'use server'

import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { LOCALE_COOKIE, isSupportedLocale } from '@/lib/locale-shared'

type SetLocaleResult = { success: true } | { success: false; error: string }

/**
 * Store the visitor's language choice: always in the cookie (so
 * anonymous visitors keep it), and on the account when signed in (so
 * it follows them to other devices). Callers refresh the router
 * afterwards — the next render resolves the new locale.
 */
export async function setLocaleAction(locale: string): Promise<SetLocaleResult> {
  if (!isSupportedLocale(locale)) {
    return { success: false, error: 'That language is not available.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  const { userId } = await auth()
  if (userId) {
    try {
      await db.user.update({ where: { id: userId }, data: { locale } })
    } catch {
      // The cookie is already set, so the page still switches — the
      // account preference just won't follow to other devices yet.
    }
  }

  return { success: true }
}
