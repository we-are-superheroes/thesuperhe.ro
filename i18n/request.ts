import { getRequestConfig } from 'next-intl/server'
import { resolveLocale } from '@/lib/locale'
import { loadMessages } from '@/i18n/messages'

/**
 * next-intl request config ("without i18n routing" mode). Runs once
 * per request — including server-action POSTs — so `getTranslations`
 * works anywhere on the server with no locale plumbing.
 */
export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return {
    locale,
    messages: await loadMessages(locale),
    // All stored dates are UTC; user-facing times are relative
    // ("3 hours ago"), so a fixed zone avoids server/client drift.
    timeZone: 'UTC',
  }
})
