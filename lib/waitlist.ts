import 'server-only'
import { randomUUID } from 'node:crypto'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-templates'
import { SITE_URL } from '@/lib/site'
import { log } from '@/lib/log'
import { DEFAULT_LOCALE, isSupportedLocale } from '@/lib/locale-shared'

/* ================================================================
   Guest waitlist service — double opt-in state machine + the emails.

   States: pending → confirmed → unsubscribed. The server action keeps
   validation/rate-limiting; this module owns the DB transitions and
   the (localised) emails so routes and the action stay thin.

   Privacy: we never reveal whether an address is already on the list.
   The only side effect a stranger can trigger for an existing address
   is a re-sent confirmation email to that address — at most one per
   WAITLIST_RESEND_WINDOW_MS — never a yes/no answer.

   Link safety: the links in the emails open PAGES with a button; the
   state change itself is a POST. Mail scanners and link previewers
   fetch every URL in a message, so a GET that confirmed or
   unsubscribed would let them do it on the recipient's behalf.
   ================================================================ */

/** At most one confirmation e-mail per address per this window. */
export const WAITLIST_RESEND_WINDOW_MS = 5 * 60 * 1000

/** Page with the "confirm my e-mail" button (the link in the e-mail). */
export function waitlistConfirmPageUrl(token: string): string {
  return `${SITE_URL}/waitlist/confirm?token=${encodeURIComponent(token)}`
}

/** Page with the "unsubscribe" button (the human-clickable footer link). */
export function waitlistUnsubscribePageUrl(token: string): string {
  return `${SITE_URL}/waitlist/unsubscribe?token=${encodeURIComponent(token)}`
}

/** RFC 8058 one-click endpoint — only for the List-Unsubscribe header. */
export function waitlistUnsubscribeOneClickUrl(token: string): string {
  return `${SITE_URL}/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`
}

/** Headers that give mail clients a native one-click unsubscribe. */
export function waitlistUnsubscribeHeaders(token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${waitlistUnsubscribeOneClickUrl(token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/** Returns whether the provider accepted the e-mail. */
async function sendConfirmationEmail(
  email: string,
  locale: string,
  confirmToken: string,
  unsubscribeToken: string,
): Promise<boolean> {
  const t = await getTranslations({
    locale: isSupportedLocale(locale) ? locale : DEFAULT_LOCALE,
    namespace: 'marketing',
  })
  const { html, text } = renderEmail({
    previewText: t('waitlist.email.confirm.preview'),
    heading: t('waitlist.email.confirm.heading'),
    paragraphs: [t('waitlist.email.confirm.p1'), t('waitlist.email.confirm.p2')],
    button: {
      href: waitlistConfirmPageUrl(confirmToken),
      label: t('waitlist.email.confirm.button'),
    },
    footerLines: [t('waitlist.email.confirm.why')],
    unsubscribe: {
      url: waitlistUnsubscribePageUrl(unsubscribeToken),
      label: t('waitlist.email.unsubscribe'),
    },
  })
  const result = await sendEmail({
    to: email,
    subject: t('waitlist.email.confirm.subject'),
    html,
    text,
    headers: waitlistUnsubscribeHeaders(unsubscribeToken),
    tags: [{ name: 'kind', value: 'waitlist_confirm' }],
  })
  return result.ok
}

/**
 * What a signup request did:
 *  - sent        a confirmation e-mail went out
 *  - throttled   one already went out to this address within the window
 *  - noop        the address is already confirmed (nothing to do)
 *  - send_failed the provider refused the e-mail; nothing was recorded as sent
 */
export type WaitlistRequestOutcome = 'sent' | 'throttled' | 'noop' | 'send_failed'

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002'
}

/**
 * Handle a waitlist signup request. `email` must already be normalised +
 * validated (lib/validation `validateEmail`). `consentedAt` doubles as the
 * resend clock: it is only left at "now" when a confirmation e-mail really
 * went out, so a failed send never blocks the visitor from trying again.
 */
export async function requestWaitlistConfirmation(params: {
  email: string
  locale: string
  source: string
  consentText: string
  /** ISO country code of the request, when the host could tell. */
  country?: string | null
  /** The browser's language tags (lib/waitlist-geo `parseAcceptLanguage`). */
  acceptLanguage?: string | null
}): Promise<WaitlistRequestOutcome> {
  const { email, locale, source, consentText } = params
  const country = params.country ?? null
  const acceptLanguage = params.acceptLanguage ?? null

  const existing = await db.waitlistSubscriber.findUnique({
    where: { email },
    select: {
      id: true,
      status: true,
      confirmToken: true,
      unsubscribeToken: true,
      consentedAt: true,
    },
  })

  // Already confirmed — do nothing. No email, no leak.
  if (existing?.status === 'confirmed') return 'noop'

  const now = new Date()

  // A confirmation went out to this address moments ago — don't send another.
  if (
    existing?.status === 'pending' &&
    existing.consentedAt &&
    now.getTime() - existing.consentedAt.getTime() < WAITLIST_RESEND_WINDOW_MS
  ) {
    return 'throttled'
  }

  const storedLocale = isSupportedLocale(locale) ? locale : null

  if (!existing) {
    const confirmToken = randomUUID()
    const unsubscribeToken = randomUUID()
    let created: { id: string }
    try {
      created = await db.waitlistSubscriber.create({
        data: {
          email,
          status: 'pending',
          locale: storedLocale,
          source,
          country,
          acceptLanguage,
          confirmToken,
          unsubscribeToken,
          consentText,
          consentedAt: now,
        },
        select: { id: true },
      })
    } catch (e) {
      // Two submits of the same new address raced; the other one is sending.
      if (isUniqueViolation(e)) return 'throttled'
      throw e
    }
    const ok = await sendConfirmationEmail(email, locale, confirmToken, unsubscribeToken)
    if (!ok) {
      // Nothing reached the visitor, so don't keep a row they can't confirm.
      await db.waitlistSubscriber.delete({ where: { id: created.id } }).catch(() => {})
      log.error('waitlist.confirmation_not_sent', { source, fresh: true })
      return 'send_failed'
    }
    log.info('waitlist.subscribe_new', { source })
    return 'sent'
  }

  // Pending (window elapsed) or previously unsubscribed → send a confirmation.
  // A pending row keeps its token so links in earlier e-mails still work.
  const confirmToken =
    existing.status === 'pending' && existing.confirmToken ? existing.confirmToken : randomUUID()

  await db.waitlistSubscriber.update({
    where: { id: existing.id },
    data: {
      status: 'pending',
      confirmToken,
      locale: storedLocale,
      source,
      // Only overwrite with something known — a request without the headers
      // must not wipe what an earlier signup told us.
      ...(country ? { country } : {}),
      ...(acceptLanguage ? { acceptLanguage } : {}),
      consentText,
      consentedAt: now,
      unsubscribedAt: null,
    },
  })
  const ok = await sendConfirmationEmail(email, locale, confirmToken, existing.unsubscribeToken)
  if (!ok) {
    // Put the resend clock back so the visitor can try again straight away.
    await db.waitlistSubscriber
      .update({ where: { id: existing.id }, data: { consentedAt: existing.consentedAt } })
      .catch(() => {})
    log.error('waitlist.confirmation_not_sent', { source, fresh: false })
    return 'send_failed'
  }
  log.info('waitlist.subscribe_resend', { source })
  return 'sent'
}

export type ConfirmOutcome = 'confirmed' | 'already' | 'invalid'

/**
 * Confirm a pending subscriber. The token stays on the row afterwards so a
 * second click reports "already confirmed" rather than "link expired"; it is
 * only cleared when the subscriber unsubscribes.
 */
export async function confirmWaitlist(token: string): Promise<ConfirmOutcome> {
  if (!token) return 'invalid'
  const row = await db.waitlistSubscriber.findUnique({
    where: { confirmToken: token },
    select: { id: true, status: true },
  })
  if (!row) return 'invalid'
  if (row.status === 'confirmed') return 'already'
  if (row.status !== 'pending') return 'invalid'
  await db.waitlistSubscriber.update({
    where: { id: row.id },
    data: { status: 'confirmed', confirmedAt: new Date() },
  })
  return 'confirmed'
}

export type UnsubscribeOutcome = 'ok' | 'invalid'

export async function unsubscribeWaitlist(token: string): Promise<UnsubscribeOutcome> {
  if (!token) return 'invalid'
  const row = await db.waitlistSubscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true },
  })
  if (!row) return 'invalid'
  await db.waitlistSubscriber.update({
    where: { id: row.id },
    data: { status: 'unsubscribed', unsubscribedAt: new Date(), confirmToken: null },
  })
  return 'ok'
}
