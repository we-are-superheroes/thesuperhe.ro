'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
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
import { COUNTRIES as ISO_COUNTRIES, LANGUAGES as ISO_LANGUAGES } from '@/lib/locales'

/* ================================================================
   Types
   ================================================================ */

export interface BlueprintOption {
  id: string
  title: string
  description: string
  projectTypeId: string | null
  country: string | null
  language: string | null
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

function stepsFromBlueprint(bp: BlueprintOption | null): FormStep[] {
  if (!bp || bp.steps.length === 0) return blankSteps()
  return bp.steps.map((s, i) => ({
    id: `s-${Date.now()}-${i}`,
    title: s.title,
    description: s.description,
    skillIds: s.skillIds,
    estimatedHrs: s.estimatedHrs,
  }))
}

/* ================================================================
   Component
   ================================================================ */

export function CreateProjectForm({
  sourceBlueprint,
  variantIntent,
  variantParentId,
  skills,
}: {
  /** The blueprint the editor was opened from (via ?blueprint=), or null. */
  sourceBlueprint: BlueprintOption | null
  /** True when arriving via "Create variant" — defaults the blueprint-save
   *  split button to "Save as blueprint variant". */
  variantIntent: boolean
  /** Family root to parent a saved variant under (resolved server-side). */
  variantParentId: string | null
  skills: SkillOption[]
}) {
  const router = useRouter()

  // When deep-linked from a blueprint (?blueprint=<id>), seed the editor from
  // it on first render — no mount effect, no flash of the chooser.
  const [phase, setPhase] = useState<'choose' | 'edit'>(
    sourceBlueprint ? 'edit' : 'choose',
  )
  const [origin, setOrigin] = useState<
    { kind: 'scratch' } | { kind: 'blueprint'; blueprint: BlueprintOption } | null
  >(sourceBlueprint ? { kind: 'blueprint', blueprint: sourceBlueprint } : null)

  const [title, setTitle] = useState(
    sourceBlueprint ? `${sourceBlueprint.title} — your area` : '',
  )
  const [description, setDescription] = useState(sourceBlueprint?.description ?? '')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [address, setAddress] = useState('')
  const [coordinates, setCoordinates] = useState('')
  // Inherit the blueprint's locale so a forked project / variant lands in the
  // same filter buckets by default; the user can override before saving.
  const [countryCode, setCountryCode] = useState<string | null>(
    sourceBlueprint?.country ?? null,
  )
  const [languageCode, setLanguageCode] = useState<string | null>(
    sourceBlueprint?.language ?? null,
  )
  const [remote, setRemote] = useState<'yes' | 'some' | 'no'>(
    sourceBlueprint ? 'some' : 'yes',
  )
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval_required'>('open')
  const [projectTypeId, setProjectTypeId] = useState<string | null>(
    sourceBlueprint?.projectTypeId ?? null,
  )
  const [steps, setSteps] = useState<FormStep[]>(() => stepsFromBlueprint(sourceBlueprint))

  const [error, setError] = useState<string | null>(null)
  const [pendingLaunch, startLaunch] = useTransition()
  const [pendingBlueprint, startBlueprintSave] = useTransition()
  const [savedBlueprintAt, setSavedBlueprintAt] = useState<'variant' | 'new' | null>(null)

  /* ── Phase transitions ───────────────────────────── */

  const startScratch = () => {
    setOrigin({ kind: 'scratch' })
    setTitle('')
    setDescription('')
    setCity('')
    setCountry(COUNTRIES[0])
    setAddress('')
    setCoordinates('')
    setCountryCode(null)
    setLanguageCode(null)
    setRemote('yes')
    setJoinPolicy('open')
    setProjectTypeId(null)
    setSteps(blankSteps())
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

  const buildInput = (parentBlueprintId: string | null): CreateProjectInput => ({
    title,
    description,
    city,
    country,
    address,
    coordinates,
    countryCode,
    languageCode,
    remote,
    joinPolicy,
    projectTypeId,
    parentBlueprintId,
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
    const input = buildInput(null)
    startLaunch(async () => {
      const result = await launchProjectAction(input)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/projects/${result.data.projectId}`)
    })
  }

  // asVariant → save as a child of the family root; otherwise a standalone
  // root blueprint.
  const onSaveBlueprint = (asVariant: boolean) => {
    setError(null)
    const input = buildInput(asVariant ? variantParentId : null)
    startBlueprintSave(async () => {
      const result = await saveBlueprintAction(input)
      if (!result.success) {
        setError(result.error)
        return
      }
      setSavedBlueprintAt(asVariant ? 'variant' : 'new')
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
          <ChooserPhase onScratch={startScratch} />
        ) : (
          <EditorPhase
            origin={origin}
            variantIntent={variantIntent}
            hasSource={!!origin && origin.kind === 'blueprint'}
            variantAvailable={variantParentId != null}
            title={title}
            description={description}
            city={city}
            country={country}
            address={address}
            coordinates={coordinates}
            countryCode={countryCode}
            languageCode={languageCode}
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
            setAddress={setAddress}
            setCoordinates={setCoordinates}
            setCountryCode={setCountryCode}
            setLanguageCode={setLanguageCode}
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

function ChooserPhase({ onScratch }: { onScratch: () => void }) {
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
          description="Steal shamelessly. Pre-built plans for repair cafés, pocket forests, mutual aid groups and more — browse the library, then fork one and adapt it to your community."
          cta="Browse blueprints"
          href="/blueprints"
        />
      </div>
    </>
  )
}

function StartCard({
  icon,
  title,
  description,
  cta,
  onClick,
  href,
}: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  onClick?: () => void
  href?: string
}) {
  const className =
    'group relative flex cursor-pointer flex-col items-start gap-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface p-6 text-left text-fg-primary transition-all duration-standard hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md sm:p-8'
  const inner = (
    <>
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
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}

/* ================================================================
   Save-as-blueprint control.
   - From scratch: a plain "Save as blueprint" button.
   - From a blueprint: a split button. The primary action defaults to
     "Save as blueprint variant" when arriving via "Create variant",
     otherwise "Save as new blueprint"; the alternative lives in the
     dropdown.
   ================================================================ */

function SaveBlueprintButton({
  hasSource,
  variantAvailable,
  defaultVariant,
  pending,
  disabled,
  onSave,
}: {
  hasSource: boolean
  variantAvailable: boolean
  defaultVariant: boolean
  pending: boolean
  disabled: boolean
  onSave: (asVariant: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const labelFor = (variant: boolean) =>
    variant ? 'Save as blueprint variant' : 'Save as new blueprint'

  const outlineBtn =
    'inline-flex items-center gap-2 border border-neutral-700 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60'

  // No source blueprint → a single standalone save.
  if (!hasSource || !variantAvailable) {
    return (
      <button
        type="button"
        onClick={() => onSave(false)}
        disabled={disabled}
        className={cn(outlineBtn, 'rounded-lg px-4 py-2.5')}
      >
        <FileText className="size-3.5" strokeWidth={2} />
        {pending ? 'Saving…' : 'Save as blueprint'}
      </button>
    )
  }

  const primary = defaultVariant
  const alternativeIsVariant = !primary

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        onClick={() => onSave(primary)}
        disabled={disabled}
        className={cn(outlineBtn, 'rounded-l-lg px-4 py-2.5')}
      >
        <FileText className="size-3.5" strokeWidth={2} />
        {pending ? 'Saving…' : labelFor(primary)}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More save options"
        className={cn(outlineBtn, '-ml-px rounded-r-lg px-2 py-2.5')}
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-2 w-[240px] overflow-hidden rounded-xl border border-neutral-700 bg-bg-surface shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSave(alternativeIsVariant)
            }}
            disabled={disabled}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
          >
            <FileText className="size-3.5 shrink-0" strokeWidth={2} />
            {labelFor(alternativeIsVariant)}
          </button>
        </div>
      )}
    </div>
  )
}

/* ================================================================
   Phase 2 — Editor
   ================================================================ */

function EditorPhase({
  origin,
  variantIntent,
  hasSource,
  variantAvailable,
  title,
  description,
  city,
  country,
  address,
  coordinates,
  countryCode,
  languageCode,
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
  setAddress,
  setCoordinates,
  setCountryCode,
  setLanguageCode,
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
  variantIntent: boolean
  hasSource: boolean
  variantAvailable: boolean
  title: string
  description: string
  city: string
  country: string
  address: string
  coordinates: string
  countryCode: string | null
  languageCode: string | null
  remote: 'yes' | 'some' | 'no'
  joinPolicy: 'open' | 'approval_required'
  steps: FormStep[]
  skills: SkillOption[]
  error: string | null
  pendingLaunch: boolean
  pendingBlueprint: boolean
  savedBlueprintAt: 'variant' | 'new' | null
  titleForPreview: string
  setTitle: (v: string) => void
  setDescription: (v: string) => void
  setCity: (v: string) => void
  setCountry: (v: string) => void
  setAddress: (v: string) => void
  setCoordinates: (v: string) => void
  setCountryCode: (v: string | null) => void
  setLanguageCode: (v: string | null) => void
  setRemote: (v: 'yes' | 'some' | 'no') => void
  setJoinPolicy: (v: 'open' | 'approval_required') => void
  updateStep: (id: string, patch: Partial<FormStep>) => void
  removeStep: (id: string) => void
  addStep: () => void
  onLaunch: () => void
  onSaveBlueprint: (asVariant: boolean) => void
  onChangeOrigin: () => void
}) {
  return (
    <>
      {/* Editor header */}
      <header>
        <span className="mb-2 inline-flex items-center gap-2 text-xs text-fg-tertiary">
          {origin?.kind === 'blueprint'
            ? variantIntent
              ? 'Creating a variant of'
              : 'Forked from'
            : 'Starting from scratch'}
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

          <Field
            label="Specific address or place name (optional)"
            htmlFor="fld-address"
            help="Shown to people who join. Skip this if your meet-up spot changes or you’d rather not publish it."
          >
            <input
              id="fld-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. The Old Library, 2 Wallis Road, E9 5LH"
              maxLength={500}
              className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
            />
          </Field>

          <Field
            label="Coordinates (optional)"
            htmlFor="fld-coords"
            help="Paste a “lat, lng” pair (e.g. from a Google Maps share). Pins the project on the map when people open it in Google Maps."
          >
            <input
              id="fld-coords"
              type="text"
              inputMode="decimal"
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              placeholder="e.g. 51.5424, -0.0244"
              className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-mono text-sm tabular-nums text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Country tag (optional)"
              htmlFor="fld-country-code"
              help="Used by the browse-page country filter."
            >
              <select
                id="fld-country-code"
                value={countryCode ?? ''}
                onChange={(e) => setCountryCode(e.target.value || null)}
                className="w-full appearance-none rounded-lg border border-neutral-700 bg-bg-surface-2 py-2.5 pl-3.5 pr-9 font-sans text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)] [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%238097B5%22_stroke-width=%222.5%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_14px_center] [background-repeat:no-repeat]"
              >
                <option value="">— none —</option>
                {ISO_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag ? `${c.flag} ` : ''}
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Working language (optional)"
              htmlFor="fld-lang"
              help="Used by the browse-page language filter."
            >
              <select
                id="fld-lang"
                value={languageCode ?? ''}
                onChange={(e) => setLanguageCode(e.target.value || null)}
                className="w-full appearance-none rounded-lg border border-neutral-700 bg-bg-surface-2 py-2.5 pl-3.5 pr-9 font-sans text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)] [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%238097B5%22_stroke-width=%222.5%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_14px_center] [background-repeat:no-repeat]"
              >
                <option value="">— none —</option>
                {ISO_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
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
              {savedBlueprintAt === 'variant'
                ? 'Saved as a blueprint variant — it now shows under the family.'
                : 'Saved as a blueprint — others can fork it now.'}
            </>
          ) : (
            <>
              <span className="size-[7px] animate-pulse rounded-full bg-amber-500 shadow-[0_0_8px_var(--color-amber-500)]" />
              Draft is in your browser
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SaveBlueprintButton
            hasSource={hasSource}
            variantAvailable={variantAvailable}
            defaultVariant={variantIntent && variantAvailable}
            pending={pendingBlueprint}
            disabled={pendingBlueprint || pendingLaunch}
            onSave={onSaveBlueprint}
          />
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
