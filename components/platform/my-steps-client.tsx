'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Search, Bell, Plus, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleStepDoneAction } from '@/app/(platform)/my-steps/actions'

/* ================================================================
   Types
   ================================================================ */

export interface MyStep {
  id: string
  name: string
  project: { id: string; title: string }
  skill: string | null
  status: 'open' | 'closed'
  addedAtMs: number
}

type FilterKey = 'open' | 'closed'
type SortKey = 'recent' | 'project' | 'name'
type GroupKey = 'none' | 'project'

/* ================================================================
   Component
   ================================================================ */

export function MyStepsClient({ steps: initialSteps }: { steps: MyStep[] }) {
  const [steps, setSteps] = useState(initialSteps)
  const [filter, setFilter] = useState<FilterKey>('open')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [, startTransition] = useTransition()
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const counts = useMemo(
    () => ({
      open: steps.filter((s) => s.status === 'open').length,
      closed: steps.filter((s) => s.status === 'closed').length,
    }),
    [steps],
  )

  const filtered = useMemo(() => {
    let list = steps.filter((s) => s.status === filter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((s) =>
        `${s.name} ${s.project.title} ${s.skill ?? ''}`.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => {
      if (sort === 'project')
        return a.project.title.localeCompare(b.project.title) || a.name.localeCompare(b.name)
      if (sort === 'name') return a.name.localeCompare(b.name)
      return b.addedAtMs - a.addedAtMs
    })
  }, [steps, filter, query, sort])

  // Optionally split by project for the grouped view
  const grouped: Array<{ label: string; items: MyStep[] }> = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', items: filtered }]
    const map = new Map<string, MyStep[]>()
    for (const s of filtered) {
      const list = map.get(s.project.title) ?? []
      list.push(s)
      map.set(s.project.title, list)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items }))
  }, [filtered, groupBy])

  const toggle = (stepId: string) => {
    if (pendingIds.has(stepId)) return
    // Optimistically flip the local state so the row strikes through immediately.
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: s.status === 'open' ? 'closed' : 'open' } : s)),
    )
    setPendingIds((prev) => new Set(prev).add(stepId))
    startTransition(async () => {
      const result = await toggleStepDoneAction(stepId)
      if (!result.success) {
        // Roll back on error
        setSteps((prev) =>
          prev.map((s) =>
            s.id === stepId ? { ...s, status: s.status === 'open' ? 'closed' : 'open' } : s,
          ),
        )
      }
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(stepId)
        return next
      })
    })
  }

  return (
    <>
      {/* Topbar */}
      <div className="flex items-center justify-between gap-6 border-b border-white/[0.08] px-10 py-5">
        <div className="relative max-w-[480px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search steps…"
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
            title="Notifications"
          >
            <Bell className="size-[18px]" />
          </button>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            Claim a step
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 overflow-y-auto p-10">
        {/* Page header */}
        <section className="flex items-end justify-between gap-8">
          <div>
            <h1 className="mb-3 font-display text-[clamp(36px,4vw,52px)] font-normal leading-none tracking-tight">
              Your <em className="italic text-amber-500">next steps</em>.
            </h1>
            <p className="max-w-[520px] text-lg leading-relaxed text-fg-secondary">
              One thing at a time. Tick a step when it’s done, and it’ll fall off the list.
            </p>
          </div>
          <div className="flex gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4">
            <Stat value={counts.open} label="Open" dimIfZero />
            <Stat value={counts.closed} label="Closed" dimIfZero />
          </div>
        </section>

        {/* Tools */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              active={filter === 'open'}
              label="Open"
              count={counts.open}
              onClick={() => setFilter('open')}
            />
            <FilterPill
              active={filter === 'closed'}
              label="Closed"
              count={counts.closed}
              onClick={() => setFilter('closed')}
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-700 bg-bg-surface py-2 pl-3 pr-8 text-sm text-fg-primary outline-none [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%23A8BCCE%22_stroke-width=%222.5%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_10px_center] [background-repeat:no-repeat]"
            >
              <option value="recent">Recently added</option>
              <option value="project">By project</option>
              <option value="name">By name</option>
            </select>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupKey)}
              title="Group by"
              className="cursor-pointer appearance-none rounded-lg border border-neutral-700 bg-bg-surface py-2 pl-3 pr-8 text-sm text-fg-primary outline-none [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%23A8BCCE%22_stroke-width=%222.5%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_10px_center] [background-repeat:no-repeat]"
            >
              <option value="none">No groups</option>
              <option value="project">Group by project</option>
            </select>
          </div>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <EmptyState filter={filter} query={query} />
        ) : (
          <div className="flex flex-col gap-2">
            {grouped.map((group) => (
              <div key={group.label || 'all'} className="flex flex-col gap-2">
                {group.label && (
                  <div className="my-3 flex items-center gap-3 first:mt-0">
                    <span className="text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-white/[0.08]" />
                    <span className="text-xs text-fg-tertiary">{group.items.length}</span>
                  </div>
                )}
                {group.items.map((s) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    pending={pendingIds.has(s.id)}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ================================================================
   Sub-components
   ================================================================ */

function Stat({ value, label, dimIfZero }: { value: number; label: string; dimIfZero?: boolean }) {
  const dim = dimIfZero && value === 0
  return (
    <div>
      <div className={cn('font-display text-2xl leading-none', dim ? 'text-fg-tertiary' : 'text-amber-500')}>
        {value}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
    </div>
  )
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-[7px] text-sm transition-all',
        active
          ? 'border-amber-500/40 bg-amber-500/[0.12] text-amber-500'
          : 'border-neutral-700 bg-bg-surface text-fg-secondary hover:border-neutral-600 hover:text-fg-primary',
      )}
    >
      {label}
      <span className={cn('text-[11px]', active ? 'text-amber-500/85' : 'text-fg-tertiary')}>
        {count}
      </span>
    </button>
  )
}

function StepRow({
  step,
  pending,
  onToggle,
}: {
  step: MyStep
  pending: boolean
  onToggle: () => void
}) {
  const isDone = step.status === 'closed'
  return (
    <Link
      href={`/projects/${step.project.id}`}
      className={cn(
        'group grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border bg-bg-surface px-5 py-3.5 transition-all duration-fast hover:translate-x-0.5 hover:border-neutral-600 hover:shadow-sm',
        isDone ? 'border-white/[0.06] opacity-55' : 'border-white/[0.08]',
        pending && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggle()
        }}
        title={isDone ? 'Mark open' : 'Mark done'}
        disabled={pending}
        className={cn(
          'flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-transparent transition-all duration-fast disabled:cursor-wait',
          isDone ? 'border-green-500 bg-green-500' : 'border-neutral-600 hover:border-amber-500',
        )}
      >
        {isDone && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0E1A2B"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            'truncate text-base font-medium',
            isDone ? 'text-fg-tertiary line-through' : 'text-fg-primary',
          )}
        >
          {step.name}
        </span>
        <span className="truncate text-xs text-fg-secondary">{step.project.title}</span>
      </div>

      {step.skill && (
        <span className="whitespace-nowrap rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-[3px] text-[11px] text-fg-secondary">
          {step.skill}
        </span>
      )}
    </Link>
  )
}

function EmptyState({ filter, query }: { filter: FilterKey; query: string }) {
  let title: string
  let desc: string
  if (query.trim()) {
    title = 'No steps match that search.'
    desc = 'Try a different keyword or clear the search.'
  } else if (filter === 'closed') {
    title = 'Nothing closed yet.'
    desc = "Tick off your first step and it'll show up here."
  } else {
    title = 'All caught up.'
    desc = 'No open steps. Time to claim one — or take a breather.'
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
      <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
        <CheckCheck className="size-7" />
      </div>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="max-w-[460px] text-base leading-relaxed text-fg-secondary">{desc}</p>
    </div>
  )
}
