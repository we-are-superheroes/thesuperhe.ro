'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Globe,
  MapPin,
  Search,
  Star,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LocNote } from '@/lib/matching'

/* ================================================================
   Skill Matches — client half. Receives fully-scored cards from the
   server page and handles kind filters, the remote-only toggle and
   text search. Layout follows the Claude Design mockup: score ring,
   kind badge, matched-skill tags, a "why this match" line, and a
   location / language rail with a hover CTA.
   ================================================================ */

export interface MatchCardData {
  kind: 'step' | 'project'
  id: string
  href: string
  title: string
  /** Parent project title (steps only). */
  projectTitle: string | null
  type: string | null
  description: string | null
  skills: string[]
  remote: boolean
  location: string | null
  language: string | null
  languageLabel: string | null
  estimatedHrs: number | null
  direct: string[]
  related: string[]
  score: number
  locNote: LocNote
}

type Kind = 'all' | 'step' | 'project'

export function SkillMatchesClient({ cards }: { cards: MatchCardData[] }) {
  const [kind, setKind] = useState<Kind>('all')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [query, setQuery] = useState('')

  // Counts respect search + remote toggle but not the kind pills, so the
  // pill numbers always show what each pill would reveal (as the mockup does).
  const countable = useMemo(
    () => cards.filter((c) => matchesFilters(c, 'all', remoteOnly, query)),
    [cards, remoteOnly, query],
  )
  const visible = useMemo(
    () => cards.filter((c) => matchesFilters(c, kind, remoteOnly, query)),
    [cards, kind, remoteOnly, query],
  )

  const strong = visible.filter((c) => c.direct.length > 0)
  const adjacent = visible.filter((c) => c.direct.length === 0)

  const pills: Array<{ key: Kind; label: string; count: number }> = [
    { key: 'all', label: 'All', count: countable.length },
    { key: 'step', label: 'Steps', count: countable.filter((c) => c.kind === 'step').length },
    {
      key: 'project',
      label: 'Projects',
      count: countable.filter((c) => c.kind === 'project').length,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Tools row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setKind(p.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-fast',
                kind === p.key
                  ? 'border-amber-500/40 bg-amber-500/[0.12] text-amber-500'
                  : 'border-neutral-700 bg-bg-surface text-fg-secondary hover:border-neutral-600 hover:text-fg-primary',
              )}
            >
              {p.label} <span className="text-[11px] opacity-75">{p.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search matches…"
              autoComplete="off"
              className="w-[210px] rounded-lg border border-neutral-700 bg-bg-surface py-2 pl-9 pr-3 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
            />
          </div>
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-fg-secondary">
            Remote only
            <span className="relative inline-block h-[19px] w-[34px]">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full border border-neutral-700 bg-bg-surface-3 transition-colors peer-checked:border-amber-500 peer-checked:bg-amber-500/20" />
              <span className="absolute left-[3px] top-[3px] size-[13px] rounded-full bg-fg-secondary transition-transform peer-checked:translate-x-[15px] peer-checked:bg-amber-500" />
            </span>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
          <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
            <Star className="size-7" />
          </div>
          <h3 className="font-display text-2xl">No matches with those filters.</h3>
          <p className="max-w-[460px] leading-relaxed text-fg-secondary">
            Try turning off &ldquo;Remote only&rdquo;, clearing the search — or add more
            skills to your profile to widen the net.
          </p>
        </div>
      ) : (
        <>
          {strong.length > 0 && (
            <section className="flex flex-col gap-3">
              <GroupHead
                title="Strong matches"
                sub={`${strong.length} — they need a skill you already have`}
              />
              {strong.map((c, i) => (
                <MatchCard key={`${c.kind}-${c.id}`} card={c} index={i} />
              ))}
            </section>
          )}
          {adjacent.length > 0 && (
            <section className="flex flex-col gap-3">
              <GroupHead
                title="Adjacent to your skills"
                sub={`${adjacent.length} — in the same skill areas, a chance to stretch`}
              />
              {adjacent.map((c, i) => (
                <MatchCard key={`${c.kind}-${c.id}`} card={c} index={i} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function matchesFilters(c: MatchCardData, kind: Kind, remoteOnly: boolean, query: string) {
  if (kind !== 'all' && c.kind !== kind) return false
  if (remoteOnly && !c.remote) return false
  if (query.trim()) {
    const q = query.trim().toLowerCase()
    const hay = [c.title, c.projectTitle, c.description, c.type, c.location, ...c.skills]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function GroupHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-1 flex items-center gap-4">
      <h2 className="font-display text-2xl font-normal tracking-tight">{title}</h2>
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className="text-sm text-fg-tertiary">{sub}</span>
    </div>
  )
}

/* ── Score ring ─────────────────────────────────────────────── */

function ScoreRing({ score, strong }: { score: number; strong: boolean }) {
  const r = 24
  const c = 2 * Math.PI * r
  const offset = c * (1 - score / 100)
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="relative size-14">
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            strokeWidth="4"
            className="stroke-[var(--color-bg-surface-3)]"
          />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c.toFixed(1)}
            strokeDashoffset={offset.toFixed(1)}
            className={strong ? 'stroke-amber-500' : 'stroke-blue-400'}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-base">
          {score}
        </span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
        Match
      </span>
    </div>
  )
}

/* ── Card ───────────────────────────────────────────────────── */

function MatchCard({ card, index }: { card: MatchCardData; index: number }) {
  const strong = card.direct.length > 0
  return (
    <Link
      href={card.href}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
      className="group grid animate-[rise_400ms_ease-out_backwards] grid-cols-[auto_1fr] items-start gap-5 rounded-2xl border border-white/[0.08] bg-bg-surface p-5 transition-all duration-fast hover:-translate-y-px hover:border-neutral-600 hover:shadow-md sm:grid-cols-[auto_1fr_auto]"
    >
      <ScoreRing score={card.score} strong={strong} />

      {/* Body */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-md border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-widest',
              card.kind === 'step'
                ? 'border-green-500/40 bg-green-500/[0.10] text-green-300'
                : 'border-blue-400/40 bg-blue-500/[0.10] text-blue-300',
            )}
          >
            {card.kind}
          </span>
          {card.type && <span className="text-xs text-fg-tertiary">{card.type}</span>}
          {card.estimatedHrs != null && (
            <span className="text-xs text-fg-tertiary">· ~{card.estimatedHrs}h</span>
          )}
        </div>
        <h3 className="text-lg font-semibold leading-snug">
          {card.title}
          {card.projectTitle && (
            <span className="font-normal text-fg-secondary"> · {card.projectTitle}</span>
          )}
        </h3>
        {card.description && (
          <p className="max-w-[640px] text-sm leading-relaxed text-fg-secondary">
            {card.description}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {card.skills.map((s) => (
            <SkillTag key={s} name={s} card={card} />
          ))}
        </div>
        <WhyLine card={card} />
      </div>

      {/* Side rail */}
      <div className="col-start-2 flex flex-row flex-wrap items-center gap-2 sm:col-start-3 sm:flex-col sm:items-end sm:text-right">
        <LocationBit card={card} />
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-500 opacity-0 transition-all duration-fast group-hover:opacity-100 sm:mt-2">
          {card.kind === 'step' ? 'Claim this step' : 'View project'}
          <ArrowRight className="size-3.5" />
        </span>
      </div>
    </Link>
  )
}

function SkillTag({ name, card }: { name: string; card: MatchCardData }) {
  if (card.direct.includes(name)) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2.5 py-[3px] text-[11px] font-medium text-amber-500">
        <Check className="size-2.5" strokeWidth={3} />
        {name}
      </span>
    )
  }
  if (card.related.includes(name)) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue-400/35 bg-blue-500/[0.10] px-2.5 py-[3px] text-[11px] text-blue-300">
        <Waves className="size-2.5" />
        {name}
      </span>
    )
  }
  return (
    <span className="whitespace-nowrap rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-[3px] text-[11px] text-fg-secondary">
      {name}
    </span>
  )
}

function WhyLine({ card }: { card: MatchCardData }) {
  const bits: React.ReactNode[] = []
  if (card.direct.length > 0) {
    bits.push(
      <span key="direct" className="inline-flex items-center gap-1.5 text-green-300">
        <Check className="size-3 shrink-0" strokeWidth={2.5} />
        Needs {card.direct.join(' and ')} — you have {card.direct.length > 1 ? 'both' : 'it'}
      </span>,
    )
  }
  if (card.related.length > 0) {
    bits.push(
      <span key="related" className="inline-flex items-center gap-1.5">
        <Waves className="size-3 shrink-0" />
        {card.related.join(', ')} sits in your wheelhouse
      </span>,
    )
  }
  const ln = card.locNote
  if (ln.kind === 'near') {
    bits.push(
      <span key="loc" className="inline-flex items-center gap-1.5 text-green-300">
        <MapPin className="size-3 shrink-0" />
        In {ln.city}, same as you
      </span>,
    )
  } else if (ln.kind === 'far') {
    bits.push(
      <span key="loc" className="inline-flex items-center gap-1.5">
        <MapPin className="size-3 shrink-0" />
        {ln.location ?? 'Location unknown'} — travel needed
      </span>,
    )
  } else if (ln.kind === 'remote-lang') {
    bits.push(
      <span key="loc" className="inline-flex items-center gap-1.5 text-green-300">
        <Globe className="size-3 shrink-0" />
        Remote, works in {card.languageLabel ?? ln.language}
      </span>,
    )
  } else if (ln.kind === 'remote-nolang') {
    bits.push(
      <span key="loc" className="inline-flex items-center gap-1.5">
        <Globe className="size-3 shrink-0" />
        Remote, but runs in {card.languageLabel ?? ln.language}
      </span>,
    )
  } else {
    bits.push(
      <span key="loc" className="inline-flex items-center gap-1.5">
        <Globe className="size-3 shrink-0" />
        Remote contributors welcome
      </span>,
    )
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-dashed border-white/[0.08] pt-2 text-xs text-fg-tertiary">
      {bits.map((b, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && <span className="text-fg-tertiary/60">·</span>}
          {b}
        </span>
      ))}
    </div>
  )
}

function LocationBit({ card }: { card: MatchCardData }) {
  if (card.remote) {
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-secondary">
          <Globe className="size-3 shrink-0 text-fg-tertiary" />
          Remote
        </span>
        {card.languageLabel && (
          <span
            className={cn(
              'rounded-full border px-2 py-[2px] text-[10px]',
              card.locNote.kind === 'remote-lang'
                ? 'border-green-500/40 bg-green-500/[0.08] text-green-300'
                : 'border-white/[0.08] bg-bg-surface-2 text-fg-tertiary',
            )}
          >
            {card.languageLabel}
          </span>
        )}
      </span>
    )
  }
  const near = card.locNote.kind === 'near'
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-secondary">
      <MapPin className="size-3 shrink-0 text-fg-tertiary" />
      {near ? (
        <span className="font-medium text-green-300">{card.location} · near you</span>
      ) : (
        card.location ?? 'Location not set'
      )}
    </span>
  )
}
