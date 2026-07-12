/* ================================================================
   Locale constants shared by server and client code. Keep this file
   free of server-only imports (next/headers, Clerk, Prisma) — the
   LocaleSwitcher and tests import from here. The request-scoped
   resolver lives in lib/locale.ts.
   ================================================================ */

export const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'ru', 'uk', 'pt'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Cookie carrying the locale for anonymous visitors (and as a fast path). */
export const LOCALE_COOKIE = 'superhero-locale'

/** Native-language names, shown in the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  ru: 'Русский',
  uk: 'Українська',
  pt: 'Português',
}

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
