'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, Check, CheckCircle2, MailCheck } from 'lucide-react'
import { subscribeWaitlistAction } from '@/app/(marketing)/waitlist-actions'

/* ================================================================
   Guest "notify me when projects go live" form — the right column of
   the Launching-soon card (Claude Design "notify" section). Double
   opt-in: a successful submit swaps the form for the "check your
   inbox to confirm" state.
   ================================================================ */

export function WaitlistForm() {
  const t = useTranslations('marketing')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'done' | 'throttled'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await subscribeWaitlistAction(email)
      if (result.success) setState(result.data.throttled ? 'throttled' : 'done')
      else setError(result.error)
    })
  }

  if (state !== 'idle') {
    const throttled = state === 'throttled'
    const Icon = throttled ? MailCheck : CheckCircle2
    return (
      <div
        className="flex items-start gap-3 rounded-xl border border-amber-500 bg-bg-surface-2 p-5"
        role="status"
        aria-live="polite"
      >
        <Icon className="size-7 shrink-0 text-amber-500" />
        <div>
          <strong className="mb-1 block font-display text-xl font-normal">
            {t(throttled ? 'waitlist.throttled.title' : 'waitlist.success.title')}
          </strong>
          <p className="text-sm leading-relaxed text-neutral-300">
            {t(throttled ? 'waitlist.throttled.body' : 'waitlist.success.body')}
          </p>
        </div>
      </div>
    )
  }

  const perks = [t('waitlist.perks.noAccount'), t('waitlist.perks.noSpam'), t('waitlist.perks.unsubscribe')]

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="waitlist-email" className="mb-2 block text-sm font-medium text-fg-primary">
        {t('waitlist.label')}
      </label>
      <div className="flex flex-col gap-2 rounded-xl border border-white/[0.13] bg-bg-surface-2 p-1.5 transition-all duration-fast focus-within:border-amber-500 focus-within:shadow-glow-amber sm:flex-row">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('waitlist.placeholder')}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-fg-primary outline-none placeholder:text-neutral-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-500 px-5 py-2.5 text-base font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? t('waitlist.submitting') : t('waitlist.submit')}
          {!pending && <ArrowRight className="size-4" />}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-300">
        {perks.map((perk) => (
          <li key={perk} className="flex items-center gap-1.5">
            <Check className="size-3.5 shrink-0 text-amber-500" strokeWidth={3} />
            {perk}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-neutral-400">
        {t.rich('waitlist.fineprint', {
          privacy: (chunks) => (
            <a href="/privacy" className="underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    </form>
  )
}
