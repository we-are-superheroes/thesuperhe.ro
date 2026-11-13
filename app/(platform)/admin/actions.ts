'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { log } from '@/lib/log'
import { createHash } from 'node:crypto'
import { sendEmail, sendEmailBulk, EMAIL_BATCH_SIZE, type SendEmailParams } from '@/lib/email'
import { renderEmail } from '@/lib/email-templates'
import { waitlistUnsubscribeHeaders, waitlistUnsubscribePageUrl } from '@/lib/waitlist'
import { DEFAULT_LOCALE, isSupportedLocale } from '@/lib/locale-shared'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Admin-only destructive actions.

   Security model
   --------------
   - Authorization is enforced HERE, server-side, on every call via
     requireAdmin() (reads the role from the DB). The UI only hides the
     buttons; it is never the gate. A crafted request from a non-admin
     is rejected.
   - Server Actions are POST-only and same-origin protected by Next.js,
     so there's no CSRF surface for a GET.
   - Deletes rely on the schema's ON DELETE rules:
       · project  → steps / contributions / time logs cascade; forked
                    notifications keep their row with project_id nulled.
       · blueprint→ its steps cascade; forked projects and child variants
                    are detached (FK set null), not deleted.
   - Every deletion is logged for a basic audit trail.
   ================================================================ */

export async function deleteProjectAction(
  projectId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const t = await getTranslations('errors')
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: t('admin.notAuthorised') }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  })
  if (!project) return { success: false, error: t('admin.projectNotFound') }

  try {
    // Explicit order: contributions reference steps via a NO ACTION FK, so
    // clear them before the steps. Steps then cascade their time logs +
    // step-skills; the project delete sets project_id null on notifications.
    await db.$transaction(async (tx) => {
      await tx.contribution.deleteMany({ where: { projectId } })
      await tx.projectStep.deleteMany({ where: { projectId } })
      await tx.project.delete({ where: { id: projectId } })
    })
  } catch {
    return { success: false, error: t('admin.deleteProjectFailed') }
  }

  log.warn('admin.project_deleted', { adminId, projectId, title: project.title })

  revalidatePath('/projects')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  return { success: true, data: { deleted: true } }
}

export async function deleteBlueprintAction(
  blueprintId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const t = await getTranslations('errors')
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: t('admin.notAuthorised') }

  const blueprint = await db.blueprint.findUnique({
    where: { id: blueprintId },
    select: { id: true, title: true },
  })
  if (!blueprint) return { success: false, error: t('blueprints.notFound') }

  try {
    // Forked projects reference the blueprint via a NO ACTION FK, so detach
    // them first (they keep working as standalone projects). Child variants
    // detach automatically via the parent FK's ON DELETE SET NULL, and the
    // blueprint's steps cascade.
    await db.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: { blueprintId },
        data: { blueprintId: null },
      })
      await tx.blueprint.delete({ where: { id: blueprintId } })
    })
  } catch {
    return { success: false, error: t('admin.deleteBlueprintFailed') }
  }

  log.warn('admin.blueprint_deleted', { adminId, blueprintId, title: blueprint.title })

  revalidatePath('/blueprints')
  return { success: true, data: { deleted: true } }
}

/* ================================================================
   Launch broadcast — a one-off email to every confirmed waitlist
   subscriber. Operator-authored subject + body (one language); only
   the unsubscribe footer is localised per subscriber. The list stays
   in our DB — no Resend Audiences dependency.

   `sendWaitlistTestAction` renders the exact same email and sends it
   to the admin alone, so they can preview it in a real inbox before
   the irreversible broadcast.
   ================================================================ */

/** Hard caps so a stray paste can't produce a monster email. */
const MAX_BROADCAST_SUBJECT = 150
const MAX_BROADCAST_BODY = 10_000

type ParsedBroadcast = { subject: string; paragraphs: string[] }

/** Normalise + validate the operator's input. Blank lines separate paragraphs. */
function parseBroadcast(params: { subject: string; body: string }): ParsedBroadcast | 'empty' | 'tooLong' {
  const subject = params.subject.trim()
  const paragraphs = params.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!subject || paragraphs.length === 0) return 'empty'
  if (subject.length > MAX_BROADCAST_SUBJECT || params.body.length > MAX_BROADCAST_BODY) {
    return 'tooLong'
  }
  return { subject, paragraphs }
}

/** Build the exact email a subscriber receives, given their localised footer. */
function broadcastEmail(opts: {
  to: string
  subject: string
  paragraphs: string[]
  footer: { why: string; unsub: string }
  unsubscribeToken: string
  kind: string
}): SendEmailParams {
  const { html, text } = renderEmail({
    previewText: opts.subject,
    heading: opts.subject,
    paragraphs: opts.paragraphs,
    footerLines: [opts.footer.why],
    unsubscribe: {
      url: waitlistUnsubscribePageUrl(opts.unsubscribeToken),
      label: opts.footer.unsub,
    },
  })
  return {
    to: opts.to,
    subject: opts.subject,
    html,
    text,
    headers: waitlistUnsubscribeHeaders(opts.unsubscribeToken),
    tags: [{ name: 'kind', value: opts.kind }],
  }
}

/** Localised unsubscribe-footer strings, memoised per locale. */
function makeFooterResolver() {
  const cache = new Map<string, { why: string; unsub: string }>()
  return async function footerFor(locale: string | null) {
    const key = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
    const cached = cache.get(key)
    if (cached) return cached
    const tm = await getTranslations({ locale: key, namespace: 'marketing' })
    const value = {
      why: tm('waitlist.email.broadcast.why'),
      unsub: tm('waitlist.email.unsubscribe'),
    }
    cache.set(key, value)
    return value
  }
}

export async function sendWaitlistTestAction(params: {
  subject: string
  body: string
}): Promise<ServerActionResult<{ email: string }>> {
  const t = await getTranslations('errors')
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: t('admin.notAuthorised') }

  const parsed = parseBroadcast(params)
  if (parsed === 'empty') return { success: false, error: t('admin.broadcastEmpty') }
  if (parsed === 'tooLong') return { success: false, error: t('admin.broadcastTooLong') }

  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { email: true, locale: true },
  })
  if (!admin?.email) return { success: false, error: t('admin.broadcastNoTestAddress') }

  const footerFor = makeFooterResolver()
  const footer = await footerFor(admin.locale)
  // A preview token: the unsubscribe link renders but resolves to the
  // "link expired" page if clicked — this isn't a real list membership.
  const result = await sendEmail(
    broadcastEmail({
      to: admin.email,
      subject: parsed.subject,
      paragraphs: parsed.paragraphs,
      footer,
      unsubscribeToken: 'preview',
      kind: 'waitlist_broadcast_test',
    }),
  )
  if (!result.ok) return { success: false, error: t('admin.broadcastTestFailed') }

  return { success: true, data: { email: admin.email } }
}

/** Stop starting new batches after this long, well inside the function's
 *  time limit; the admin sends "the rest" to carry on. */
const BROADCAST_TIME_BUDGET_MS = 40_000
/** Pause between provider calls to stay under Resend's request rate limit. */
const BROADCAST_BATCH_PAUSE_MS = 600

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Identifies "this broadcast" in the sent-log: same subject + body → same key. */
function broadcastKeyFor(parsed: ParsedBroadcast): string {
  return createHash('sha256')
    .update([parsed.subject, ...parsed.paragraphs].join('\n\n'), 'utf8')
    .digest('hex')
}

export interface BroadcastSendResult {
  /** Accepted by the provider in THIS run. */
  sent: number
  /** Refused by the provider in this run (they stay un-logged, so a re-run retries them). */
  failed: number
  /** Confirmed subscribers this run did not get to before the time budget ran out. */
  remaining: number
  /** Subscribers who already had this exact broadcast before this run. */
  alreadySent: number
}

/**
 * Send the broadcast to every confirmed subscriber who has not had it yet.
 *
 * Safe to run again with the same subject + body: each accepted e-mail is
 * written to waitlist_broadcast_sends, and subscribers in that log are
 * skipped — so a retry after a partial failure or a timeout never
 * double-sends. E-mails go out through the provider's batch endpoint
 * (EMAIL_BATCH_SIZE per call) within a time budget.
 */
export async function sendWaitlistBroadcastAction(params: {
  subject: string
  /** Plain text; blank lines separate paragraphs. */
  body: string
}): Promise<ServerActionResult<BroadcastSendResult>> {
  const t = await getTranslations('errors')
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: t('admin.notAuthorised') }

  const parsed = parseBroadcast(params)
  if (parsed === 'empty') return { success: false, error: t('admin.broadcastEmpty') }
  if (parsed === 'tooLong') return { success: false, error: t('admin.broadcastTooLong') }

  const broadcastKey = broadcastKeyFor(parsed)
  const startedAt = Date.now()

  try {
    const [pending, alreadySent] = await Promise.all([
      db.waitlistSubscriber.findMany({
        where: { status: 'confirmed', broadcastSends: { none: { broadcastKey } } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, locale: true, unsubscribeToken: true },
      }),
      db.waitlistBroadcastSend.count({ where: { broadcastKey } }),
    ])

    const footerFor = makeFooterResolver()
    let sent = 0
    let failed = 0
    let processed = 0

    while (processed < pending.length) {
      if (Date.now() - startedAt > BROADCAST_TIME_BUDGET_MS) break
      if (processed > 0) await sleep(BROADCAST_BATCH_PAUSE_MS)

      const chunk = pending.slice(processed, processed + EMAIL_BATCH_SIZE)
      const items: SendEmailParams[] = []
      for (const sub of chunk) {
        items.push(
          broadcastEmail({
            to: sub.email,
            subject: parsed.subject,
            paragraphs: parsed.paragraphs,
            footer: await footerFor(sub.locale),
            unsubscribeToken: sub.unsubscribeToken,
            kind: 'waitlist_broadcast',
          }),
        )
      }

      const accepted = await sendEmailBulk(items)
      const acceptedIds = chunk.filter((_, i) => accepted[i]).map((sub) => sub.id)
      if (acceptedIds.length > 0) {
        // Log straight away, so a later failure can't lose track of these.
        await db.waitlistBroadcastSend.createMany({
          data: acceptedIds.map((subscriberId) => ({ broadcastKey, subscriberId })),
          skipDuplicates: true,
        })
      }
      sent += acceptedIds.length
      failed += chunk.length - acceptedIds.length
      processed += chunk.length
    }

    const remaining = pending.length - processed
    log.info('admin.waitlist_broadcast', { adminId, sent, failed, remaining, alreadySent })
    return { success: true, data: { sent, failed, remaining, alreadySent } }
  } catch (e) {
    log.error('admin.waitlist_broadcast_failed', {
      adminId,
      message: e instanceof Error ? e.message : String(e),
    })
    return { success: false, error: t('admin.broadcastFailed') }
  }
}
