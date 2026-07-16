'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, ChevronDown, Check, LogIn, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { joinStepAction, leaveStepAction } from '@/app/(platform)/projects/[id]/actions'
import {
  completeStepAction,
  reopenStepAction,
  setStepHelpWantedAction,
  setStepCoordinatorAction,
} from '@/app/(platform)/projects/[id]/step-actions'
import { normaliseStepStatus, type LiveStepStatus } from '@/lib/step-status'
import {
  StepTimeLog,
  type StepTimeLogData,
} from '@/components/platform/step-time-log'

/* ================================================================
   Step status — maintained by the system, not a menu:

     open         — nobody on it (joining flips it onwards)
     in_progress  — has people on it
     completed    — done (Mark complete / Reopen)

   "Needs help" is the orthogonal helpWanted flag — a step can be
   in progress AND asking for more hands. The lead and the people
   on a step get two controls: the help toggle and complete/reopen.
   ================================================================ */

export type StepStatusKey = LiveStepStatus

type FilterKey = 'all' | 'needs_help' | StepStatusKey

export interface StepJoiner {
  id: string
  name: string
  initials: string
  isCoordinator: boolean
  isMe: boolean
}

export interface StepCardData {
  id: string
  title: string
  description: string | null
  status: string
  helpWanted: boolean
  order: number
  totalSteps: number
  estimatedHrs: number | null
  joiners: StepJoiner[]
  meOnStep: boolean
  skills: string[]
  timeLog: StepTimeLogData
}

const INITIAL_VISIBLE = 7

export function ProjectStepsList({
  projectId,
  steps,
  stepCounts,
  isSignedIn,
  isMember,
  isLead,
}: {
  projectId: string
  steps: StepCardData[]
  stepCounts: {
    needs_help: number
    in_progress: number
    open: number
    completed: number
  }
  isSignedIn: boolean
  isMember: boolean
  isLead: boolean
}) {
  const t = useTranslations('steps')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [showAll, setShowAll] = useState(false)
  // Optimistic local overrides for status + help flag, ahead of the
  // server round-trip.
  const [localStatuses, setLocalStatuses] = useState<Record<string, StepStatusKey>>(
    {},
  )
  const [localHelp, setLocalHelp] = useState<Record<string, boolean>>({})

  const statusOf = (s: StepCardData): StepStatusKey =>
    localStatuses[s.id] ?? normaliseStepStatus(s.status, s.joiners.length > 0)
  const helpOf = (s: StepCardData): boolean =>
    (localHelp[s.id] ?? (s.helpWanted || s.status === 'needs_help')) &&
    statusOf(s) !== 'completed'

  const matchesFilter = (s: StepCardData): boolean => {
    if (filter === 'all') return true
    if (filter === 'needs_help') return helpOf(s)
    return statusOf(s) === filter
  }

  const filtered = useMemo(() => {
    return steps.filter(matchesFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, filter, localStatuses, localHelp])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)
  const hiddenCount = filtered.length - visible.length

  const liveCounts = useMemo(() => {
    // If nothing changed locally, trust the server-computed counts.
    if (
      Object.keys(localStatuses).length === 0 &&
      Object.keys(localHelp).length === 0
    ) {
      return { all: steps.length, ...stepCounts }
    }
    const c = { needs_help: 0, in_progress: 0, open: 0, completed: 0 }
    for (const s of steps) {
      c[statusOf(s)] += 1
      if (helpOf(s)) c.needs_help += 1
    }
    return { all: steps.length, ...c }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, stepCounts, localStatuses, localHelp])

  const handleStatusChange = (stepId: string, next: StepStatusKey) => {
    setLocalStatuses((prev) => ({ ...prev, [stepId]: next }))
  }
  const handleHelpChange = (stepId: string, next: boolean) => {
    setLocalHelp((prev) => ({ ...prev, [stepId]: next }))
  }

  return (
    <>
      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap gap-3">
        <FilterChip
          active={filter === 'all'}
          label={t('filter.all')}
          count={liveCounts.all}
          onClick={() => setFilter('all')}
        />
        <FilterChip
          active={filter === 'needs_help'}
          label={t('needsHelp')}
          count={liveCounts.needs_help}
          onClick={() => setFilter('needs_help')}
        />
        <FilterChip
          active={filter === 'in_progress'}
          label={t('status.in_progress')}
          count={liveCounts.in_progress}
          onClick={() => setFilter('in_progress')}
        />
        <FilterChip
          active={filter === 'open'}
          label={t('status.open')}
          count={liveCounts.open}
          onClick={() => setFilter('open')}
        />
        <FilterChip
          active={filter === 'completed'}
          label={t('status.completed')}
          count={liveCounts.completed}
          onClick={() => setFilter('completed')}
        />
      </div>

      {/* Step cards */}
      <div className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center text-sm text-fg-tertiary">
            {t('list.empty')}
          </div>
        ) : (
          visible.map((step) => (
            <StepCard
              key={step.id}
              projectId={projectId}
              step={step}
              status={statusOf(step)}
              helpWanted={helpOf(step)}
              isSignedIn={isSignedIn}
              isMember={isMember}
              isLead={isLead}
              onStatusChange={(next) => handleStatusChange(step.id, next)}
              onHelpChange={(next) => handleHelpChange(step.id, next)}
            />
          ))
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-700 bg-bg-surface px-5 py-5 text-sm text-fg-tertiary transition-colors hover:border-neutral-600 hover:text-fg-primary"
          >
            {t('list.showAll', { count: filtered.length })}
            <ChevronDown className="size-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </>
  )
}

/* ================================================================
   Filter chip
   ================================================================ */

function FilterChip({
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
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
        active
          ? 'border-amber-500 bg-amber-500/[0.12] text-amber-500'
          : 'border-white/[0.08] bg-bg-surface text-fg-secondary hover:text-fg-primary',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-[7px] py-px text-[10px] font-semibold',
          active ? 'bg-amber-500/20' : 'bg-bg-surface-2',
        )}
      >
        {count}
      </span>
    </button>
  )
}

/* ================================================================
   Step card
   ================================================================ */

function StepCard({
  projectId,
  step,
  status,
  helpWanted,
  isSignedIn,
  isMember,
  isLead,
  onStatusChange,
  onHelpChange,
}: {
  projectId: string
  step: StepCardData
  status: StepStatusKey
  helpWanted: boolean
  isSignedIn: boolean
  isMember: boolean
  isLead: boolean
  onStatusChange: (next: StepStatusKey) => void
  onHelpChange: (next: boolean) => void
}) {
  const t = useTranslations('steps')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isNeedsHelp = helpWanted && status !== 'completed'
  const isDone = status === 'completed'

  const join = () => {
    setError(null)
    startTransition(async () => {
      const result = await joinStepAction(projectId, step.id)
      if (!result.success) setError(result.error)
    })
  }

  const leave = () => {
    setError(null)
    startTransition(async () => {
      const result = await leaveStepAction(projectId, step.id)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border bg-bg-surface px-4 py-4 transition-all duration-standard sm:px-6 sm:py-5',
        isNeedsHelp &&
          'border-amber-500/40 bg-[radial-gradient(ellipse_at_left,rgba(244,165,53,0.08),transparent_60%),var(--color-bg-surface)] hover:border-amber-500/70',
        isDone && 'border-white/[0.06] opacity-80 hover:border-white/[0.14] hover:opacity-100',
        !isNeedsHelp && !isDone && 'border-white/[0.08] hover:border-neutral-600',
      )}
    >
      {/* Head */}
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            {t('card.orderOfTotal', { order: step.order, total: step.totalSteps })}
            {step.estimatedHrs != null && (
              <> · {t('card.estimatedHours', { hours: step.estimatedHrs })}</>
            )}
          </span>
          <span
            className={cn(
              'font-display text-xl leading-tight',
              isDone && 'text-fg-secondary',
            )}
          >
            {step.title}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          {isNeedsHelp && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/50 bg-amber-500/[0.14] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-400 shadow-glow-amber">
              <HelpGlyph />
              {t('needsHelp')}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
              STATUS_PILL_CLASSES[status],
            )}
          >
            <StatusGlyph status={status} />
            {t(`status.${status}`)}
          </span>
        </div>
      </div>

      {/* Description (skip on completed cards) */}
      {step.description && !isDone && (
        <p className="text-sm leading-relaxed text-fg-secondary">{step.description}</p>
      )}

      {/* Foot */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {step.skills.length > 0 ? (
              step.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-1 text-xs text-fg-secondary"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-1 text-xs text-fg-secondary">
                {t('card.noSkills')}
              </span>
            )}
          </div>
          {step.joiners.length > 0 && (
            <JoinersStack
              projectId={projectId}
              stepId={step.id}
              joiners={step.joiners}
              isLead={isLead}
            />
          )}
        </div>

        <StepAction
          projectId={projectId}
          step={step}
          status={status}
          helpWanted={helpWanted}
          isSignedIn={isSignedIn}
          isMember={isMember}
          canManage={isSignedIn && isMember && (isLead || step.meOnStep)}
          pending={pending}
          error={error}
          onJoin={join}
          onLeave={leave}
          onStatusChange={onStatusChange}
          onHelpChange={onHelpChange}
        />
      </div>

      {/* Time log — only joiners can log, but anyone can see the summary
          and the recent entries. */}
      <StepTimeLog data={step.timeLog} canLog={step.meOnStep} />
    </div>
  )
}

/* ================================================================
   Joiners — avatar stack with coordinator pip + overflow chip
   ================================================================ */

const AVATAR_GRADIENTS = [
  'bg-[linear-gradient(135deg,#B86E00,#F4A535_55%,#FAD08F)]',
  'bg-[linear-gradient(135deg,#1A5C40,#3DAF7C_60%,#7DD3B0)]',
  'bg-[linear-gradient(135deg,#2E5FAA,#4A7FD4_60%,#B2D0F5)]',
  'bg-[linear-gradient(135deg,#5C3600,#B86E00_60%,#F7BD64)]',
  'bg-[linear-gradient(135deg,#1B3A6B,#2E5FAA_60%,#7AAEE8)]',
  'bg-[linear-gradient(135deg,#7A1A1A,#E05252_60%,#F09898)]',
]

function gradientFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length]
}

function JoinersStack({
  projectId,
  stepId,
  joiners,
  isLead,
}: {
  projectId: string
  stepId: string
  joiners: StepJoiner[]
  isLead: boolean
}) {
  const t = useTranslations('steps')
  // Local copy so the lead's coordinator change can be reflected
  // optimistically. The server round-trips on the next router.refresh();
  // re-sync is adjusted during render when the prop identity changes.
  const [localJoiners, setLocalJoiners] = useState(joiners)
  const [prevJoiners, setPrevJoiners] = useState(joiners)
  if (joiners !== prevJoiners) {
    setPrevJoiners(joiners)
    setLocalJoiners(joiners)
  }
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const maxVisible = 4
  const visible = localJoiners.slice(0, maxVisible)
  const overflow = localJoiners.length - visible.length
  const coordinator = localJoiners.find((j) => j.isCoordinator)

  const titleParts = localJoiners.map((j) =>
    j.isCoordinator ? t('joiners.coordinatorName', { name: j.name }) : j.name,
  )

  const pickCoordinator = (nextId: string | null) => {
    setOpen(false)
    setError(null)
    const previous = localJoiners
    setLocalJoiners((prev) =>
      prev.map((j) => ({ ...j, isCoordinator: j.id === nextId })),
    )
    startTransition(async () => {
      const result = await setStepCoordinatorAction(projectId, stepId, nextId)
      if (!result.success) {
        setLocalJoiners(previous)
        setError(result.error)
      }
    })
  }

  const inner = (
    <>
      <div className="flex -space-x-1.5">
        {visible.map((j) => (
          <div
            key={j.id}
            className={cn(
              'relative flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-blue-900 ring-2 ring-bg-surface',
              gradientFor(j.id),
            )}
          >
            {j.initials}
            {j.isCoordinator && (
              <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full bg-amber-500 ring-[1.5px] ring-bg-surface" />
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="flex size-6 items-center justify-center rounded-full bg-bg-surface-2 text-[10px] font-semibold text-fg-secondary ring-2 ring-bg-surface">
            +{overflow}
          </div>
        )}
      </div>
      {coordinator && (
        <span className="text-xs text-fg-tertiary">
          {coordinator.isMe
            ? t('joiners.youCoordinate')
            : t('joiners.nameCoordinates', { name: firstName(coordinator.name) })}
        </span>
      )}
    </>
  )

  if (!isLead) {
    return (
      <div
        className="flex items-center gap-2"
        title={titleParts.join(', ')}
      >
        {inner}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('joiners.changeCoordinator')}
        className={cn(
          'flex items-center gap-2 rounded-full px-1.5 py-0.5 transition-colors',
          'hover:bg-white/[0.04]',
          open && 'bg-white/[0.04]',
          pending && 'opacity-70',
        )}
      >
        {inner}
        <Pencil className="size-3 text-fg-tertiary" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 flex w-[240px] flex-col gap-0.5 rounded-xl border border-neutral-700 bg-bg-surface-2 p-1.5 shadow-lg"
        >
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
            {t('joiners.menuTitle')}
          </div>
          {localJoiners.map((j) => (
            <button
              key={j.id}
              type="button"
              role="menuitem"
              onClick={() => pickCoordinator(j.id)}
              disabled={pending}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg-primary transition-colors hover:bg-bg-surface-3',
                j.isCoordinator && 'bg-amber-500/[0.06]',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-blue-900',
                  gradientFor(j.id),
                )}
              >
                {j.initials}
              </span>
              <span className="truncate">{j.name}</span>
              {j.isCoordinator && (
                <Check
                  className="ml-auto size-3.5 text-amber-500"
                  strokeWidth={2.5}
                />
              )}
            </button>
          ))}
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => pickCoordinator(null)}
            disabled={pending}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-3',
              !coordinator && 'bg-amber-500/[0.06]',
            )}
          >
            {t('joiners.noCoordinator')}
            {!coordinator && (
              <Check className="ml-auto size-3.5 text-amber-500" strokeWidth={2.5} />
            )}
          </button>
          {error && (
            <div className="px-2 py-1 text-xs text-red-300">{error}</div>
          )}
        </div>
      )}
    </div>
  )
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

/* ── Status visuals ─────────────────────────────────────────────── */

const STATUS_PILL_CLASSES: Record<StepStatusKey, string> = {
  open: 'border-white/[0.12] bg-bg-surface-2 text-fg-secondary',
  in_progress: 'border-blue-400/50 bg-blue-500/[0.18] text-blue-200',
  completed: 'border-green-500/40 bg-green-500/[0.14] text-green-300',
}

function HelpGlyph() {
  return (
    <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-500 font-display text-[9px] font-bold leading-none text-amber-900 shadow-[0_0_6px_rgba(244,165,53,0.7)]">
      !
    </span>
  )
}

function StatusGlyph({ status }: { status: StepStatusKey }) {
  if (status === 'open') {
    return (
      <span className="size-3.5 rounded-full border-[1.5px] border-current bg-transparent" />
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="relative inline-flex size-3.5 items-center justify-center rounded-full border-[1.5px] border-blue-400">
        <span className="size-1.5 animate-pulse rounded-full bg-blue-300" />
      </span>
    )
  }
  // completed
  return (
    <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-green-500 text-blue-900">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-2.5"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

/* ── Action footer ──────────────────────────────────────────────── */

/**
 * The footer holds membership (join/leave) plus the only two step controls
 * that remain: the "Ask for help" toggle and "Mark complete / Reopen".
 * Controls appear only for people who can actually use them — the project
 * lead and the people on this step. Status itself moves automatically.
 */
function StepAction({
  projectId,
  step,
  status,
  helpWanted,
  isSignedIn,
  isMember,
  canManage,
  pending,
  error,
  onJoin,
  onLeave,
  onStatusChange,
  onHelpChange,
}: {
  projectId: string
  step: StepCardData
  status: StepStatusKey
  helpWanted: boolean
  isSignedIn: boolean
  isMember: boolean
  canManage: boolean
  pending: boolean
  error: string | null
  onJoin: () => void
  onLeave: () => void
  onStatusChange: (next: StepStatusKey) => void
  onHelpChange: (next: boolean) => void
}) {
  const t = useTranslations('steps')
  const [ctrlPending, startCtrl] = useTransition()
  const [ctrlError, setCtrlError] = useState<string | null>(null)
  const busy = pending || ctrlPending
  const isDone = status === 'completed'

  const toggleHelp = () => {
    setCtrlError(null)
    const next = !helpWanted
    onHelpChange(next) // optimistic
    startCtrl(async () => {
      const result = await setStepHelpWantedAction(projectId, step.id, next)
      if (!result.success) {
        onHelpChange(!next)
        setCtrlError(result.error)
      }
    })
  }

  const complete = () => {
    setCtrlError(null)
    const prev = status
    onStatusChange('completed') // optimistic
    onHelpChange(false)
    startCtrl(async () => {
      const result = await completeStepAction(projectId, step.id)
      if (!result.success) {
        onStatusChange(prev)
        setCtrlError(result.error)
      }
    })
  }

  const reopen = () => {
    setCtrlError(null)
    onStatusChange(step.joiners.length > 0 ? 'in_progress' : 'open') // optimistic
    startCtrl(async () => {
      const result = await reopenStepAction(projectId, step.id)
      if (!result.success) {
        onStatusChange('completed')
        setCtrlError(result.error)
      } else {
        onStatusChange(
          normaliseStepStatus(result.data.status, step.joiners.length > 0),
        )
      }
    })
  }

  const ctrlButtonClass =
    'cursor-pointer rounded-full border border-neutral-700 px-3 py-1 text-xs text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-60'

  // Signed out: a completed step needs no call to action.
  if (!isSignedIn) {
    if (isDone)
      return <span className="text-sm text-fg-tertiary">{t('action.done')}</span>
    return (
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-1 text-sm font-medium text-fg-tertiary hover:text-fg-primary"
      >
        <LogIn className="size-3.5" />
        {t('action.signInToJoin')}
      </Link>
    )
  }

  if (!isMember) {
    return (
      <span className="text-sm text-fg-tertiary">
        {isDone ? t('action.done') : t('action.joinProjectFirst')}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {(error || ctrlError) && (
        <span className="text-xs text-red-300">{error ?? ctrlError}</span>
      )}

      {canManage && !isDone && (
        <button
          type="button"
          disabled={busy}
          onClick={toggleHelp}
          className={cn(
            ctrlButtonClass,
            helpWanted && 'border-amber-500/50 text-amber-400 hover:border-amber-500 hover:text-amber-300',
          )}
        >
          {helpWanted ? t('action.withdrawHelpRequest') : t('action.askForHelp')}
        </button>
      )}
      {canManage &&
        (isDone ? (
          <button type="button" disabled={busy} onClick={reopen} className={ctrlButtonClass}>
            {t('action.reopen')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={complete}
            className={cn(ctrlButtonClass, 'border-green-500/40 text-green-300 hover:border-green-500 hover:text-green-200')}
          >
            {t('action.markComplete')}
          </button>
        ))}

      {step.meOnStep ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-300">
            <Check className="size-3.5" strokeWidth={2.5} />
            {t('action.youreOnThis')}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onLeave}
            className="cursor-pointer text-sm text-fg-tertiary underline-offset-2 transition-colors hover:text-fg-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t('action.leaving') : t('action.leaveStep')}
          </button>
        </>
      ) : isDone ? (
        !canManage && (
          <span className="text-sm text-fg-tertiary">{t('action.done')}</span>
        )
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onJoin}
          className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-amber-500 transition-colors hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? t('action.joining')
            : step.joiners.length === 0
              ? t('action.joinThisStep')
              : t('action.joinToo')}
          {!pending && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
        </button>
      )}
    </div>
  )
}
