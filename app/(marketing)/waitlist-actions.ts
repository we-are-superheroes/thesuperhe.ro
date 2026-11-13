'use server'

import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { validateEmail } from '@/lib/validation'
import { tError } from '@/lib/errors'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import { requestWaitlistConfirmation, type WaitlistRequestOutcome } from '@/lib/waitlist'
import { COUNTRY_HEADER, parseAcceptLanguage, parseCountryCode } from '@/lib/waitlist-geo'
import { resolveLocale, DEFAULT_LOCALE } from '@/lib/locale'
import { log } from '@/lib/log'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Guest waitlist signup (pre-launch "notify me when live").

   Double opt-in: this only ever creates/updates a `pending` row and
   emails a confirmation link — it never adds a confirmed subscriber.
   A new address and an already-confirmed one get the same success, so
   a single request can't reveal whether an address is on the list.
   ================================================================ */

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

  // The wording the visitor actually saw and agreed to, in their language —
  // that is what the consent record has to show.
  const locale = await resolveLocale().catch(() => DEFAULT_LOCALE)
  const tMarketing = await getTranslations({ locale, namespace: 'marketing' })
  const consentText = tMarketing('waitlist.consentText')

  // Rough location, so launch e-mails can be sent by country. The country
  // comes from the host's lookup; the IP address itself is not stored.
  const country = parseCountryCode(hdrs.get(COUNTRY_HEADER))
  const acceptLanguage = parseAcceptLanguage(hdrs.get('accept-language'))

  let outcome: WaitlistRequestOutcome
  try {
    outcome = await requestWaitlistConfirmation({
      email,
      locale,
      source: 'home',
      consentText,
      country,
      acceptLanguage,
    })
  } catch (e) {
    log.error('waitlist.action_failed', {
      message: e instanceof Error ? e.message : String(e),
    })
    const t = await getTranslations('errors')
    return { success: false, error: t('waitlist.saveFailed') }
  }

  if (outcome === 'send_failed') {
    const t = await getTranslations('errors')
    return { success: false, error: t('waitlist.saveFailed') }
  }

  // 'throttled': a confirmation went to this address within the last few
  // minutes (the check lives in the database, so it holds across server
  // instances). The form asks the visitor to look in their inbox/spam or try
  // again shortly instead of sending another e-mail.
  if (outcome === 'throttled') return { success: true, data: { queued: true, throttled: true } }

  return { success: true, data: { queued: true } }
}
