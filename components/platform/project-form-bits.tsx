'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, X, ChevronDown, Globe, MapPin, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ================================================================
   Shared types + constants for the create / edit project forms
   ================================================================ */

export interface FormStep {
  id: string // DB id for existing steps, or a temp id like `tmp-…` for new ones
  title: string
  description: string
  skillId: string | null
}

export interface SkillOption {
  id: string
  name: string
  category: string
}

export const COUNTRIES = [
  'United Kingdom',
  'Switzerland',
  'Portugal',
  'Spain',
  'France',
  'Germany',
  'Netherlands',
  'Ireland',
  'United States',
  'Canada',
  'Other / multi-country',
]

export const REMOTE_OPTIONS: Array<{
  value: 'yes' | 'some' | 'no'
  label: string
  icon: typeof Globe
}> = [
  { value: 'yes', label: 'Yes, remote-friendly', icon: Globe },
  { value: 'some', label: 'Some steps only', icon: SettingsIcon },
  { value: 'no', label: 'No, in-person only', icon: MapPin },
]

/* ================================================================
   Card / CardHead / Field helpers
   ================================================================ */

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6 lg:p-8">
      {children}
    </section>
  )
}

export function CardHead({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string
  title: string
  desc?: string
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
        {eyebrow}
      </div>
      <h2 className="font-display text-2xl font-normal leading-tight tracking-tight">{title}</h2>
      {desc && <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{desc}</p>}
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string
  htmlFor?: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg-primary">
        {label}
      </label>
      {children}
      {help && <span className="mt-0.5 text-xs text-fg-tertiary">{help}</span>}
    </div>
  )
}

/* ================================================================
   StepRow — used in both create and edit forms
   ================================================================ */

export function StepRow({
  index,
  step,
  skills,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number
  step: FormStep
  skills: SkillOption[]
  onChange: (patch: Partial<FormStep>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [skillOpen, setSkillOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const skillRef = useRef<HTMLDivElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow description
  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto'
      descRef.current.style.height = descRef.current.scrollHeight + 'px'
    }
  }, [step.description])

  // Close skill picker on outside click
  useEffect(() => {
    if (!skillOpen) return
    const onDown = (e: MouseEvent) => {
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) {
        setSkillOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [skillOpen])

  const matches = useMemo(() => {
    if (!skillQuery.trim()) return skills.slice(0, 10)
    const q = skillQuery.trim().toLowerCase()
    return skills
      .filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .slice(0, 10)
  }, [skills, skillQuery])

  const selectedSkill = step.skillId ? skills.find((s) => s.id === step.skillId) : null

  return (
    <div className="grid grid-cols-[28px_1fr_32px] items-start gap-3 rounded-xl border border-white/[0.08] bg-bg-base p-4 transition-colors duration-fast hover:border-neutral-700 focus-within:border-amber-500 sm:grid-cols-[28px_1fr_200px_32px]">
      <div className="col-start-1 row-start-1 mt-1 flex size-7 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-3 font-mono text-xs font-semibold text-fg-secondary">
        {index + 1}
      </div>
      <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1.5">
        <input
          type="text"
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Step title — e.g. Find a viable plot"
          className="w-full border-none bg-transparent py-1 font-sans text-base font-medium text-fg-primary outline-none placeholder:text-fg-tertiary"
        />
        <textarea
          ref={descRef}
          value={step.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={1}
          placeholder='Optional detail — what does "done" look like?'
          className="min-h-[22px] w-full resize-none border-none bg-transparent p-0 font-sans text-sm leading-relaxed text-fg-secondary outline-none placeholder:text-fg-tertiary"
        />
      </div>

      {/* Skill picker — wraps below on mobile */}
      <div ref={skillRef} className="relative col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">
        <button
          type="button"
          onClick={() => setSkillOpen((o) => !o)}
          className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-bg-surface-2 px-3 py-2 text-xs text-fg-secondary transition-colors hover:border-neutral-600 focus:border-amber-500 focus:outline-none"
        >
          <span className="truncate">
            {selectedSkill ? selectedSkill.name : '(no specific skill)'}
          </span>
          <ChevronDown
            className={cn('size-3 shrink-0 transition-transform', skillOpen && 'rotate-180')}
          />
        </button>
        {skillOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-[260px] overflow-hidden rounded-lg border border-white/[0.08] bg-bg-surface shadow-xl">
            <div className="border-b border-white/[0.08] p-2">
              <input
                type="text"
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                placeholder="Search skills…"
                autoFocus
                className="w-full rounded-md border border-neutral-700 bg-bg-surface-2 px-2.5 py-1.5 text-xs text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  onChange({ skillId: null })
                  setSkillOpen(false)
                  setSkillQuery('')
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors',
                  step.skillId === null
                    ? 'bg-amber-500/[0.12] text-amber-500'
                    : 'text-fg-secondary hover:bg-bg-surface-2 hover:text-fg-primary',
                )}
              >
                (no specific skill)
              </button>
              {matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChange({ skillId: s.id })
                    setSkillOpen(false)
                    setSkillQuery('')
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors',
                    step.skillId === s.id
                      ? 'bg-amber-500/[0.12] text-amber-500'
                      : 'text-fg-secondary hover:bg-bg-surface-2 hover:text-fg-primary',
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="text-[10px] text-fg-tertiary">{s.category}</span>
                </button>
              ))}
              {matches.length === 0 && (
                <div className="px-3 py-3 text-center text-xs text-fg-tertiary">No matches.</div>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        title="Remove step"
        className="col-start-3 row-start-1 mt-1 flex size-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-fg-tertiary transition-colors hover:bg-red-500/[0.12] hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-tertiary sm:col-start-4"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-neutral-700 bg-transparent px-4 py-4 text-sm font-medium text-fg-tertiary transition-all duration-fast hover:border-amber-500 hover:text-amber-500"
    >
      <Plus className="size-3.5" strokeWidth={2.5} />
      Add a step
    </button>
  )
}
