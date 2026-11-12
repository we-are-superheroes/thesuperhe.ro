import 'server-only'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-templates'
import { SITE_URL } from '@/lib/site'
import { DEFAULT_LOCALE, isSupportedLocale } from '@/lib/locale-shared'
import { log } from '@/lib/log'

/* ================================================================
   Notification-email sweep — the companion to notify().

   notify() only writes rows (emailedAt null) inside the caller's
   transaction; no external calls there. This sweep, run by a cron,
   turns unsent + unread notifications into ONE digest email per user
   per run (natural throttling, humane inbox), rendered in the user's
   locale, then stamps emailedAt so they're never re-sent.

   A row is skipped once read in-app before the sweep — no point
   emailing something the user already saw.
   ================================================================ */

const MAX_USERS = 200
const MAX_LINES_PER_USER = 12

type I18n = { key?: string; params?: Record<string, string | number> }

/** A translator bound to one locale's notifications catalog. Loosely typed on
 *  purpose: the full getTranslations return type is too deep to instantiate
 *  here, and we format dynamic notification keys anyway. */
type NotifT = (key: string, values?: Record<string, string | number>) => string

function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
}

/** Render one notification's title in the reader's language, falling back to
 *  the stored English snapshot if the i18n payload is missing/unknown. */
function renderLine(t: NotifT, title: string, data: unknown): string {
  const i18n = (data as { i18n?: I18n } | null)?.i18n
  if (!i18n?.key) return title
  try {
    // next-intl throws on a missing key — fall back to the snapshot.
    const rendered = t(`titles.${i18n.key}`, i18n.params ?? {})
    return rendered || title
  } catch {
    return title
  }
}

export async function sendPendingNotificationEmails(): Promise<{
  users: number
  emailed: number
  notifications: number
}> {
  const pending = await db.notification.findMany({
    where: { emailedAt: null, readAt: null, user: { emailNotifications: true } },
    orderBy: { createdAt: 'asc' },
    take: MAX_USERS * 25,
    select: {
      id: true,
      title: true,
      data: true,
      userId: true,
      user: { select: { email: true, locale: true, emailUnsubToken: true } },
    },
  })

  if (pending.length === 0) return { users: 0, emailed: 0, notifications: 0 }

  // Group by user (insertion order = oldest first).
  type Row = (typeof pending)[number]
  const byUser = new Map<string, Row[]>()
  for (const row of pending) {
    const list = byUser.get(row.userId)
    if (list) list.push(row)
    else byUser.set(row.userId, [row])
  }

  // Reuse one translator per locale across users.
  const translators = new Map<string, NotifT>()
  async function translatorFor(locale: string): Promise<NotifT> {
    const key = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
    const existing = translators.get(key)
    if (existing) return existing
    const t = (await getTranslations({
      locale: key,
      namespace: 'notifications',
    })) as unknown as NotifT
    translators.set(key, t)
    return t
  }

  let emailedUsers = 0
  let emailedNotifications = 0

  for (const rows of byUser.values()) {
    const user = rows[0].user
    if (!user?.email) continue

    const t = await translatorFor(user.locale ?? DEFAULT_LOCALE)
    const count = rows.length

    const lines = rows.slice(0, MAX_LINES_PER_USER).map((r) => `• ${renderLine(t, r.title, r.data)}`)
    if (count > MAX_LINES_PER_USER) {
      lines.push(t('email.more', { count: count - MAX_LINES_PER_USER }))
    }

    const unsub = unsubscribeUrl(user.emailUnsubToken)
    const { html, text } = renderEmail({
      previewText: t('email.subject', { count }),
      heading: t('email.heading', { count }),
      paragraphs: [t('email.intro'), ...lines],
      button: { href: `${SITE_URL}/notifications`, label: t('email.button') },
      footerLines: [t('email.why')],
      unsubscribe: { url: unsub, label: t('email.unsubscribe') },
    })

    const result = await sendEmail({
      to: user.email,
      subject: t('email.subject', { count }),
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [{ name: 'kind', value: 'notification_digest' }],
    })

    // Only stamp emailedAt when the send succeeded, so a failure retries
    // on the next sweep instead of silently dropping the notifications.
    if (result.ok) {
      await db.notification.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { emailedAt: new Date() },
      })
      emailedUsers++
      emailedNotifications += rows.length
    }
  }

  log.info('notification_emails.sweep', {
    users: byUser.size,
    emailedUsers,
    emailedNotifications,
  })

  return { users: byUser.size, emailed: emailedUsers, notifications: emailedNotifications }
}
