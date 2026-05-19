'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Search, Plus, Clock, Trash2, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  logTimeAction,
  deleteTimeLogAction,
} from '@/app/(platform)/my-steps/actions'

/* ================================================================
   /my-steps — client. The page used to be a checkbox-driven
   "mark done" list; now that steps are multi-joiner, status
   transitions belong on the project view. This page is about
   logging time: a per-step running total plus a small inline
   form to add or remove entries.
   ================================================================ */

export interface TimeLogEntry {
  id: string
  hours: number
  note: string | null
  loggedOnMs: number
}

export interface MyStep {
  id: string
  contributionId: string
  name: string
  project: { id: string; title: string }
  stepStatus: string
  skill: string | null
  isCoordinator: boolean
  hoursLogged: number
  recentLogs: TimeLogEntry[]
}

type FilterKey = 'open' | 'completed'
type SortKey = 'recent' | 'project' | 'name'
type GroupKey = 'none' | 'project'

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  defining: 'Being defined',
  in_progress: 'In progress',
  needs_help: 'Needs help',
  completed: 'Completed',
}

const STATUS_PILL_CLASSES: Record<string, string> = {
  open: 'border-white/[0.12] bg-bg-surface-2 text-fg-secondary',
  defining: 'border-blue-400/40 bg-blue-500/10 text-blue-200',
  in_progress: 'border-blue-400/50 bg-blue-500/[0.18] text-blue-200',
  needs_help: 'border-amber-500/50 bg-amber-500/[0.14] text-amber-400',
  completed: 'border-green-500/40 bg-green-500/[0.14] text-green-300',
}

function fmtHours(h: number): string {
  if (Number.isInteger(h)) return `${h}h`
  return `${h.toFixed(2).replace(/\.?0+$/, '')}h`
}

function fmtDate(ms: number, now = Date.now()): string {
  const diffDays = Math.floor((now - ms) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

export function MyStepsClient({ steps: initialSteps }: { steps: MyStep[] }) {
  const [steps, setSteps] = useState(initialSteps)
  const [filter, setFilter] = useState<FilterKey>('open')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [openLogger, setOpenLogger] = useState<string | null>(null)

  const counts = useMemo(
    () => ({
      open: steps.filter((s) => s.stepStatus !== 'completed').length,
      completed: steps.filter((s) => s.stepStatus === 'completed').length,
    }),
    [steps],
  )

  const totalHours = useMemo(
    () => steps.reduce((sum, s) => sum + s.hoursLogged, 0),
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
      // "recent" — most recently logged on top
      const aRecent = a.recentLogs[0]?.loggedOnMs ?? 0
      const bRecent = b.recentLogs[0]?.loggedOnMs ?? 0
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

  // Optimistic helpers reused by the row.
  const applyLogged = (
    stepId: string,
    log: TimeLogEntry,
    newTotal: number,
  ) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              hoursLogged: newTotal,
              recentLogs: [log, ...s.recentLogs].slice(0, 5),
            }
          : s,
      ),
    )
  }
  const applyDeleted = (stepId: string, logId: string, newTotal: number) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              hoursLogged: newTotal,
              recentLogs: s.recentLogs.filter((l) => l.id !== logId),
            }
          : s,
      ),
    )
  }

  return (
    <>
      {/* Topbar */}
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

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 overflow-y-auto p-4 sm:p-6 lg:p-10">
        <section className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <h1 className="mb-3 font-display text-[clamp(32px,7vw,52px)] font-normal leading-none tracking-tight">
              Your <em className="italic text-amber-500">time</em>, logged.
            </h1>
            <p className="max-w-[520px] text-base leading-relaxed text-fg-secondary sm:text-lg">
              Track the hours you&apos;ve put into each step you&apos;ve joined. Change
              a step&apos;s status from the project page when you&apos;re ready.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4 sm:w-auto">
            <Stat value={counts.open} label="Active" dimIfZero />
            <Stat value={counts.completed} label="Completed" dimIfZero />
            <Stat value={fmtHours(totalHours)} label="Hours" />
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
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-700 bg-bg-surface py-2 pl-3 pr-8 text-sm text-fg-primary outline-none [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%23A8BCCE%22_stroke-width=%222.5%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_10px_center] [background-repeat:no-repeat]"
            >
              <option value="recent">Recently logged</option>
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

        {filtered.length === 0 ? (
          <EmptyState filter={filter} query={query} />
        ) : (
          <div className="flex flex-col gap-3">
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
                    isOpen={openLogger === s.id}
                    onToggleLogger={() =>
                      setOpenLogger(openLogger === s.id ? null : s.id)
                    }
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
  isOpen,
  onToggleLogger,
  onLogged,
  onDeleted,
}: {
  step: MyStep
  isOpen: boolean
  onToggleLogger: () => void
  onLogged: (log: TimeLogEntry, newTotal: number) => void
  onDeleted: (logId: string, newTotal: number) => void
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-bg-surface transition-all duration-fast',
        step.stepStatus === 'completed'
          ? 'border-white/[0.06] opacity-75'
          : 'border-white/[0.08]',
      )}
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-4 px-5 py-4">
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
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {fmtHours(step.hoursLogged)} logged
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleLogger}
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            isOpen
              ? 'border-amber-500 bg-amber-500/[0.10] text-amber-500'
              : 'border-neutral-700 bg-bg-surface-2 text-fg-secondary hover:border-neutral-600 hover:text-fg-primary',
          )}
        >
          {isOpen ? (
            <>
              <X className="size-3" strokeWidth={2.5} />
              Close
            </>
          ) : (
            <>
              <Plus className="size-3" strokeWidth={2.5} />
              Log time
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <LoggerPanel step={step} onLogged={onLogged} onDeleted={onDeleted} />
      )}
    </div>
  )
}

function LoggerPanel({
  step,
  onLogged,
  onDeleted,
}: {
  step: MyStep
  onLogged: (log: TimeLogEntry, newTotal: number) => void
  onDeleted: (logId: string, newTotal: number) => void
}) {
  const [hours, setHours] = useState('1')
  const [note, setNote] = useState('')
  const [loggedOn, setLoggedOn] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showHistory, setShowHistory] = useState(false)

  const submit = () => {
    setError(null)
    const n = Number(hours)
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a positive number of hours.')
      return
    }
    startTransition(async () => {
      const result = await logTimeAction(step.id, n, note, loggedOn)
      if (!result.success) {
        setError(result.error)
        return
      }
      onLogged(
        {
          id: result.data.logId,
          hours: Math.round(n * 4) / 4,
          note: note.trim() || null,
          loggedOnMs: new Date(loggedOn).getTime(),
        },
        result.data.newTotal,
      )
      setHours('1')
      setNote('')
    })
  }

  const remove = (logId: string) => {
    startTransition(async () => {
      const result = await deleteTimeLogAction(logId)
      if (result.success) {
        onDeleted(logId, result.data.newTotal)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 border-t border-white/[0.08] bg-bg-base px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-fg-tertiary">
          Hours
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-[90px] rounded-lg border border-neutral-700 bg-bg-surface px-3 py-2 text-sm text-fg-primary outline-none focus:border-amber-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-tertiary">
          Date
          <input
            type="date"
            value={loggedOn}
            onChange={(e) => setLoggedOn(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-bg-surface px-3 py-2 text-sm text-fg-primary outline-none focus:border-amber-500"
          />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-fg-tertiary">
          Note (optional)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you do?"
            className="rounded-lg border border-neutral-700 bg-bg-surface px-3 py-2 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
            maxLength={500}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-medium text-amber-900 transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Log it'}
        </button>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}

      {step.recentLogs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 self-start text-xs text-fg-tertiary transition-colors hover:text-fg-secondary"
          >
            <ChevronDown
              className={cn('size-3 transition-transform', showHistory && 'rotate-180')}
              strokeWidth={2.5}
            />
            {showHistory ? 'Hide recent entries' : `Recent entries (${step.recentLogs.length})`}
          </button>
          {showHistory && (
            <ul className="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.06] bg-bg-surface">
              {step.recentLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-fg-primary">
                      {fmtHours(log.hours)} · {fmtDate(log.loggedOnMs)}
                    </span>
                    {log.note && (
                      <span className="truncate text-xs text-fg-tertiary">{log.note}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(log.id)}
                    disabled={pending}
                    title="Delete entry"
                    className="text-fg-tertiary transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
