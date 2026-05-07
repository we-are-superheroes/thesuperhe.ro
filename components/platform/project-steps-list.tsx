'use client'

import { useState, useMemo } from 'react'
import { Clock, ArrowRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StepCardData {
  id: string
  title: string
  description: string | null
  status: string
  order: number
  totalSteps: number
  estimatedHrs: number | null
  assignedToName: string | null
  skills: string[]
}

type FilterKey = 'all' | 'needs_help' | 'in_progress' | 'done'

const INITIAL_VISIBLE = 7

export function ProjectStepsList({
  steps,
  stepCounts,
}: {
  steps: StepCardData[]
  stepCounts: { needs_help: number; in_progress: number; done: number; not_started: number }
}) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return steps
    if (filter === 'done') return steps.filter((s) => s.status === 'done')
    return steps.filter((s) => s.status === filter)
  }, [steps, filter])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)
  const hiddenCount = filtered.length - visible.length

  return (
    <>
      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap gap-3">
        <FilterChip
          active={filter === 'all'}
          label="All"
          count={steps.length}
          onClick={() => setFilter('all')}
        />
        <FilterChip
          active={filter === 'needs_help'}
          label="Needs help"
          count={stepCounts.needs_help}
          onClick={() => setFilter('needs_help')}
        />
        <FilterChip
          active={filter === 'in_progress'}
          label="In progress"
          count={stepCounts.in_progress}
          onClick={() => setFilter('in_progress')}
        />
        <FilterChip
          active={filter === 'done'}
          label="Complete"
          count={stepCounts.done}
          onClick={() => setFilter('done')}
        />
      </div>

      {/* Step cards */}
      <div className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center text-sm text-fg-tertiary">
            No steps in this category.
          </div>
        ) : (
          visible.map((step) => <StepCard key={step.id} step={step} />)
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
   Sub-components
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

function StepCard({ step }: { step: StepCardData }) {
  const isNeedsHelp = step.status === 'needs_help'
  const isInProgress = step.status === 'in_progress'
  const isDone = step.status === 'done'
  const isNotStarted = step.status === 'not_started'
  const isSkipped = step.status === 'skipped'

  const statusLabel = (() => {
    if (isNeedsHelp) return 'Needs help'
    if (isInProgress) return 'In progress'
    if (isDone) return 'Complete'
    if (isSkipped) return 'Skipped'
    return 'Upcoming'
  })()

  return (
    <a
      href="#"
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-2xl border bg-bg-surface px-6 py-5 transition-all duration-standard hover:-translate-y-px hover:border-neutral-600',
        isNeedsHelp
          ? 'border-amber-500/40 bg-[radial-gradient(ellipse_at_left,rgba(244,165,53,0.08),transparent_60%),var(--color-bg-surface)]'
          : 'border-white/[0.08]',
      )}
    >
      {/* Head */}
      <div className="flex items-center gap-4">
        <StepStatusDot status={step.status} />
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            Step {step.order} of {step.totalSteps} · {statusLabel}
          </span>
          <span className="font-display text-xl leading-tight">{step.title}</span>
        </div>
        {step.estimatedHrs != null && !isDone && (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-fg-tertiary">
            <Clock className="size-3.5" />~{step.estimatedHrs}h
            {step.assignedToName && isInProgress && ` · ${step.assignedToName} is on it`}
          </span>
        )}
      </div>

      {/* Description (only for active/needing-help/upcoming) */}
      {step.description && !isDone && (
        <p className="pl-10 text-sm leading-relaxed text-fg-secondary">{step.description}</p>
      )}

      {/* Foot */}
      <div className="flex flex-wrap items-center justify-between gap-3 pl-10">
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
        {isNeedsHelp && !step.assignedToName && (
          <span className="flex items-center gap-1 text-sm font-medium text-amber-500">
            Claim this step
            <ArrowRight className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
        {isInProgress && step.assignedToName && (
          <span className="text-sm text-fg-tertiary">{step.assignedToName} is on this</span>
        )}
        {isDone && <span className="text-sm text-fg-tertiary">Done</span>}
        {isNotStarted && <span className="text-sm text-fg-tertiary">Coming up</span>}
        {isSkipped && <span className="text-sm text-fg-tertiary">Skipped</span>}
      </div>
    </a>
  )
}

function StepStatusDot({ status }: { status: string }) {
  if (status === 'needs_help') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full border-[1.5px] border-amber-500 bg-amber-500/[0.18] shadow-[0_0_8px_rgba(244,165,53,0.4)]">
        <span className="font-display text-[13px] font-bold text-amber-500">!</span>
      </div>
    )
  }
  if (status === 'in_progress') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full border-[1.5px] border-blue-500 bg-blue-500/15">
        <span className="size-2 rounded-full bg-blue-300" />
      </div>
    )
  }
  if (status === 'done') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full border-[1.5px] border-green-500 bg-green-500 text-blue-900">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    )
  }
  // not_started or skipped
  return <div className="size-6 rounded-full border-[1.5px] border-neutral-600 bg-transparent" />
}
