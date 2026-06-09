'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, X, ChevronDown, Globe, MapPin, Pencil, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COUNTRIES, countryFlag, countryLabel } from '@/lib/locales'

/* ================================================================
   Shared types + constants for the create / edit project forms
   ================================================================ */

export interface FormStep {
  id: string // DB id for existing steps, or a temp id like `tmp-…` for new ones
  title: string
  description: string
  /** Multiple skills allowed; backend uses the StepSkill junction table. */
  skillIds: string[]
  /** Optional estimate of total work to deliver the step, in hours. */
  estimatedHrs: number | null
}

export interface SkillOption {
  id: string
  name: string
  category: string
}

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

export function Card({
  id,
  children,
}: {
  id?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6 lg:p-8"
    >
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
   CountrySelect — searchable single-select over the full ISO country
   list. One field both builds the "City, Country" display string and
   powers the browse-page country filter.
   ================================================================ */

export function CountrySelect({
  id,
  value,
  onChange,
  placeholder = 'Not set',
}: {
  id?: string
  value: string | null
  onChange: (code: string | null) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    return COUNTRIES.filter(
      (c) => c.label.toLowerCase().includes(q) || c.code.toLowerCase().startsWith(q),
    )
  }, [query])

  const pick = (code: string | null) => {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-left text-sm text-fg-primary transition-colors focus:border-amber-500 focus:outline-none"
      >
        {value ? (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden>{countryFlag(value)}</span>
            <span className="truncate">{countryLabel(value) ?? value}</span>
          </span>
        ) : (
          <span className="text-fg-tertiary">{placeholder}</span>
        )}
        <ChevronDown
          className={cn('ml-auto size-3.5 shrink-0 text-fg-tertiary transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-white/[0.08] bg-bg-surface shadow-xl">
          <div className="border-b border-white/[0.08] p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries…"
              autoFocus
              className="w-full rounded-md border border-neutral-700 bg-bg-surface-2 px-2.5 py-1.5 text-xs text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
            />
          </div>
          <div role="listbox" className="max-h-[260px] overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => pick(null)}
              className="flex w-full items-center px-3 py-2 text-left text-xs text-fg-tertiary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
            >
              — Not set —
            </button>
            {matches.map((c) => (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={value === c.code}
                onClick={() => pick(c.code)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-bg-surface-2 hover:text-fg-primary',
                  value === c.code ? 'text-amber-500' : 'text-fg-secondary',
                )}
              >
                <span aria-hidden>{countryFlag(c.code)}</span>
                <span className="truncate">{c.label}</span>
                <span className="ml-auto text-[10px] text-fg-tertiary">{c.code}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-fg-tertiary">No matches.</div>
            )}
          </div>
        </div>
      )}
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

  const skillById = useMemo(
    () => new Map(skills.map((s) => [s.id, s])),
    [skills],
  )
  const selectedSkills = step.skillIds
    .map((id) => skillById.get(id))
    .filter((s): s is SkillOption => !!s)

  const matches = useMemo(() => {
    const selectedSet = new Set(step.skillIds)
    const pool = skills.filter((s) => !selectedSet.has(s.id))
    if (!skillQuery.trim()) return pool.slice(0, 10)
    const q = skillQuery.trim().toLowerCase()
    return pool
      .filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .slice(0, 10)
  }, [skills, skillQuery, step.skillIds])

  const toggleSkill = (id: string) => {
    if (step.skillIds.includes(id)) {
      onChange({ skillIds: step.skillIds.filter((sid) => sid !== id) })
    } else {
      onChange({ skillIds: [...step.skillIds, id] })
    }
  }

  const updateHours = (raw: string) => {
    if (raw === '') {
      onChange({ estimatedHrs: null })
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return
    // Snap to whole hours — DB column is Int.
    onChange({ estimatedHrs: Math.max(0, Math.round(n)) })
  }

  return (
    <div className="group grid grid-cols-[28px_1fr_32px] items-start gap-3 rounded-xl border border-white/[0.08] bg-bg-base p-4 transition-colors duration-fast hover:border-neutral-700 focus-within:border-amber-500">
      <div className="col-start-1 row-start-1 mt-1 flex size-7 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-3 font-mono text-xs font-semibold text-fg-secondary">
        {index + 1}
      </div>
      <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-2.5">
        {/* The pencil signals that prefilled (blueprint) step text is
            editable — placeholders only cover the empty case. */}
        <div className="relative">
          <input
            type="text"
            value={step.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Step title — click to modify"
            className="w-full border-none bg-transparent py-1 pr-7 font-sans text-base font-medium text-fg-primary outline-none placeholder:text-fg-tertiary"
          />
          <Pencil className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-0" />
        </div>
        <textarea
          ref={descRef}
          value={step.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={1}
          placeholder="Optional details — click to add"
          className="min-h-[22px] w-full resize-none border-none bg-transparent p-0 font-sans text-sm leading-relaxed text-fg-secondary outline-none placeholder:text-fg-tertiary"
        />

        {/* Skills + hours row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
          {/* Selected skill chips */}
          {selectedSkills.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/[0.10] px-2.5 py-1 text-xs text-amber-500"
            >
              {s.name}
              <button
                type="button"
                onClick={() => toggleSkill(s.id)}
                title="Remove skill"
                className="-mr-0.5 flex size-4 items-center justify-center rounded-full text-amber-500/80 transition-colors hover:bg-amber-500/[0.15] hover:text-amber-500"
              >
                <X className="size-2.5" strokeWidth={2.5} />
              </button>
            </span>
          ))}

          {/* Add-skill button + popover */}
          <div ref={skillRef} className="relative">
            <button
              type="button"
              onClick={() => setSkillOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-700 bg-transparent px-2.5 py-1 text-xs text-fg-tertiary transition-colors hover:border-amber-500 hover:border-solid hover:text-amber-500 focus:border-amber-500 focus:outline-none"
            >
              <Plus className="size-3" strokeWidth={2.5} />
              {selectedSkills.length === 0 ? 'Add skill' : 'Add another'}
              <ChevronDown
                className={cn('size-3 transition-transform', skillOpen && 'rotate-180')}
              />
            </button>
            {skillOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-[280px] overflow-hidden rounded-lg border border-white/[0.08] bg-bg-surface shadow-xl">
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
                  {matches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        toggleSkill(s.id)
                        setSkillQuery('')
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-fg-secondary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="text-[10px] text-fg-tertiary">{s.category}</span>
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <div className="px-3 py-3 text-center text-xs text-fg-tertiary">
                      {step.skillIds.length === skills.length
                        ? 'All skills added.'
                        : 'No matches.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Estimated hours */}
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-surface-2 pl-3 pr-2 text-xs text-fg-tertiary">
            <span>Est.</span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={step.estimatedHrs ?? ''}
              onChange={(e) => updateHours(e.target.value)}
              placeholder="—"
              aria-label="Estimated hours"
              className="w-12 border-none bg-transparent py-1 text-right text-xs tabular-nums text-fg-primary outline-none placeholder:text-fg-tertiary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span>h</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        title="Remove step"
        className="col-start-3 row-start-1 mt-1 flex size-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-fg-tertiary transition-colors hover:bg-red-500/[0.12] hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-tertiary"
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
