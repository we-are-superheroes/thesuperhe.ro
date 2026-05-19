'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  ArrowRight,
  FileText,
  ChevronLeft,
  Globe,
  MapPin,
  Settings as SettingsIcon,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  launchProjectAction,
  saveBlueprintAction,
  type CreateProjectInput,
} from '@/app/(platform)/projects/new/actions'
import {
  StepRow,
  AddStepButton,
  type FormStep,
  type SkillOption as SharedSkillOption,
} from '@/components/platform/project-form-bits'

/* ================================================================
   Types
   ================================================================ */

export interface BlueprintOption {
  id: string
  title: string
  description: string
  reuseCount: number
  stepCount: number
  projectTypeId: string | null
  projectTypeName: string | null
  emoji: string
  color: string
  steps: Array<{
    title: string
    description: string
    skillIds: string[]
    estimatedHrs: number | null
  }>
}

export type SkillOption = SharedSkillOption

const COUNTRIES = [
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

const REMOTE_OPTIONS: Array<{ value: 'yes' | 'some' | 'no'; label: string; icon: typeof Globe }> = [
  { value: 'yes', label: 'Yes, remote-friendly', icon: Globe },
  { value: 'some', label: 'Some steps only', icon: SettingsIcon },
  { value: 'no', label: 'No, in-person only', icon: MapPin },
]

const JOIN_POLICY_OPTIONS: Array<{
  value: 'open' | 'approval_required'
  label: string
  description: string
}> = [
  {
    value: 'open',
    label: 'Open to the world',
    description: 'Anyone can join instantly and start contributing.',
  },
  {
    value: 'approval_required',
    label: 'Approval needed',
    description: 'Joins land in your inbox as a request to accept or decline.',
  },
]

function blankSteps(): FormStep[] {
  return [
    { id: `s-${Date.now()}-1`, title: '', description: '', skillIds: [], estimatedHrs: null },
    { id: `s-${Date.now()}-2`, title: '', description: '', skillIds: [], estimatedHrs: null },
    { id: `s-${Date.now()}-3`, title: '', description: '', skillIds: [], estimatedHrs: null },
  ]
}

/* ================================================================
   Component
   ================================================================ */

export function CreateProjectForm({
  blueprints,
  skills,
}: {
  blueprints: BlueprintOption[]
  skills: SkillOption[]
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<'choose' | 'edit'>('choose')
  const [origin, setOrigin] = useState<
    { kind: 'scratch' } | { kind: 'blueprint'; blueprint: BlueprintOption } | null
  >(null)
  const [showBlueprints, setShowBlueprints] = useState(false)
  const [bpFilter, setBpFilter] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [remote, setRemote] = useState<'yes' | 'some' | 'no'>('yes')
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval_required'>('open')
  const [projectTypeId, setProjectTypeId] = useState<string | null>(null)
  const [steps, setSteps] = useState<FormStep[]>(blankSteps())

  const [error, setError] = useState<string | null>(null)
  const [pendingLaunch, startLaunch] = useTransition()
  const [pendingBlueprint, startBlueprintSave] = useTransition()
  const [savedBlueprintAt, setSavedBlueprintAt] = useState<Date | null>(null)

  const filteredBlueprints = useMemo(() => {
    const q = bpFilter.trim().toLowerCase()
    if (!q) return blueprints
    return blueprints.filter((b) =>
      `${b.title} ${b.description} ${b.projectTypeName ?? ''}`.toLowerCase().includes(q),
    )
  }, [blueprints, bpFilter])

  /* ── Phase transitions ───────────────────────────── */

  const startScratch = () => {
    setOrigin({ kind: 'scratch' })
    setTitle('')
    setDescription('')
    setCity('')
    setCountry(COUNTRIES[0])
    setRemote('yes')
    setJoinPolicy('open')
    setProjectTypeId(null)
    setSteps(blankSteps())
    setError(null)
    setPhase('edit')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const startFromBlueprint = (bp: BlueprintOption) => {
    setOrigin({ kind: 'blueprint', blueprint: bp })
    setTitle(`${bp.title} — your area`)
    setDescription(bp.description)
    setCity('')
    setCountry(COUNTRIES[0])
    setRemote('some')
    setJoinPolicy('open')
    setProjectTypeId(bp.projectTypeId)
    setSteps(
      bp.steps.length > 0
        ? bp.steps.map((s, i) => ({
            id: `s-${Date.now()}-${i}`,
            title: s.title,
            description: s.description,
            skillIds: s.skillIds,
            estimatedHrs: s.estimatedHrs,
          }))
        : blankSteps(),
    )
    setError(null)
    setPhase('edit')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const backToChoose = () => {
    setPhase('choose')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  /* ── Step ops ─────────────────────────────────────── */

  const updateStep = (id: string, patch: Partial<FormStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }
  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: `s-${Date.now()}-${prev.length}`,
        title: '',
        description: '',
        skillIds: [],
        estimatedHrs: null,
      },
    ])
  }

  /* ── Submit ───────────────────────────────────────── */

  const buildInput = (): CreateProjectInput => ({
    title,
    description,
    city,
    country,
    remote,
    joinPolicy,
    projectTypeId,
    blueprintId: origin?.kind === 'blueprint' ? origin.blueprint.id : null,
    steps: steps.map((s) => ({
      title: s.title,
      description: s.description,
      skillIds: s.skillIds,
      estimatedHrs: s.estimatedHrs,
    })),
  })

  const onLaunch = () => {
    setError(null)
    const input = buildInput()
    startLaunch(async () => {
      const result = await launchProjectAction(input)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/projects/${result.data.projectId}`)
    })
  }

  const onSaveBlueprint = () => {
    setError(null)
    const input = buildInput()
    startBlueprintSave(async () => {
      const result = await saveBlueprintAction(input)
      if (!result.success) {
        setError(result.error)
        return
      }
      setSavedBlueprintAt(new Date())
    })
  }

  const titleForPreview = title.trim() || 'Untitled project'

  /* ── Render ───────────────────────────────────────── */

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-bg-base px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <Link href="/my-projects" className="transition-colors duration-fast hover:text-fg-primary">
            My projects
          </Link>
          <span className="opacity-50">/</span>
          <span className="font-medium text-fg-primary">
            {phase === 'edit'
              ? origin?.kind === 'blueprint'
                ? 'New project (from blueprint)'
                : 'New project'
              : 'Start a project'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {phase === 'edit' ? (
            <button
              type="button"
              onClick={backToChoose}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
            >
              <ChevronLeft className="size-3.5" strokeWidth={2.5} />
              Change starting point
            </button>
          ) : (
            <Link
              href="/my-projects"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
            >
              Cancel
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 p-4 sm:p-6 sm:gap-10 lg:p-10">
        {phase === 'choose' ? (
          <ChooserPhase
            blueprints={filteredBlueprints}
            totalBlueprints={blueprints.length}
            showBlueprints={showBlueprints}
            setShowBlueprints={setShowBlueprints}
            bpFilter={bpFilter}
            setBpFilter={setBpFilter}
            onScratch={startScratch}
            onPickBlueprint={startFromBlueprint}
          />
        ) : (
          <EditorPhase
            origin={origin}
            title={title}
            description={description}
            city={city}
            country={country}
            remote={remote}
            joinPolicy={joinPolicy}
            steps={steps}
            skills={skills}
            error={error}
            pendingLaunch={pendingLaunch}
            pendingBlueprint={pendingBlueprint}
            savedBlueprintAt={savedBlueprintAt}
            titleForPreview={titleForPreview}
            setTitle={setTitle}
            setDescription={setDescription}
            setCity={setCity}
            setCountry={setCountry}
            setRemote={setRemote}
            setJoinPolicy={setJoinPolicy}
            updateStep={updateStep}
            removeStep={removeStep}
            addStep={addStep}
            onLaunch={onLaunch}
            onSaveBlueprint={onSaveBlueprint}
            onChangeOrigin={backToChoose}
          />
        )}
      </div>
    </div>
  )
}

/* ================================================================
   Phase 1 — Chooser
   ================================================================ */

function ChooserPhase({
  blueprints,
  totalBlueprints,
  showBlueprints,
  setShowBlueprints,
  bpFilter,
  setBpFilter,
  onScratch,
  onPickBlueprint,
}: {
  blueprints: BlueprintOption[]
  totalBlueprints: number
  showBlueprints: boolean
  setShowBlueprints: (v: boolean) => void
  bpFilter: string
  setBpFilter: (s: string) => void
  onScratch: () => void
  onPickBlueprint: (bp: BlueprintOption) => void
}) {
  return (
    <>
      <header>
        <h1 className="mb-3 font-display text-[clamp(36px,4vw,52px)] font-normal leading-none tracking-tight">
          Start a <em className="italic text-amber-500">project</em>.
        </h1>
        <p className="max-w-[600px] text-lg leading-relaxed text-fg-secondary">
          You can begin from a clean slate, or fork a blueprint — a proven plan from someone who’s done this before.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <StartCard
          icon={<Plus className="size-6" strokeWidth={2} />}
          title="Start from scratch."
          description="A blank canvas. Best when your project is unusual, hyper-local, or you’ve already mapped out the steps yourself."
          cta="Begin a fresh project"
          onClick={onScratch}
        />
        <StartCard
          icon={<FileText className="size-6" strokeWidth={2} />}
          title="Use a blueprint."
          description="Steal shamelessly. Pre-built plans for repair cafés, pocket forests, mutual aid groups and more — fork one and adapt it to your community."
          cta={
            totalBlueprints === 0
              ? 'No blueprints yet — start one'
              : `Browse ${totalBlueprints} blueprint${totalBlueprints === 1 ? '' : 's'}`
          }
          onClick={() => {
            if (totalBlueprints === 0) return
            setShowBlueprints(true)
            // Scroll into view next tick after render
            setTimeout(() => {
              document.getElementById('bp-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 50)
          }}
        />
      </div>

      {showBlueprints && (
        <section id="bp-picker">
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
              Blueprints
            </div>
            <h2 className="mb-2 font-display text-2xl font-normal leading-tight tracking-tight">
              Pick one to fork.
            </h2>
            <p className="text-sm leading-relaxed text-fg-secondary">
              You’ll be able to rename, edit steps, and adapt the location. Nothing’s set in stone.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface">
            <div className="relative border-b border-white/[0.08] bg-bg-surface-2 px-5 py-4">
              <Search className="absolute left-7 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
              <input
                type="text"
                value={bpFilter}
                onChange={(e) => setBpFilter(e.target.value)}
                placeholder="Search blueprints — repair, garden, school…"
                className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-9 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
              />
            </div>
            {blueprints.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-fg-tertiary">
                No blueprints match that search.
              </div>
            ) : (
              blueprints.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => onPickBlueprint(bp)}
                  className="group grid w-full grid-cols-[auto_1fr_auto_auto] cursor-pointer items-center gap-5 border-b border-white/[0.08] px-6 py-5 text-left transition-colors duration-fast last:border-b-0 hover:bg-bg-surface-2"
                >
                  <div
                    className="flex size-14 shrink-0 items-center justify-center rounded-xl font-display text-2xl text-blue-900"
                    style={{ background: bp.color }}
                  >
                    {bp.emoji}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-base font-semibold text-fg-primary">{bp.title}</span>
                    <span className="max-w-[460px] truncate text-xs text-fg-tertiary">
                      {bp.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-fg-tertiary">
                    <span className="rounded-full border border-white/[0.08] bg-bg-surface-3 px-2.5 py-[3px] text-fg-secondary">
                      {bp.stepCount} step{bp.stepCount === 1 ? '' : 's'}
                    </span>
                    <span>
                      {bp.reuseCount} fork{bp.reuseCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-medium text-amber-500 opacity-0 transition-opacity group-hover:opacity-100">
                    Fork
                    <ArrowRight className="size-3.5" strokeWidth={2.5} />
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </>
  )
}

function StartCard({
  icon,
  title,
  description,
  cta,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col items-start gap-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface p-6 text-left text-fg-primary transition-all duration-standard hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md sm:p-8"
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(244,165,53,0.08),transparent_60%)] opacity-0 transition-opacity duration-standard group-hover:opacity-100" />
      <span className="relative flex size-14 items-center justify-center rounded-xl border border-neutral-700 bg-bg-surface-2 text-amber-500">
        {icon}
      </span>
      <h3 className="relative font-display text-2xl font-normal leading-tight tracking-tight">{title}</h3>
      <p className="relative text-sm leading-relaxed text-fg-secondary">{description}</p>
      <span className="relative mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-amber-500">
        {cta}
        <ArrowRight className="size-3.5" strokeWidth={2.5} />
      </span>
    </button>
  )
}

/* ================================================================
   Phase 2 — Editor
   ================================================================ */

function EditorPhase({
  origin,
  title,
  description,
  city,
  country,
  remote,
  joinPolicy,
  steps,
  skills,
  error,
  pendingLaunch,
  pendingBlueprint,
  savedBlueprintAt,
  titleForPreview,
  setTitle,
  setDescription,
  setCity,
  setCountry,
  setRemote,
  setJoinPolicy,
  updateStep,
  removeStep,
  addStep,
  onLaunch,
  onSaveBlueprint,
  onChangeOrigin,
}: {
  origin: { kind: 'scratch' } | { kind: 'blueprint'; blueprint: BlueprintOption } | null
  title: string
  description: string
  city: string
  country: string
  remote: 'yes' | 'some' | 'no'
  joinPolicy: 'open' | 'approval_required'
  steps: FormStep[]
  skills: SkillOption[]
  error: string | null
  pendingLaunch: boolean
  pendingBlueprint: boolean
  savedBlueprintAt: Date | null
  titleForPreview: string
  setTitle: (v: string) => void
  setDescription: (v: string) => void
  setCity: (v: string) => void
  setCountry: (v: string) => void
  setRemote: (v: 'yes' | 'some' | 'no') => void
  setJoinPolicy: (v: 'open' | 'approval_required') => void
  updateStep: (id: string, patch: Partial<FormStep>) => void
  removeStep: (id: string) => void
  addStep: () => void
  onLaunch: () => void
  onSaveBlueprint: () => void
  onChangeOrigin: () => void
}) {
  return (
    <>
      {/* Editor header */}
      <header>
        <span className="mb-2 inline-flex items-center gap-2 text-xs text-fg-tertiary">
          {origin?.kind === 'blueprint' ? 'Forked from' : 'Starting from scratch'}
          {origin?.kind === 'blueprint' && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2.5 py-[3px] font-medium text-amber-500">
              {origin.blueprint.title} blueprint
            </span>
          )}
          <span className="opacity-60">·</span>
          <button
            type="button"
            onClick={onChangeOrigin}
            className="cursor-pointer text-xs text-fg-secondary underline underline-offset-2 hover:text-amber-500"
          >
            change
          </button>
        </span>
        <h1 className="font-display text-[clamp(28px,3vw,40px)] font-normal leading-tight tracking-tight">
          <em className="italic text-amber-500">{titleForPreview}</em>
        </h1>
      </header>

      {/* The basics */}
      <Card>
        <CardHead
          eyebrow="The basics"
          title="What is it?"
          desc="Two sentences are enough. You can flesh it out later."
        />
        <div className="flex flex-col gap-5">
          <Field label="Title" htmlFor="fld-title">
            <input
              id="fld-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pocket Forest, Hackney Wick"
              className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-4 py-3.5 font-display text-2xl leading-tight text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="fld-desc"
            help="The first paragraph is what shows up on the project card."
          >
            <textarea
              id="fld-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="What are you trying to make happen, and why does it matter?"
              className="min-h-[130px] w-full resize-y rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm leading-relaxed text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
            />
          </Field>
        </div>
      </Card>

      {/* Where */}
      <Card>
        <CardHead
          eyebrow="Where it happens"
          title="Location & access."
          desc="Helps the right people find you. You’ll only show the area, never an exact address."
        />
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="City or area" htmlFor="fld-city">
              <input
                id="fld-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Hackney, London"
                className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
              />
            </Field>
            <Field label="Country" htmlFor="fld-country">
              <select
                id="fld-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full appearance-none rounded-lg border border-neutral-700 bg-bg-surface-2 py-2.5 pl-3.5 pr-9 font-sans text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)] [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%238097B5%22_stroke-width=%222.5%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_14px_center] [background-repeat:no-repeat]"
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Can people contribute remotely?">
            <div
              role="radiogroup"
              aria-label="Remote participation"
              className="grid grid-cols-1 gap-0.5 rounded-lg border border-neutral-700 bg-bg-base p-1 sm:grid-cols-3"
            >
              {REMOTE_OPTIONS.map((opt) => {
                const Icon = opt.icon
                const checked = remote === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRemote(opt.value)}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-sm font-medium transition-all duration-fast',
                      checked
                        ? 'bg-amber-500/[0.16] text-amber-500 shadow-[inset_0_0_0_1px_rgba(244,165,53,0.4)]'
                        : 'text-fg-tertiary hover:text-fg-secondary',
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={2} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <span className="mt-1 text-xs text-fg-tertiary">
              If “some steps only”, you can mark each step as remote-okay later.
            </span>
          </Field>

          <Field label="Who can join?">
            <div
              role="radiogroup"
              aria-label="Join policy"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {JOIN_POLICY_OPTIONS.map((opt) => {
                const checked = joinPolicy === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setJoinPolicy(opt.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border bg-bg-base p-4 text-left transition-colors',
                      checked
                        ? 'border-amber-500/40 bg-amber-500/[0.06]'
                        : 'border-neutral-700 hover:border-neutral-600',
                    )}
                  >
                    <span
                      className={cn(
                        'text-sm font-medium',
                        checked ? 'text-amber-500' : 'text-fg-primary',
                      )}
                    >
                      {opt.label}
                    </span>
                    <span className="text-xs leading-relaxed text-fg-tertiary">
                      {opt.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      </Card>

      {/* Steps */}
      <Card>
        <CardHead
          eyebrow="The plan"
          title="Steps to make it real."
          desc="Break the work into chunks someone could pick up in an evening. You can always add more later — but a starter list of 3–8 helps people see how to help."
        />
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <StepRow
              key={s.id}
              index={i}
              step={s}
              skills={skills}
              onChange={(patch) => updateStep(s.id, patch)}
              onRemove={() => removeStep(s.id)}
              canRemove={steps.length > 1}
            />
          ))}
          <AddStepButton onClick={addStep} />
        </div>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-bg-base from-25% to-transparent px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 lg:py-6">
        <div className="flex items-center gap-3 text-xs text-fg-tertiary">
          {error ? (
            <span className="text-red-300">{error}</span>
          ) : savedBlueprintAt ? (
            <>
              <span className="size-[7px] rounded-full bg-green-500 shadow-[0_0_6px_var(--color-green-500)]" />
              Saved as blueprint — others can fork it now.
            </>
          ) : (
            <>
              <span className="size-[7px] animate-pulse rounded-full bg-amber-500 shadow-[0_0_8px_var(--color-amber-500)]" />
              Draft is in your browser
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSaveBlueprint}
            disabled={pendingBlueprint || pendingLaunch}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileText className="size-3.5" strokeWidth={2} />
            {pendingBlueprint ? 'Saving…' : 'Save as blueprint'}
          </button>
          <button
            type="button"
            onClick={onLaunch}
            disabled={pendingLaunch || pendingBlueprint}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {pendingLaunch ? 'Launching…' : 'Launch project'}
            {!pendingLaunch && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </>
  )
}

/* ================================================================
   Shared field helpers
   ================================================================ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6 lg:p-8">{children}</section>
  )
}

function CardHead({
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

function Field({
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
