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

/**
 * Send many emails with bounded concurrency (the launch broadcast + the
 * notification digest sweep). Returns per-recipient outcomes so the caller
 * can record what went out. Never throws — a single bad address must not
 * sink the batch.
 */
export async function sendEmailBatch(
  items: SendEmailParams[],
  concurrency = 5,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency)
    const results = await Promise.all(slice.map((item) => sendEmail(item)))
    for (const r of results) {
      if (r.ok) sent++
      else failed++
    }
  }
  return { sent, failed }
}
