import { cache } from 'react'
import { cookies, headers } from 'next/headers'

/* ================================================================
   Locale resolution — preference-based, no URL prefixes (see
   docs/i18n-plan.md). Order: signed-in user's stored preference →
   `superhero-locale` cookie → Accept-Language → English.
   ================================================================ */

export const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'ru', 'uk', 'pt'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Cookie carrying the locale for anonymous visitors (and as a fast path). */
export const LOCALE_COOKIE = 'superhero-locale'

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

/**
 * Minimal Accept-Language parse: primary subtags only (pt-BR → pt),
 * ordered by q-value. Deliberately not a full RFC 4647 matcher — with
 * eight known locales, primary-subtag matching is all we need.
 */
export function pickFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const qParam = params.find((p) => p.trim().startsWith('q='))
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 }
    })
    .filter((r) => r.tag && r.q > 0)
    .sort((a, b) => b.q - a.q)
  for (const { tag } of ranked) {
    const primary = tag.split('-')[0]
    if (isSupportedLocale(primary)) return primary
  }
  return null
}

/**
 * Resolve the request's locale. Cached per request so layouts, pages
 * and the next-intl request config all agree without re-reading
 * headers. The signed-in user's stored preference is layered in via
 * the `superhero-locale` cookie, which `setLocaleAction` keeps in sync
 * with `User.locale` — no DB read on the hot path.
 */
export const resolveLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (isSupportedLocale(fromCookie)) return fromCookie

  const headerStore = await headers()
  return pickFromAcceptLanguage(headerStore.get('accept-language')) ?? DEFAULT_LOCALE
})
