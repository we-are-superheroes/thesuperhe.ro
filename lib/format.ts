/* Shared formatting helpers (client-safe, pure). All take the resolved
   locale explicitly — server components get it from resolveLocale(),
   client components from useLocale() — so server and client always
   render identical strings and hydration stays clean. */

const rtfCache = new Map<string, Intl.RelativeTimeFormat>()

function rtf(locale: string): Intl.RelativeTimeFormat {
  let cached = rtfCache.get(locale)
  if (!cached) {
    cached = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    rtfCache.set(locale, cached)
  }
  return cached
}

/** Relative "time ago" for feed rows, time logs, message lists. */
export function fmtAgo(ms: number, locale: string, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ms) / 1000))
  if (sec < 60) return rtf(locale).format(0, 'second') // "now"
  const min = Math.round(sec / 60)
  if (min < 60) return rtf(locale).format(-min, 'minute')
  const hr = Math.round(min / 60)
  if (hr < 24) return rtf(locale).format(-hr, 'hour')
  const days = Math.round(hr / 24)
  if (days < 30) return rtf(locale).format(-days, 'day')
  const months = Math.round(days / 30)
  if (months < 12) return rtf(locale).format(-months, 'month')
  return rtf(locale).format(-Math.round(months / 12), 'year')
}

/** "Jul 2026" — join dates, membership since. */
export function fmtMonthYear(d: Date, locale: string): string {
  return d.toLocaleString(locale, { month: 'short', year: 'numeric' })
}

/** "12 July 2026" — prose-adjacent dates. */
export function fmtLongDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Locale short date ("12/07/2026" / "07/12/2026" / "12.07.2026"). */
export function fmtShortDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale)
}

/** Grouped integer ("1,204" / "1 204" / "1.204"). */
export function fmtInt(n: number, locale: string): string {
  return n.toLocaleString(locale)
}
