'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  leaveOrgAction,
  setShareContributionsAction,
} from '@/app/(platform)/orgs/actions'

/* ================================================================
   Profile → Organisations section (spec F6). One row per active
   membership: link to the org page, the per-org contribution-
   sharing toggle, and a Leave button. Rendered into the profile
   form via its `orgsSlot`.
   ================================================================ */

export interface ProfileOrgRow {
  orgId: string
  slug: string
  name: string
  typeLabel: string
  status: 'pending' | 'active' | 'suspended'
  roleLabel: string
  isAdmin: boolean
  shareContributions: boolean
}

export function ProfileOrgsSection({ orgs }: { orgs: ProfileOrgRow[] }) {
  const t = useTranslations('orgs')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Optimistic toggle state so the switch answers immediately.
  const [shares, setShares] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(orgs.map((o) => [o.orgId, o.shareContributions])),
  )

  const setShare = (orgId: string, value: boolean) => {
    setError(null)
    setShares((prev) => ({ ...prev, [orgId]: value }))
    startTransition(async () => {
      const result = await setShareContributionsAction(orgId, value)
      if (!result.success) {
        setShares((prev) => ({ ...prev, [orgId]: !value }))
        setError(result.error)
      }
    })
  }

  const leave = (org: ProfileOrgRow) => {
    if (!window.confirm(t('profileOrgs.leaveConfirm', { org: org.name }))) return
    setError(null)
    startTransition(async () => {
      const result = await leaveOrgAction(org.orgId)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <section
      id="sec-orgs"
      className="flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-7"
    >
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
          {t('profileOrgs.kicker')}
        </div>
        <h2 className="mb-2 font-display text-2xl font-normal tracking-tight">
          {t('profileOrgs.title')}
        </h2>
        <p className="max-w-[560px] text-sm leading-relaxed text-fg-secondary">
          {t.rich('profileOrgs.intro', {
            strong: (chunks) => (
              <strong className="font-semibold text-fg-primary">{chunks}</strong>
            ),
          })}
        </p>
      </div>

      {orgs.length === 0 ? (
        <p className="text-sm text-fg-tertiary">{t('profileOrgs.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {orgs.map((o) => (
            <div
              key={o.orgId}
              className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-bg-surface-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <Link href={`/orgs/${o.slug}`} className="hover:underline">
                    {o.name}
                  </Link>
                  <span className="rounded-full border border-white/[0.08] bg-bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-secondary">
                    {o.typeLabel}
                  </span>
                  {o.isAdmin && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                      {o.roleLabel}
                    </span>
                  )}
                </span>
                {o.status === 'pending' && (
                  <span className="text-xs text-fg-tertiary">{t('statusBadge.pending')}</span>
                )}
                {o.status === 'suspended' && (
                  <span className="text-xs text-fg-tertiary">{t('statusBadge.suspended')}</span>
                )}
              </div>

              <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs text-fg-secondary">
                {t('profileOrgs.share')}
                <button
                  type="button"
                  role="switch"
                  aria-checked={shares[o.orgId]}
                  disabled={pending}
                  onClick={() => setShare(o.orgId, !shares[o.orgId])}
                  className={cn(
                    'relative inline-block h-[22px] w-10 shrink-0 cursor-pointer rounded-full border transition-all duration-fast',
                    shares[o.orgId]
                      ? 'border-amber-500 bg-amber-500/[0.18]'
                      : 'border-neutral-700 bg-bg-surface-3',
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-[3px] top-1/2 size-[14px] -translate-y-1/2 rounded-full transition-transform duration-fast',
                      shares[o.orgId] ? 'translate-x-[18px] bg-amber-500' : 'bg-fg-tertiary',
                    )}
                  />
                </button>
              </label>

              <button
                type="button"
                disabled={pending}
                onClick={() => leave(o)}
                className="cursor-pointer self-start rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-fg-tertiary transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-60 sm:self-auto"
              >
                {t('profileOrgs.leave')}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-xs leading-relaxed text-fg-tertiary">
        {t.rich('profileOrgs.footer', {
          link: (chunks) => (
            <Link href="/orgs/request" className="text-amber-500 hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  )
}
