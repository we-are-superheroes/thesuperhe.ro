'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Building2, Plus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/* ================================================================
   /organisations — client half. Standard platform topbar (search +
   primary action) over the user's organisations and the public
   directory of listed organisations.
   ================================================================ */

export interface OrganisationRow {
  id: string
  slug: string
  name: string
  type: 'nonprofit' | 'company'
  typeLabel: string
  status: 'pending' | 'active' | 'suspended'
  logoUrl: string | null
  isAdmin: boolean
  isCreator: boolean
  members: number
  projects: number
  joinedLabel: string
}

export interface DirectoryRow {
  id: string
  slug: string
  name: string
  type: 'nonprofit' | 'company'
  typeLabel: string
  logoUrl: string | null
  description: string | null
  members: number
  projects: number
}

const LOGO_BG = {
  nonprofit: 'linear-gradient(135deg, #1A5C40, #3DAF7C)',
  company: 'linear-gradient(135deg, #1B3A6B, #4A7FD4)',
} as const

function OrgLogo({
  name,
  type,
  logoUrl,
}: {
  name: string
  type: 'nonprofit' | 'company'
  logoUrl: string | null
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-xl object-cover"
      />
    )
  }
  return (
    <span
      className="flex size-12 shrink-0 items-center justify-center rounded-xl font-display text-xl text-white"
      style={{ background: LOGO_BG[type] }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export function OrganisationsClient({
  orgs,
  directory,
}: {
  orgs: OrganisationRow[]
  directory: DirectoryRow[]
}) {
  const t = useTranslations('orgs')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return orgs
    return orgs.filter((o) => `${o.name} ${o.typeLabel}`.toLowerCase().includes(q))
  }, [orgs, q])

  const filteredDirectory = useMemo(() => {
    if (!q) return directory
    return directory.filter((o) =>
      `${o.name} ${o.typeLabel} ${o.description ?? ''}`.toLowerCase().includes(q),
    )
  }, [directory, q])

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="relative order-2 w-full min-w-0 max-w-[480px] flex-1 sm:order-1 sm:w-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <Link
            href="/orgs/request"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">{t('list.request')}</span>
            <span className="sm:hidden">{t('list.requestShort')}</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        <header>
          <h1 className="mb-3 font-display text-[clamp(32px,4vw,48px)] font-normal leading-none tracking-tight">
            {t.rich('list.title', {
              em: (chunks) => <em className="italic text-amber-500">{chunks}</em>,
            })}
          </h1>
          <p className="max-w-[540px] text-lg leading-relaxed text-fg-secondary">
            {t('list.intro')}
          </p>
        </header>

        {orgs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-fg-tertiary">
              <Building2 className="size-6" />
            </div>
            <h2 className="font-display text-2xl font-normal">{t('list.emptyTitle')}</h2>
            <p className="max-w-[460px] text-sm leading-relaxed text-fg-secondary">
              {t('list.emptyBody')}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-10 text-center text-sm text-fg-tertiary">
            {t('list.noMatch', { query: query.trim() })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((o) => (
              <Link
                key={o.id}
                href={`/orgs/${o.slug}`}
                className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface px-4 py-4 transition-all duration-fast hover:-translate-y-px hover:border-neutral-600 hover:shadow-md sm:px-5"
              >
                <OrgLogo name={o.name} type={o.type} logoUrl={o.logoUrl} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-lg leading-tight">{o.name}</span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                        o.type === 'company'
                          ? 'border-blue-400/45 bg-blue-400/10 text-blue-300'
                          : 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
                      )}
                    >
                      {o.typeLabel}
                    </span>
                    {o.isAdmin && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                        {o.isCreator ? t('role.creator') : t('role.admin')}
                      </span>
                    )}
                    {o.status === 'pending' && (
                      <span className="rounded-full border border-neutral-700 bg-bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
                        {t('statusBadge.pending')}
                      </span>
                    )}
                    {o.status === 'suspended' && (
                      <span className="rounded-full border border-red-400/40 bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-300">
                        {t('statusBadge.suspended')}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-fg-tertiary">
                    {t('list.rowMeta', {
                      members: o.members,
                      projects: o.projects,
                      joined: o.joinedLabel,
                    })}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-primary" />
              </Link>
            ))}
          </div>
        )}

        {/* Directory — listed, active organisations the user isn't in. */}
        <section>
          <div className="mb-4 flex items-baseline gap-4">
            <h2 className="font-display text-2xl font-normal tracking-tight">
              {t('directory.heading')}
            </h2>
            <span className="h-px flex-1 self-center bg-white/[0.08]" />
            <span className="whitespace-nowrap text-sm text-fg-tertiary">
              {t('directory.listedCount', { count: directory.length })}
            </span>
          </div>
          {directory.length === 0 ? (
            <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-10 text-center text-sm text-fg-tertiary">
              {t('directory.empty')}
            </div>
          ) : filteredDirectory.length === 0 ? (
            <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-10 text-center text-sm text-fg-tertiary">
              {t('directory.noMatch', { query: query.trim() })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredDirectory.map((o) => (
                <Link
                  key={o.id}
                  href={`/orgs/${o.slug}`}
                  className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface px-4 py-4 transition-all duration-fast hover:-translate-y-px hover:border-neutral-600 hover:shadow-md sm:px-5"
                >
                  <OrgLogo name={o.name} type={o.type} logoUrl={o.logoUrl} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-display text-lg leading-tight">{o.name}</span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                          o.type === 'company'
                            ? 'border-blue-400/45 bg-blue-400/10 text-blue-300'
                            : 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
                        )}
                      >
                        {o.typeLabel}
                      </span>
                    </span>
                    <span className="truncate text-sm text-fg-tertiary">
                      {o.description ??
                        t('directory.meta', { members: o.members, projects: o.projects })}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-primary" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <p className="text-xs leading-relaxed text-fg-tertiary">
          {t.rich('list.footer', {
            link: (chunks) => (
              <Link href="/profile#sec-orgs" className="text-amber-500 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  )
}
