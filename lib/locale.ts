import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isSupportedLocale,
  pickFromAcceptLanguage,
  type Locale,
} from '@/lib/locale-shared'

export * from '@/lib/locale-shared'

/* ================================================================
   Locale resolution — preference-based, no URL prefixes (see
   docs/i18n-plan.md). Order: signed-in user's stored preference →
   `superhero-locale` cookie → Accept-Language → English.
   ================================================================ */

/**
 * Resolve the request's locale. Cached per request so layouts, pages
 * and the next-intl request config all agree without re-reading
 * anything. The account preference wins over the cookie so a locale
 * chosen on one device follows the account to every other; the DB
 * read is a primary-key lookup of a single column, and
 * `setLocaleAction` keeps the cookie in sync as a fallback for the
 * signed-out state.
 */
export const resolveLocale = cache(async (): Promise<Locale> => {
  const { userId } = await auth()
  if (userId) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { locale: true },
      })
      if (isSupportedLocale(user?.locale)) return user.locale
    } catch {
      // A failed preference read must never take the page down —
      // fall through to cookie / header resolution.
    }
  }

  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isSupportedLocale(fromCookie)) return fromCookie

  const headerStore = await headers()
  return pickFromAcceptLanguage(headerStore.get('accept-language')) ?? DEFAULT_LOCALE
})
