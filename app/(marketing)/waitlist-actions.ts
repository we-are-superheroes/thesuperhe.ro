'use server'

import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { validateEmail } from '@/lib/validation'
import { tError } from '@/lib/errors'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import { requestWaitlistConfirmation } from '@/lib/waitlist'
import { resolveLocale, DEFAULT_LOCALE } from '@/lib/locale'
import { log } from '@/lib/log'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Guest waitlist signup (pre-launch "notify me when live").

   Double opt-in: this only ever creates/updates a `pending` row and
   emails a confirmation link — it never adds a confirmed subscriber.
   Enumeration-safe: every path that isn't a validation/rate-limit
   error returns the same success, so the response can't reveal
   whether an address is already on the list.
   ================================================================ */

/** At most one confirmation (re)send per address per this window. */
const WAITLIST_RESEND_WINDOW_MS = 5 * 60 * 1000

export async function subscribeWaitlistAction(
  rawEmail: string,
): Promise<ServerActionResult<{ queued: true; throttled?: boolean }>> {
  const check = validateEmail(rawEmail)
  if (!check.ok) return { success: false, error: await tError(check.error) }
  const email = check.email

  // Rate-limit per client IP: 5 signups / 10 min. Blunts enumeration and
  // mailbombing a victim's address. Falls back to a shared bucket when the
  // IP header is absent (dev), which only tightens the limit.
  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for')?.split(',')[0] ?? hdrs.get('x-real-ip') ?? 'unknown').trim()
  const limited = rateLimit(`waitlist:${ip}`, 5, 10 * 60 * 1000)
  if (!limited.ok) return { success: false, error: await tError(rateLimitError(limited)) }

  // Per-address throttle: at most one (re)send per window, so repeat submits
  // of the same address don't fan out into several confirmation e-mails. Keyed
  // on the address alone and returning the same generic success — it never
  // reveals whether the address is already on the list; the UI just asks the
  // visitor to check their inbox/spam or try again shortly.
  const resend = rateLimit(`waitlist-email:${email}`, 1, WAITLIST_RESEND_WINDOW_MS)
  if (!resend.ok) return { success: true, data: { queued: true, throttled: true } }

  const locale = await resolveLocale().catch(() => DEFAULT_LOCALE)
  const tEn = await getTranslations({ locale: 'en', namespace: 'marketing' })
  const consentText = tEn('waitlist.consentText')

  try {
    await requestWaitlistConfirmation({ email, locale, source: 'home', consentText })
  } catch (e) {
    log.error('waitlist.action_failed', {
      message: e instanceof Error ? e.message : String(e),
    })
    const t = await getTranslations('errors')
    return { success: false, error: t('waitlist.saveFailed') }
  }

  return { success: true, data: { queued: true } }
}
