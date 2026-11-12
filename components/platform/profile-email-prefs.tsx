'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setEmailPreferenceAction } from '@/app/(platform)/profile/actions'

/* ================================================================
   Email preferences card on the profile page — the in-app master
   switch for notification emails (the same column the one-click
   unsubscribe link flips). Optimistic, saves on toggle.
   ================================================================ */

export function ProfileEmailPrefs({ initialEnabled }: { initialEnabled: boolean }) {
  const t = useTranslations('profile')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !enabled
    setEnabled(next) // optimistic
    setError(null)
    startTransition(async () => {
      const result = await setEmailPreferenceAction(next)
      if (!result.success) {
        setEnabled(!next) // revert
        setError(result.error)
      }
    })
  }

  return (
    <section
      id="sec-email"
      className="scroll-mt-[110px] rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6 lg:p-8"
    >
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
          {t('email.eyebrow')}
        </div>
        <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
          {t('email.title')}
        </h2>
        <p className="mt-2 max-w-[540px] text-sm leading-relaxed text-fg-secondary">
          {t('email.desc')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-bg-surface-2 p-4">
        <span className="text-sm font-medium text-fg-primary">{t('email.toggleLabel')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('email.toggleLabel')}
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast disabled:opacity-60 ${
            enabled ? 'bg-amber-500' : 'bg-white/[0.15]'
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white transition-transform duration-fast ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
