'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import { ArrowRight, ChevronDown, Check, LogIn, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { joinStepAction, leaveStepAction } from '@/app/(platform)/projects/[id]/actions'
import {
  setStepStatusAction,
  setStepCoordinatorAction,
} from '@/app/(platform)/projects/[id]/step-actions'
import {
  StepTimeLog,
  type StepTimeLogData,
} from '@/components/platform/step-time-log'

/* ================================================================
   Step status — new vocabulary (matches the Project View design).

     open         — Available, nobody on it
     defining     — Still being scoped
     in_progress  — Actively being worked on
     needs_help   — Asking for hands (amber, attention-grabbing)
     completed    — Done

   Any signed-in member can transition any step freely between
   states via the popover menu on each step card.
   ================================================================ */

export type StepStatusKey =
  | 'open'
  | 'defining'
  | 'in_progress'
  | 'needs_help'
  | 'completed'

const STATUS_ORDER: StepStatusKey[] = [
  'open',
  'defining',
  'in_progress',
  'needs_help',
  'completed',
]

const STATUS_LABEL: Record<StepStatusKey, string> = {
  open: 'Open',
  defining: 'Being defined',
  in_progress: 'In progress',
  needs_help: 'Needs help',
  completed: 'Completed',
}

const STATUS_HINT: Record<StepStatusKey, string> = {
  open: 'Available · nobody on it',
  defining: 'Still being scoped',
  in_progress: 'Actively being worked on',
  needs_help: 'Asking for hands',
  completed: 'Done',
}

type FilterKey = 'all' | StepStatusKey

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
    defining: number
    open: number
    completed: number
  }
  isSignedIn: boolean
  isMember: boolean
  isLead: boolean
}) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [showAll, setShowAll] = useState(false)
  const [localStatuses, setLocalStatuses] = useState<Record<string, StepStatusKey>>(
    {},
  )

  // Pull the live status for a given step, preferring the optimistic local
  // override over the server-rendered prop.
  const statusOf = (s: StepCardData): StepStatusKey =>
    (localStatuses[s.id] ?? s.status) as StepStatusKey

  const filtered = useMemo(() => {
    if (filter === 'all') return steps
    return steps.filter((s) => statusOf(s) === filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, filter, localStatuses])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)
  const hiddenCount = filtered.length - visible.length

  const liveCounts = useMemo(() => {
    // If anyone has changed a status locally, recompute counts so the chips
    // match what they're seeing.
    if (Object.keys(localStatuses).length === 0) {
      return {
        all: steps.length,
        needs_help: stepCounts.needs_help,
        in_progress: stepCounts.in_progress,
        defining: stepCounts.defining,
        open: stepCounts.open,
        completed: stepCounts.completed,
      }
    }
    const c = { needs_help: 0, in_progress: 0, defining: 0, open: 0, completed: 0 }
    for (const s of steps) {
      const k = statusOf(s)
      if (k in c) c[k as keyof typeof c] += 1
    }
    return { all: steps.length, ...c }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, stepCounts, localStatuses])

  const handleStatusChange = (stepId: string, next: StepStatusKey) => {
    setLocalStatuses((prev) => ({ ...prev, [stepId]: next }))
  }

  return (
    <>
      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap gap-3">
        <FilterChip
          active={filter === 'all'}
          label="All"
          count={liveCounts.all}
          onClick={() => setFilter('all')}
        />
        <FilterChip
          active={filter === 'needs_help'}
          label="Needs help"
          count={liveCounts.needs_help}
          onClick={() => setFilter('needs_help')}
        />
        <FilterChip
          active={filter === 'in_progress'}
          label="In progress"
          count={liveCounts.in_progress}
          onClick={() => setFilter('in_progress')}
        />
        <FilterChip
          active={filter === 'defining'}
          label="Being defined"
          count={liveCounts.defining}
          onClick={() => setFilter('defining')}
        />
        <FilterChip
          active={filter === 'open'}
          label="Open"
          count={liveCounts.open}
          onClick={() => setFilter('open')}
        />
        <FilterChip
          active={filter === 'completed'}
          label="Completed"
          count={liveCounts.completed}
          onClick={() => setFilter('completed')}
        />
      </div>

      {/* Step cards */}
      <div className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center text-sm text-fg-tertiary">
            No steps in this state.
          </div>
        ) : (
          visible.map((step) => (
            <StepCard
              key={step.id}
              projectId={projectId}
              step={step}
              status={statusOf(step)}
              isSignedIn={isSignedIn}
              isMember={isMember}
              isLead={isLead}
              onStatusChange={(next) => handleStatusChange(step.id, next)}
            />
          ))
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-700 bg-bg-surface px-5 py-5 text-sm text-fg-tertiary transition-colors hover:border-neutral-600 hover:text-fg-primary"
          >
            Show all {filtered.length} step{filtered.length === 1 ? '' : 's'}
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
  isSignedIn,
  isMember,
  isLead,
  onStatusChange,
}: {
  projectId: string
  step: StepCardData
  status: StepStatusKey
  isSignedIn: boolean
  isMember: boolean
  isLead: boolean
  onStatusChange: (next: StepStatusKey) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isNeedsHelp = status === 'needs_help'
  const isInProgress = status === 'in_progress'
  const isDone = status === 'completed'
  const isDefining = status === 'defining'
  const isOpen = status === 'open'

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
          'border-amber-500/40 bg-[radial-gradient(ellipse_at_left,rgba(244,165,53,0.08),transparent_60%),var(--color-bg-surface)]',
        isDone && 'border-white/[0.06] opacity-80 hover:opacity-100',
        !isNeedsHelp && !isDone && 'border-white/[0.08]',
      )}
    >
      {/* Head */}
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            Step {step.order} of {step.totalSteps}
            {step.estimatedHrs != null && <> · ~{step.estimatedHrs}h</>}
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
        <StatusPillButton
          projectId={projectId}
          stepId={step.id}
          status={status}
          isSignedIn={isSignedIn}
          isMember={isMember}
          onChange={onStatusChange}
        />
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
                No skills required
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
          step={step}
          isSignedIn={isSignedIn}
          isMember={isMember}
          isJoinable={isNeedsHelp || isOpen || isDefining || isInProgress}
          isInProgress={isInProgress}
          isDone={isDone}
          isDefining={isDefining}
          isOpen={isOpen}
          pending={pending}
          error={error}
          onJoin={join}
          onLeave={leave}
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
  // Local copy so the lead's coordinator change can be reflected
  // optimistically. The server round-trips on the next router.refresh().
  const [localJoiners, setLocalJoiners] = useState(joiners)
  useEffect(() => setLocalJoiners(joiners), [joiners])
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
    j.isCoordinator ? `${j.name} (coordinator)` : j.name,
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
          {coordinator.isMe ? 'You coordinate' : `${firstName(coordinator.name)} coordinates`}
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
        title="Change coordinator"
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
            Step coordinator
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
            No coordinator
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

/* ================================================================
   Status pill — visible button + popover menu
   ================================================================ */

function StatusPillButton({
  projectId,
  stepId,
  status,
  isSignedIn,
  isMember,
  onChange,
}: {
  projectId: string
  stepId: string
  status: StepStatusKey
  isSignedIn: boolean
  isMember: boolean
  onChange: (next: StepStatusKey) => void
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click outside / Esc to close.
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

  const canEdit = isSignedIn && isMember

  const pick = (next: StepStatusKey) => {
    setOpen(false)
    if (next === status) return
    const prev = status
    onChange(next) // optimistic
    startTransition(async () => {
      const result = await setStepStatusAction(projectId, stepId, next)
      if (!result.success) {
        // Rollback on failure.
        onChange(prev)
      }
    })
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => canEdit && setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!canEdit}
        className={cn(
          'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-all',
          STATUS_PILL_CLASSES[status],
          canEdit
            ? 'cursor-pointer hover:brightness-110'
            : 'cursor-default',
        )}
      >
        <StatusGlyph status={status} />
        {STATUS_LABEL[status]}
        {canEdit && (
          <ChevronDown
            className={cn(
              'size-3 opacity-60 transition-transform',
              open && 'rotate-180',
            )}
            strokeWidth={2.5}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 flex w-[260px] flex-col gap-0.5 rounded-xl border border-neutral-700 bg-bg-surface-2 p-1.5 shadow-lg"
        >
          {STATUS_ORDER.map((s, idx) => (
            <>
              {s === 'completed' && (
                <div key="sep" className="my-1 h-px bg-white/[0.08]" />
              )}
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => pick(s)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-fg-primary transition-colors hover:bg-bg-surface-3',
                  s === status && 'bg-amber-500/[0.06]',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    STATUS_PILL_CLASSES[s],
                  )}
                >
                  <StatusGlyph status={s} small />
                  {STATUS_LABEL[s]}
                </span>
                <span className="ml-1 text-xs text-fg-tertiary">
                  {STATUS_HINT[s]}
                </span>
                {s === status && (
                  <Check
                    className="ml-auto size-3.5 text-amber-500"
                    strokeWidth={2.5}
                  />
                )}
              </button>
              {idx === -1 ? null : null}
            </>
          ))}
          <div className="px-2 pb-1 pt-2 text-[11px] leading-snug text-fg-tertiary">
            Anyone in the project can change a step&apos;s state.
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Status visuals ─────────────────────────────────────────────── */

const STATUS_PILL_CLASSES: Record<StepStatusKey, string> = {
  open: 'border-white/[0.12] bg-bg-surface-2 text-fg-secondary',
  defining: 'border-blue-400/40 bg-blue-500/10 text-blue-200',
  in_progress: 'border-blue-400/50 bg-blue-500/[0.18] text-blue-200',
  needs_help:
    'border-amber-500/50 bg-amber-500/[0.14] text-amber-400 shadow-glow-amber',
  completed: 'border-green-500/40 bg-green-500/[0.14] text-green-300',
}

function StatusGlyph({
  status,
  small = false,
}: {
  status: StepStatusKey
  small?: boolean
}) {
  const sz = small ? 'size-3' : 'size-3.5'
  if (status === 'open') {
    return (
      <span
        className={cn(
          sz,
          'rounded-full border-[1.5px] border-current bg-transparent',
        )}
      />
    )
  }
  if (status === 'defining') {
    return (
      <span
        className={cn(
          sz,
          'relative rounded-full border-[1.5px] border-dashed border-blue-300',
        )}
      >
        <span className="absolute left-1/2 top-1/2 h-px w-2 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-blue-300" />
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span
        className={cn(
          sz,
          'relative inline-flex items-center justify-center rounded-full border-[1.5px] border-blue-400',
        )}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-blue-300" />
      </span>
    )
  }
  if (status === 'needs_help') {
    return (
      <span
        className={cn(
          sz,
          'inline-flex items-center justify-center rounded-full bg-amber-500 font-display text-[9px] font-bold leading-none text-amber-900 shadow-[0_0_6px_rgba(244,165,53,0.7)]',
        )}
      >
        !
      </span>
    )
  }
  // completed
  return (
    <span
      className={cn(
        sz,
        'inline-flex items-center justify-center rounded-full bg-green-500 text-blue-900',
      )}
    >
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

function StepAction({
  step,
  isSignedIn,
  isMember,
  isJoinable,
  isInProgress,
  isDone,
  isDefining,
  isOpen,
  pending,
  error,
  onJoin,
  onLeave,
}: {
  step: StepCardData
  isSignedIn: boolean
  isMember: boolean
  isJoinable: boolean
  isInProgress: boolean
  isDone: boolean
  isDefining: boolean
  isOpen: boolean
  pending: boolean
  error: string | null
  onJoin: () => void
  onLeave: () => void
}) {
  // I'm on the step.
  if (step.meOnStep) {
    return (
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-300">{error}</span>}
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-300">
          <Check className="size-3.5" strokeWidth={2.5} />
          You&apos;re on this
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={onLeave}
          className="cursor-pointer text-sm text-fg-tertiary underline-offset-2 transition-colors hover:text-fg-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Leaving…' : 'Leave step'}
        </button>
      </div>
    )
  }
  if (isDone) return <span className="text-sm text-fg-tertiary">Done</span>

  // Anyone who's not on it can join (steps are multi-joiner now).
  if (isJoinable) {
    if (!isSignedIn) {
      return (
        <a
          href="/sign-in"
          className="inline-flex items-center gap-1 text-sm font-medium text-fg-tertiary hover:text-fg-primary"
        >
          <LogIn className="size-3.5" />
          Sign in to join
        </a>
      )
    }
    if (!isMember) {
      return (
        <span className="text-sm text-fg-tertiary">Join project to join step</span>
      )
    }
    return (
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-300">{error}</span>}
        <button
          type="button"
          disabled={pending}
          onClick={onJoin}
          className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-amber-500 transition-colors hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? 'Joining…'
            : step.joiners.length === 0
              ? 'Join this step'
              : 'Join too'}
          {!pending && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
        </button>
      </div>
    )
  }

  if (isDefining) return <span className="text-sm text-fg-tertiary">Still being scoped</span>
  if (isOpen) return <span className="text-sm text-fg-tertiary">Coming up</span>
  if (isInProgress) return <span className="text-sm text-fg-tertiary">In progress</span>
  return null
}
