'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  grantCuratorAction,
  revokeCuratorAction,
} from '@/app/(platform)/admin/curators/actions'
import { Card, Field } from '@/components/platform/project-form-bits'

/** Admin-only: make a member a curator, or take the role away again. */
export interface CuratorRow {
  id: string
  name: string
  email: string
}

const BTN =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60'

export function CuratorManager({ curators }: { curators: CuratorRow[] }) {
  const t = useTranslations('map')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const grant = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await grantCuratorAction(email)
      if (!result.success) {
        setError(result.error)
        return
      }
      setEmail('')
      setMessage(t('curators.added', { name: result.data.name }))
      router.refresh()
    })
  }

  const revoke = (curator: CuratorRow) => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await revokeCuratorAction(curator.id)
      if (!result.success) {
        setError(result.error)
        return
      }
      setMessage(t('curators.removed', { name: curator.name }))
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form onSubmit={grant} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('curators.emailLabel')} htmlFor="curator-email">
              <input
                id="curator-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('curators.emailPlaceholder')}
                autoComplete="off"
                required
                className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={pending}
            className={cn(BTN, 'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover')}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? t('curators.adding') : t('curators.add')}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 text-sm text-fg-primary">
            {message}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-display text-2xl font-normal leading-tight tracking-tight">
          {t('curators.listTitle')}
        </h2>
        {curators.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('curators.empty')}</p>
        ) : (
          <ul className="flex flex-col">
            {curators.map((curator) => (
              <li
                key={curator.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle py-3 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg-primary">{curator.name}</p>
                  <p className="truncate text-xs text-fg-tertiary">{curator.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(curator)}
                  disabled={pending}
                  aria-label={t('curators.removeAria', { name: curator.name })}
                  className={cn(BTN, 'border-red-500/50 bg-transparent py-1.5 text-red-300 hover:bg-red-500/[0.12]')}
                >
                  {t('curators.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
