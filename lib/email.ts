import 'server-only'
import { Resend } from 'resend'
import { log } from '@/lib/log'

/* ================================================================
   Email sending — the single pipe both the guest waitlist and the
   user-notification emails go through. Resend is the provider.

   Degrades gracefully: with no RESEND_API_KEY (local dev, preview
   before the key is set) nothing is sent — the email, INCLUDING any
   confirm/unsubscribe link, is logged so the flow is still testable.
   Real sends need a verified sending domain (SPF/DKIM/DMARC on
   thesuperhe.ro) configured in Resend — see DEPLOYMENT.md.
   ================================================================ */

const FROM = process.env.EMAIL_FROM ?? 'The Superhero <hello@thesuperhe.ro>'

// Lazy singleton: only constructed when a key is present, and reused
// across warm invocations like the Prisma client.
const globalForEmail = globalThis as unknown as { resend?: Resend | null }

function getClient(): Resend | null {
  if (globalForEmail.resend !== undefined) return globalForEmail.resend
  const key = process.env.RESEND_API_KEY
  globalForEmail.resend = key ? new Resend(key) : null
  return globalForEmail.resend
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text: string
  /** Extra headers, e.g. List-Unsubscribe for marketing / notification mail. */
  headers?: Record<string, string>
  /** Resend tags for analytics (e.g. [{ name: 'kind', value: 'waitlist' }]). */
  tags?: { name: string; value: string }[]
}

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getClient()

  if (!client) {
    // No key — log the whole thing (links included) so dev + preview can
    // follow the flow without a provider, then report success so callers
    // don't surface a failure for a deliberately unconfigured environment.
    log.info('email.skipped_no_key', {
      to: params.to,
      subject: params.subject,
      headers: params.headers,
      text: params.text,
    })
    return { ok: true, id: null }
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      headers: params.headers,
      tags: params.tags,
    })
    if (error) {
      log.error('email.send_failed', { to: params.to, subject: params.subject, message: error.message })
      return { ok: false, error: error.message }
    }
    return { ok: true, id: data?.id ?? null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.error('email.send_threw', { to: params.to, subject: params.subject, message })
    return { ok: false, error: message }
  }
}

/** Resend's batch endpoint takes at most this many e-mails per call. */
export const EMAIL_BATCH_SIZE = 100

/**
 * Send up to EMAIL_BATCH_SIZE e-mails in ONE provider call (the launch
 * broadcast). Returns, per item and in order, whether the provider accepted
 * it — so the caller can record exactly who was sent what. Never throws: if
 * the whole call fails, every item is reported as not sent.
 */
export async function sendEmailBulk(items: SendEmailParams[]): Promise<boolean[]> {
  if (items.length === 0) return []
  if (items.length > EMAIL_BATCH_SIZE) {
    throw new Error(`sendEmailBulk takes at most ${EMAIL_BATCH_SIZE} e-mails per call`)
  }
  const client = getClient()

  if (!client) {
    for (const item of items) {
      log.info('email.skipped_no_key', {
        to: item.to,
        subject: item.subject,
        headers: item.headers,
        text: item.text,
      })
    }
    return items.map(() => true)
  }

  try {
    // 'permissive': one bad address is reported by index instead of
    // rejecting the whole batch.
    const { data, error } = await client.batch.send(
      items.map((item) => ({
        from: FROM,
        to: item.to,
        subject: item.subject,
        html: item.html,
        text: item.text,
        headers: item.headers,
        tags: item.tags,
      })),
      { batchValidation: 'permissive' },
    )
    if (error || !data) {
      log.error('email.batch_failed', { count: items.length, message: error?.message })
      return items.map(() => false)
    }
    const rejected = new Set((data.errors ?? []).map((e) => e.index))
    if (rejected.size > 0) {
      log.error('email.batch_partial', { count: items.length, rejected: rejected.size })
    }
    return items.map((_, i) => !rejected.has(i))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    log.error('email.batch_threw', { count: items.length, message })
    return items.map(() => false)
  }
}
