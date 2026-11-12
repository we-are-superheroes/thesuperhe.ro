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
   The action always returns the same success, and the only side effect
   a stranger can trigger for an existing address is a re-sent (or
   re-confirmation) email to that address — never a yes/no answer.
   ================================================================ */

function confirmUrl(token: string): string {
  return `${SITE_URL}/api/waitlist/confirm?token=${encodeURIComponent(token)}`
}

function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`
}

async function sendConfirmationEmail(
  email: string,
  locale: string,
  confirmToken: string,
  unsubscribeToken: string,
): Promise<void> {
  const t = await getTranslations({
    locale: isSupportedLocale(locale) ? locale : DEFAULT_LOCALE,
    namespace: 'marketing',
  })
  const unsub = unsubscribeUrl(unsubscribeToken)
  const { html, text } = renderEmail({
    previewText: t('waitlist.email.confirm.preview'),
    heading: t('waitlist.email.confirm.heading'),
    paragraphs: [t('waitlist.email.confirm.p1'), t('waitlist.email.confirm.p2')],
    button: { href: confirmUrl(confirmToken), label: t('waitlist.email.confirm.button') },
    footerLines: [t('waitlist.email.confirm.why')],
    unsubscribe: { url: unsub, label: t('waitlist.email.unsubscribe') },
  })
  await sendEmail({
    to: email,
    subject: t('waitlist.email.confirm.subject'),
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'kind', value: 'waitlist_confirm' }],
  })
}

/**
 * Handle a waitlist signup request. `email` must already be normalised +
 * validated (lib/validation `validateEmail`). Idempotent and enumeration-safe:
 * callers always report the same success regardless of the branch taken.
 */
export async function requestWaitlistConfirmation(params: {
  email: string
  locale: string
  source: string
  consentText: string
}): Promise<void> {
  const { email, locale, source, consentText } = params

  const existing = await db.waitlistSubscriber.findUnique({
    where: { email },
    select: { id: true, status: true, unsubscribeToken: true },
  })

  // Already confirmed — do nothing. No email, no leak.
  if (existing?.status === 'confirmed') return

  const confirmToken = randomUUID()

  if (!existing) {
    const unsubscribeToken = randomUUID()
    await db.waitlistSubscriber.create({
      data: {
        email,
        status: 'pending',
        locale: isSupportedLocale(locale) ? locale : null,
        source,
        confirmToken,
        unsubscribeToken,
        consentText,
        consentedAt: new Date(),
      },
    })
    await sendConfirmationEmail(email, locale, confirmToken, unsubscribeToken)
    log.info('waitlist.subscribe_new', { source })
    return
  }

  // pending or previously unsubscribed → (re)send a fresh confirmation,
  // reusing the stable unsubscribe token.
  await db.waitlistSubscriber.update({
    where: { id: existing.id },
    data: {
      status: 'pending',
      confirmToken,
      locale: isSupportedLocale(locale) ? locale : null,
      source,
      consentText,
      consentedAt: new Date(),
      unsubscribedAt: null,
    },
  })
  await sendConfirmationEmail(email, locale, confirmToken, existing.unsubscribeToken)
  log.info('waitlist.subscribe_resend', { source })
}

export type ConfirmOutcome = 'confirmed' | 'already' | 'invalid'

export async function confirmWaitlist(token: string): Promise<ConfirmOutcome> {
  if (!token) return 'invalid'
  const row = await db.waitlistSubscriber.findUnique({
    where: { confirmToken: token },
    select: { id: true, status: true },
  })
  // Token is cleared on confirm, so a confirmed subscriber clicking again
  // won't match here. Distinguish "invalid" from "already" only for pending.
  if (!row) return 'invalid'
  if (row.status === 'confirmed') return 'already'
  await db.waitlistSubscriber.update({
    where: { id: row.id },
    data: { status: 'confirmed', confirmedAt: new Date(), confirmToken: null },
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
