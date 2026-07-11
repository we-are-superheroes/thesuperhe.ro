'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ================================================================
   /organisations — client half. Standard platform topbar (search +
   primary action) over the list of the user's organisations.
   ================================================================ */

export interface OrganisationRow {
  id: string
  slug: string
  name: string
  type: 'nonprofit' | 'company'
  typeLabel: string
  status: 'pending' | 'active' | 'suspended'
  isAdmin: boolean
  isCreator: boolean
  members: number
  projects: number
  joinedLabel: string
}

const LOGO_BG = {
  nonprofit: 'linear-gradient(135deg, #1A5C40, #3DAF7C)',
  company: 'linear-gradient(135deg, #1B3A6B, #4A7FD4)',
} as const

export function OrganisationsClient({ orgs }: { orgs: OrganisationRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter((o) => `${o.name} ${o.typeLabel}`.toLowerCase().includes(q))
  }, [orgs, query])

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
            placeholder="Search your organisations…"
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <Link
            href="/orgs/request"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Request an organisation</span>
            <span className="sm:hidden">Request</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        <header>
          <h1 className="mb-3 font-display text-[clamp(32px,4vw,48px)] font-normal leading-none tracking-tight">
            Your <em className="italic text-amber-500">organisations</em>.
          </h1>
          <p className="max-w-[540px] text-lg leading-relaxed text-fg-secondary">
            The groups you belong to on The Superhero — each with its own page, members-only
            projects and contribution totals.
          </p>
        </header>

        {orgs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-fg-tertiary">
              <Building2 className="size-6" />
            </div>
            <h2 className="font-display text-2xl font-normal">No organisations yet.</h2>
            <p className="max-w-[460px] text-sm leading-relaxed text-fg-secondary">
              Join one with an invite link from its admins — or bring your own group onto the
              platform with the request button above. We approve each organisation by hand.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-10 text-center text-sm text-fg-tertiary">
            Nothing matches &ldquo;{query.trim()}&rdquo;.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((o) => (
              <Link
                key={o.id}
                href={`/orgs/${o.slug}`}
                className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface px-4 py-4 transition-all duration-fast hover:-translate-y-px hover:border-neutral-600 hover:shadow-md sm:px-5"
              >
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl font-display text-xl text-white"
                  style={{ background: LOGO_BG[o.type] }}
                >
                  {o.name.charAt(0).toUpperCase()}
                </span>
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
                        {o.isCreator ? 'Creator' : 'Admin'}
                      </span>
                    )}
                    {o.status === 'pending' && (
                      <span className="rounded-full border border-neutral-700 bg-bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
                        Waiting for approval
                      </span>
                    )}
                    {o.status === 'suspended' && (
                      <span className="rounded-full border border-red-400/40 bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-300">
                        Suspended
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-fg-tertiary">
                    {o.members} member{o.members === 1 ? '' : 's'} · {o.projects} project
                    {o.projects === 1 ? '' : 's'} · joined {o.joinedLabel}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-primary" />
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs leading-relaxed text-fg-tertiary">
          Control what each organisation sees of your hours in your{' '}
          <Link href="/profile#sec-orgs" className="text-amber-500 hover:underline">
            profile settings
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
