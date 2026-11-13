'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Megaphone, Send, Mail, AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import {
  sendWaitlistBroadcastAction,
  sendWaitlistTestAction,
} from '@/app/(platform)/admin/actions'

/* ================================================================
   Launch-broadcast composer (admin only).

   Deliberately NOT a marketing composer — a subject, a body, a
   recipient count, a "send a test to myself" button, and a confirm
   step before the irreversible send. Authorization lives in the
   server actions; this is only the trigger.
   ================================================================ */

/** Running totals across the runs of one broadcast ("send to the rest"). */
type BroadcastResult = { sent: number; left: number; alreadySent: number }

/** Confirmed subscribers who signed up from one country. */
export interface BroadcastCountry {
  /** ISO 3166-1 alpha-2 code. */
  code: string
  /** Display name in the admin's language. */
  name: string
  count: number
}

export function BroadcastComposer({
  countries,
  unknownCount,
}: {
  countries: BroadcastCountry[]
  /** Confirmed subscribers with no known country — they get every send. */
  unknownCount: number
}) {
  const t = useTranslations('admin')

  // Countries the send is limited to. None picked → everyone.
  const [selected, setSelected] = useState<string[]>([])
  const totalCount = countries.reduce((sum, c) => sum + c.count, unknownCount)
  const recipientCount =
    selected.length > 0
      ? countries.reduce((sum, c) => (selected.includes(c.code) ? sum + c.count : sum), unknownCount)
      : totalCount

  function toggleCountry(code: string) {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testNotice, setTestNotice] = useState<string | null>(null)
  const [result, setResult] = useState<BroadcastResult | null>(null)

  const [testing, startTest] = useTransition()
  const [sending, startSend] = useTransition()

  const canCompose = subject.trim().length > 0 && body.trim().length > 0
  const hasRecipients = recipientCount > 0

  function onTest() {
    setError(null)
    setTestNotice(null)
    startTest(async () => {
      const res = await sendWaitlistTestAction({ subject, body })
      if (res.success) setTestNotice(t('broadcast.testSent', { email: res.data.email }))
      else setError(res.error)
    })
  }

  function onSend() {
    setError(null)
    setTestNotice(null)
    startSend(async () => {
      const res = await sendWaitlistBroadcastAction({ subject, body, countries: selected })
      setConfirmOpen(false)
      if (res.success) {
        // A re-run only reaches people who haven't had it, so totals add up.
        setResult((prev) => ({
          sent: (prev?.sent ?? 0) + res.data.sent,
          left: res.data.failed + res.data.remaining,
          alreadySent: prev?.alreadySent ?? res.data.alreadySent,
        }))
      } else {
        setError(res.error)
      }
    })
  }

  function reset() {
    setSubject('')
    setBody('')
    setSelected([])
    setResult(null)
    setError(null)
    setTestNotice(null)
  }

  // ---- Success screen -------------------------------------------------
  if (result) {
    const summary =
      result.left > 0
        ? t('broadcast.resultPartial', { sent: result.sent, left: result.left })
        : result.sent === 0 && result.alreadySent > 0
          ? t('broadcast.resultAlready')
          : t('broadcast.resultSent', { count: result.sent })
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-6 sm:p-8">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-300">
          <CheckCircle2 className="size-6" strokeWidth={2} />
        </div>
        <h1 className="mb-2 font-display text-2xl leading-tight">{t('broadcast.title')}</h1>
        <p className="text-sm leading-relaxed text-fg-secondary">{summary}</p>
        {error && (
          <p
            className="mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {result.left > 0 && (
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-medium text-blue-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="size-3.5" strokeWidth={2.5} />
              {sending ? t('broadcast.sending') : t('broadcast.sendRest')}
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:border-neutral-600 hover:bg-white/[0.04] disabled:opacity-60"
          >
            {t('broadcast.sendAnother')}
          </button>
        </div>
      </div>
    )
  }

  // ---- Composer -------------------------------------------------------
  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/[0.12] text-amber-400">
          <Megaphone className="size-5" strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-display text-2xl leading-tight">{t('broadcast.title')}</h1>
          <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
            {t('broadcast.subtitle')}
          </p>
        </div>
      </div>

      <p className="mb-5 text-sm font-medium text-fg-primary">
        {totalCount > 0
          ? t('broadcast.recipients', { count: totalCount })
          : t('broadcast.emptyState')}
      </p>

      <div className="space-y-5 rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6">
        {countries.length > 0 && (
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-fg-primary">
              {t('broadcast.audienceLabel')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {countries.map((country) => {
                const on = selected.includes(country.code)
                return (
                  <button
                    key={country.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCountry(country.code)}
                    className={
                      on
                        ? 'inline-flex items-center gap-2 rounded-full border border-amber-500 bg-amber-500/[0.14] px-3 py-1.5 text-sm font-medium text-amber-300 transition-colors'
                        : 'inline-flex items-center gap-2 rounded-full border border-white/[0.13] px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:border-neutral-500 hover:text-fg-primary'
                    }
                  >
                    {country.name}
                    <span className="text-xs tabular-nums opacity-70">{country.count}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-tertiary">
              {selected.length > 0
                ? t('broadcast.audienceSome', { count: recipientCount })
                : t('broadcast.audienceAll')}
              {unknownCount > 0 && <> {t('broadcast.audienceUnknown', { count: unknownCount })}</>}
            </p>
          </fieldset>
        )}

        <div>
          <label
            htmlFor="broadcast-subject"
            className="mb-2 block text-sm font-medium text-fg-primary"
          >
            {t('broadcast.subjectLabel')}
          </label>
          <input
            id="broadcast-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('broadcast.subjectPlaceholder')}
            maxLength={150}
            className="w-full rounded-xl border border-white/[0.13] bg-bg-surface-2 px-3.5 py-2.5 text-base text-fg-primary outline-none transition-colors placeholder:text-neutral-500 focus:border-amber-500 focus:shadow-glow-amber"
          />
        </div>

        <div>
          <label
            htmlFor="broadcast-body"
            className="mb-2 block text-sm font-medium text-fg-primary"
          >
            {t('broadcast.bodyLabel')}
          </label>
          <textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('broadcast.bodyPlaceholder')}
            rows={10}
            maxLength={10000}
            className="w-full resize-y rounded-xl border border-white/[0.13] bg-bg-surface-2 px-3.5 py-2.5 text-base leading-relaxed text-fg-primary outline-none transition-colors placeholder:text-neutral-500 focus:border-amber-500 focus:shadow-glow-amber"
          />
          <p className="mt-2 text-xs leading-relaxed text-fg-tertiary">{t('broadcast.bodyHint')}</p>
        </div>

        {error && (
          <p
            className="rounded-lg border border-red-500/30 bg-red-500/[0.08] px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}

        {testNotice && (
          <p
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2 text-sm text-emerald-300"
            role="status"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            {testNotice}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onTest}
            disabled={!canCompose || testing || sending}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:border-neutral-600 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mail className="size-4" />
            {testing ? t('broadcast.testing') : t('broadcast.test')}
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null)
              setTestNotice(null)
              setConfirmOpen(true)
            }}
            disabled={!canCompose || !hasRecipients || testing || sending}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-500 px-5 py-2.5 text-sm font-medium text-blue-900 transition-all hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <Send className="size-4" />
            {t('broadcast.send', { count: recipientCount })}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={t('broadcast.cancel')}
            onClick={() => !sending && setConfirmOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-[460px] rounded-2xl border border-white/[0.08] bg-bg-surface p-6 shadow-xl">
            <button
              type="button"
              onClick={() => !sending && setConfirmOpen(false)}
              className="absolute right-4 top-4 text-fg-tertiary transition-colors hover:text-fg-primary"
              aria-label={t('broadcast.cancel')}
            >
              <X className="size-4" />
            </button>

            <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/[0.12] text-amber-400">
              <AlertTriangle className="size-5" strokeWidth={2} />
            </div>

            <h2 className="mb-2 font-display text-2xl leading-tight">
              {t('broadcast.confirmTitle')}
            </h2>
            <p className="text-sm leading-relaxed text-fg-secondary">
              {t('broadcast.confirmBody', { count: recipientCount })}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:border-neutral-600 hover:bg-white/[0.04] disabled:opacity-60"
              >
                {t('broadcast.cancel')}
              </button>
              <button
                type="button"
                onClick={onSend}
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-medium text-blue-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="size-3.5" strokeWidth={2.5} />
                {sending ? t('broadcast.sending') : t('broadcast.confirmSend')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
