'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Plus, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectBox } from '@/components/platform/project-form-bits'
import {
  StepTimeLog,
  type StepTimeLogData,
} from '@/components/platform/step-time-log'

/* ================================================================
   /my-steps — client.
   The page is now a list of steps the user has joined, with the
   same time-logging UI (StepTimeLog) used on the project page.
   Status pill is read-only — changes belong on the project page.
   ================================================================ */

export interface MyStep {
  id: string
  name: string
  project: { id: string; title: string }
  stepStatus: string
  helpWanted: boolean
  skill: string | null
  isCoordinator: boolean
  myHoursLogged: number
  timeLog: StepTimeLogData
}

type FilterKey = 'open' | 'completed'
type SortKey = 'recent' | 'project' | 'name'
type GroupKey = 'none' | 'project'

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
}

const STATUS_PILL_CLASSES: Record<string, string> = {
  open: 'border-white/[0.12] bg-bg-surface-2 text-fg-secondary',
  in_progress: 'border-blue-400/50 bg-blue-500/[0.18] text-blue-200',
  completed: 'border-green-500/40 bg-green-500/[0.14] text-green-300',
}

function fmtHours(h: number): string {
  if (h <= 0) return '0h'
  if (h >= 1) {
    const whole = Math.floor(h)
    const min = Math.round((h - whole) * 60)
    return min ? `${whole}h ${min}m` : `${whole}h`
  }
  return `${Math.round(h * 60)}m`
}

export function MyStepsClient({ steps: initialSteps }: { steps: MyStep[] }) {
  const [steps, setSteps] = useState(initialSteps)
  const [filter, setFilter] = useState<FilterKey>('open')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')

  const counts = useMemo(
    () => ({
      open: steps.filter((s) => s.stepStatus !== 'completed').length,
      completed: steps.filter((s) => s.stepStatus === 'completed').length,
    }),
    [steps],
  )

  const totalHoursMine = useMemo(
    () => steps.reduce((sum, s) => sum + s.myHoursLogged, 0),
    [steps],
  )

  const filtered = useMemo(() => {
    let list =
      filter === 'completed'
        ? steps.filter((s) => s.stepStatus === 'completed')
        : steps.filter((s) => s.stepStatus !== 'completed')
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
      // "recent" = most recently logged on top
      const aRecent = a.timeLog.recentLogs[0]?.loggedOnMs ?? 0
      const bRecent = b.timeLog.recentLogs[0]?.loggedOnMs ?? 0
      return bRecent - aRecent
    })
  }, [steps, filter, query, sort])

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

  // Optimistic updates from the shared StepTimeLog component.
  const applyLogged = (
    stepId: string,
    log: MyStep['timeLog']['recentLogs'][number],
    newTotal: number,
  ) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s
        const stat = s.timeLog
        const myDelta = log.hours
        return {
          ...s,
          myHoursLogged: s.myHoursLogged + myDelta,
          timeLog: {
            ...stat,
            totalHours: newTotal,
            totalEntryCount: stat.totalEntryCount + 1,
            recentLogs: [log, ...stat.recentLogs].slice(0, 4),
          },
        }
      }),
    )
  }
  const applyDeleted = (stepId: string, logId: string, newTotal: number) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== stepId) return s
        const removed = s.timeLog.recentLogs.find((l) => l.id === logId)
        const myDelta = removed?.user?.isMe ? removed.hours : 0
        return {
          ...s,
          myHoursLogged: Math.max(0, s.myHoursLogged - myDelta),
          timeLog: {
            ...s.timeLog,
            totalHours: newTotal,
            totalEntryCount: Math.max(0, s.timeLog.totalEntryCount - 1),
            recentLogs: s.timeLog.recentLogs.filter((l) => l.id !== logId),
          },
        }
      }),
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="relative order-2 w-full min-w-0 max-w-[480px] flex-1 sm:order-1 sm:w-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search steps…"
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Find a step to join</span>
            <span className="sm:hidden">Find</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 overflow-y-auto p-4 sm:p-6 lg:p-10">
        <section className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <h1 className="mb-3 font-display text-[clamp(32px,7vw,52px)] font-normal leading-none tracking-tight">
              Your <em className="italic text-amber-500">time</em>, logged.
            </h1>
            <p className="max-w-[520px] text-base leading-relaxed text-fg-secondary sm:text-lg">
              Track the hours you&apos;ve put into each step you&apos;ve joined.
              Change a step&apos;s status from the project page when you&apos;re ready.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4 sm:w-auto">
            <Stat value={counts.open} label="Active" dimIfZero />
            <Stat value={counts.completed} label="Completed" dimIfZero />
            <Stat value={fmtHours(totalHoursMine)} label="My hours" />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              active={filter === 'open'}
              label="Active"
              count={counts.open}
              onClick={() => setFilter('open')}
            />
            <FilterPill
              active={filter === 'completed'}
              label="Completed"
              count={counts.completed}
              onClick={() => setFilter('completed')}
            />
          </div>
          <div className="flex items-center gap-3">
            <SelectBox
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-auto cursor-pointer bg-bg-surface py-2 pl-3 pr-8 [background-position:right_10px_center]"
            >
              <option value="recent">Recently logged</option>
              <option value="project">By project</option>
              <option value="name">By name</option>
            </SelectBox>
            <SelectBox
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupKey)}
              title="Group by"
              className="w-auto cursor-pointer bg-bg-surface py-2 pl-3 pr-8 [background-position:right_10px_center]"
            >
              <option value="none">No groups</option>
              <option value="project">Group by project</option>
            </SelectBox>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState filter={filter} query={query} />
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <div key={group.label || 'all'} className="flex flex-col gap-3">
                {group.label && (
                  <div className="my-2 flex items-center gap-3 first:mt-0">
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
                    onLogged={(log, total) => applyLogged(s.id, log, total)}
                    onDeleted={(logId, total) => applyDeleted(s.id, logId, total)}
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

function Stat({
  value,
  label,
  dimIfZero,
}: {
  value: number | string
  label: string
  dimIfZero?: boolean
}) {
  const dim = dimIfZero && (value === 0 || value === '0')
  return (
    <div>
      <div
        className={cn(
          'font-display text-2xl leading-none',
          dim ? 'text-fg-tertiary' : 'text-amber-500',
        )}
      >
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
  onLogged,
  onDeleted,
}: {
  step: MyStep
  onLogged: (
    log: MyStep['timeLog']['recentLogs'][number],
    newTotal: number,
  ) => void
  onDeleted: (logId: string, newTotal: number) => void
}) {
  const canLog = step.stepStatus !== 'completed'
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-bg-surface px-5 py-4 transition-all duration-fast',
        step.stepStatus === 'completed'
          ? 'border-white/[0.06] opacity-80'
          : 'border-white/[0.08]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${step.project.id}`}
              className="truncate text-base font-medium text-fg-primary transition-colors hover:text-amber-500"
            >
              {step.name}
            </Link>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                STATUS_PILL_CLASSES[step.stepStatus] ?? STATUS_PILL_CLASSES.open,
              )}
            >
              {STATUS_LABEL[step.stepStatus] ?? step.stepStatus}
            </span>
            {step.helpWanted && step.stepStatus !== 'completed' && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/[0.14] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                Needs help
              </span>
            )}
            {step.isCoordinator && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/[0.10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                Coordinator
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-tertiary">
            <Link
              href={`/projects/${step.project.id}`}
              className="truncate transition-colors hover:text-fg-secondary"
            >
              {step.project.title}
            </Link>
            {step.skill && <span>· {step.skill}</span>}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              You: {fmtHours(step.myHoursLogged)}
            </span>
          </div>
        </div>
      </div>

      <StepTimeLog
        data={step.timeLog}
        canLog={canLog}
        onLogged={onLogged}
        onDeleted={onDeleted}
      />
    </div>
  )
}

function EmptyState({ filter, query }: { filter: FilterKey; query: string }) {
  let title: string
  let desc: string
  if (query.trim()) {
    title = 'No steps match that search.'
    desc = 'Try a different keyword or clear the search.'
  } else if (filter === 'completed') {
    title = 'Nothing completed yet.'
    desc = "Mark a step completed from the project page and it'll show up here."
  } else {
    title = 'You haven’t joined any steps yet.'
    desc = 'Find a project, join a step, then come back here to log time.'
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
      <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
        <Clock className="size-7" />
      </div>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="max-w-[460px] text-base leading-relaxed text-fg-secondary">{desc}</p>
    </div>
  )
}
