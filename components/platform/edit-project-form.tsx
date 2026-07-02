'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowRight, FileText, ChevronLeft, Upload, ImageIcon } from 'lucide-react'
import type { ProjectStatus } from '@prisma/client'
import { cn } from '@/lib/utils'
import {
  updateProjectAction,
  uploadProjectCoverAction,
  clearProjectCoverAction,
} from '@/app/(platform)/projects/[id]/edit/actions'
import { saveBlueprintAction } from '@/app/(platform)/projects/new/actions'
import {
  Card,
  CardHead,
  Field,
  StepRow,
  AddStepButton,
  CountrySelect,
  REMOTE_OPTIONS,
  type FormStep,
  type SkillOption,
} from '@/components/platform/project-form-bits'
import { LANGUAGES as ISO_LANGUAGES } from '@/lib/locales'

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

/* ================================================================
   Types
   ================================================================ */

export interface EditProjectInitial {
  id: string
  title: string
  description: string
  city: string
  remote: 'yes' | 'some' | 'no'
  /** Optional precise street address or place name. */
  address: string
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: string | null
  /** ISO 639-1 language code. */
  languageCode: string | null
  coverImageUrl: string | null
  joinPolicy: 'open' | 'approval_required'
  status: ProjectStatus
  steps: Array<{
    id: string
    title: string
    description: string
    skillIds: string[]
    estimatedHrs: number | null
  }>
}

const STATUS_OPTIONS: Array<{
  value: ProjectStatus
  label: string
  description: string
}> = [
  {
    value: 'defining',
    label: 'Being defined',
    description:
      'Still working out the plan. Not ready for contributors yet — people can follow along, but there’s nothing to do.',
  },
  {
    value: 'needs_help',
    label: 'Needs help',
    description:
      'You need more people. Pushes the project to the top of skill matches and the home page.',
  },
  {
    value: 'in_progress',
    label: 'In progress',
    description:
      'Work is happening and the team is mostly set. The normal state for most live projects.',
  },
  {
    value: 'completed',
    label: 'Completed',
    description:
      'The work is done. Moves to the “Finished” tab. You can reopen the project at any time.',
  },
]

const TOC_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'sec-status', label: 'Status' },
  { id: 'sec-basics', label: 'Basics' },
  { id: 'sec-cover', label: 'Cover' },
  { id: 'sec-location', label: 'Location & access' },
  { id: 'sec-steps', label: 'Steps' },
]

/* ================================================================
   Component
   ================================================================ */

export function EditProjectForm({
  initial,
  skills,
}: {
  initial: EditProjectInitial
  skills: SkillOption[]
}) {
  const router = useRouter()

  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [city, setCity] = useState(initial.city)
  const [remote, setRemote] = useState<'yes' | 'some' | 'no'>(initial.remote)
  const [address, setAddress] = useState(initial.address)
  const [countryCode, setCountryCode] = useState<string | null>(initial.countryCode)
  const [languageCode, setLanguageCode] = useState<string | null>(initial.languageCode)
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval_required'>(initial.joinPolicy)
  const [status, setStatus] = useState<ProjectStatus>(initial.status)
  const [activeSection, setActiveSection] = useState<string>(TOC_SECTIONS[0].id)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initial.coverImageUrl)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const [pendingCover, startCoverTransition] = useTransition()
  const [steps, setSteps] = useState<FormStep[]>(
    initial.steps.length > 0
      ? initial.steps.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          skillIds: s.skillIds,
          estimatedHrs: s.estimatedHrs,
        }))
      : [
          {
            // Stable placeholder id — only one blank row can exist at mount,
            // and rows added later get unique ids in the event handler.
            id: 'tmp-initial',
            title: '',
            description: '',
            skillIds: [],
            estimatedHrs: null,
          },
        ],
  )

  const [error, setError] = useState<string | null>(null)
  const [pendingSave, startSave] = useTransition()
  const [pendingBlueprint, startBlueprintSave] = useTransition()
  const [savedBlueprintAt, setSavedBlueprintAt] = useState<Date | null>(null)

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
        id: `tmp-${Date.now()}-${prev.length}`,
        title: '',
        description: '',
        skillIds: [],
        estimatedHrs: null,
      },
    ])
  }

  const onSave = () => {
    setError(null)
    startSave(async () => {
      const result = await updateProjectAction(initial.id, {
        title,
        description,
        city,
        address,
        countryCode,
        languageCode,
        remote,
        joinPolicy,
        status,
        steps: steps.map((s) => ({
          id: s.id.startsWith('tmp-') ? null : s.id,
          title: s.title,
          description: s.description,
          skillIds: s.skillIds,
          estimatedHrs: s.estimatedHrs,
        })),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/projects/${initial.id}`)
    })
  }

  const onCoverFile = (file: File | null) => {
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    startCoverTransition(async () => {
      const result = await uploadProjectCoverAction(initial.id, fd)
      if (!result.success) setError(result.error)
      else setCoverImageUrl(result.data.url)
    })
    if (coverFileRef.current) coverFileRef.current.value = ''
  }

  const onClearCover = () => {
    setError(null)
    startCoverTransition(async () => {
      const result = await clearProjectCoverAction(initial.id)
      if (!result.success) setError(result.error)
      else setCoverImageUrl(null)
    })
  }

  const onSaveBlueprint = () => {
    setError(null)
    startBlueprintSave(async () => {
      // Reuse the create-page action; blueprints don't carry location or
      // a forking link, so we hand it the editor's current state.
      const result = await saveBlueprintAction({
        title,
        description,
        city,
        // Blueprints are place-agnostic — the precise location belongs to
        // the project that's forked, not the template.
        address: '',
        // Carry the project's locale forward when saving its template; the
        // user can re-localise from the blueprint create flow later.
        countryCode,
        languageCode,
        remote,
        // Blueprints don't carry a join policy at runtime — projects forked
        // from them pick their own. Pass a valid default to satisfy the
        // shared validator.
        joinPolicy: 'open',
        projectTypeId: null,
        blueprintId: null,
        parentBlueprintId: null,
        steps: steps.map((s) => ({
          title: s.title,
          description: s.description,
          skillIds: s.skillIds,
          estimatedHrs: s.estimatedHrs,
        })),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setSavedBlueprintAt(new Date())
    })
  }

  const titleForPreview = title.trim() || initial.title || 'Untitled project'

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-bg-base px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <Link
            href="/my-projects"
            className="transition-colors duration-fast hover:text-fg-primary"
          >
            My projects
          </Link>
          <span className="opacity-50">/</span>
          <Link
            href={`/projects/${initial.id}`}
            className="max-w-[260px] truncate transition-colors duration-fast hover:text-fg-primary"
          >
            {initial.title}
          </Link>
          <span className="opacity-50">/</span>
          <span className="font-medium text-fg-primary">Modify</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${initial.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
          >
            <ChevronLeft className="size-3.5" strokeWidth={2.5} />
            Back to project
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] p-4 sm:p-6 lg:p-10">
        {/* Editor header */}
        <header className="mb-8 sm:mb-10">
          <span className="mb-2 inline-flex items-center gap-2 text-xs text-fg-tertiary">
            Modifying
            <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2.5 py-[3px] font-medium text-amber-500">
              Project lead
            </span>
          </span>
          <h1 className="font-display text-[clamp(28px,3vw,40px)] font-normal leading-tight tracking-tight">
            <em className="italic text-amber-500">{titleForPreview}</em>
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[180px_1fr] lg:gap-12">
          {/* In-page nav */}
          <SectionNav
            sections={TOC_SECTIONS}
            activeId={activeSection}
            onActiveChange={setActiveSection}
          />

          {/* Sections column */}
          <div className="flex min-w-0 flex-col gap-8 sm:gap-10">
            {/* Status — the hero of the modify page */}
            <Card id="sec-status">
              <CardHead
                eyebrow="Project status"
                title="What's happening, in one word?"
                desc={
                  'This appears at the top of the project page, in listings, and in everyone’s dashboard. Set it honestly — "Needs help" gets more eyes than a passive "In progress" when you actually need hands.'
                }
              />
              <div
                role="radiogroup"
                aria-label="Project status"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                {STATUS_OPTIONS.map((opt) => {
                  const checked = status === opt.value
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        'relative flex cursor-pointer items-start gap-4 rounded-xl border bg-bg-base p-5 transition-all',
                        checked
                          ? 'border-amber-500/60 bg-amber-500/[0.06] shadow-[0_0_0_3px_rgba(244,165,53,0.10)]'
                          : 'border-neutral-700 hover:border-neutral-600',
                      )}
                    >
                      <input
                        type="radio"
                        name="project-status"
                        value={opt.value}
                        checked={checked}
                        onChange={() => setStatus(opt.value)}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          'mt-1 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
                          checked
                            ? 'border-amber-500'
                            : 'border-neutral-600',
                        )}
                      >
                        <span
                          className={cn(
                            'size-2 rounded-full bg-amber-500 transition-transform',
                            checked ? 'scale-100' : 'scale-0',
                          )}
                        />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex items-center gap-2 text-base font-semibold text-fg-primary">
                          <StatusPillPreview status={opt.value} label={opt.label} />
                        </span>
                        <span className="text-xs leading-relaxed text-fg-tertiary">
                          {opt.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </Card>

            {/* The basics */}
            <Card id="sec-basics">
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

        {/* Cover image */}
        <Card id="sec-cover">
          <CardHead
            eyebrow="Cover image"
            title="A picture for your project."
            desc="Used on the project page and the cards on Browse and My projects. Optional — a colourful gradient stands in if you skip it."
          />
          <input
            ref={coverFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => onCoverFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="relative aspect-[16/8] w-full max-w-[260px] shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-bg-base">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt="Project cover"
                  fill
                  sizes="260px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-fg-tertiary">
                  <ImageIcon className="size-8" strokeWidth={1.5} />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => coverFileRef.current?.click()}
                  disabled={pendingCover}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-fg-primary transition-colors hover:border-neutral-600 disabled:cursor-wait disabled:opacity-60"
                >
                  <Upload className="size-3.5" />
                  {pendingCover
                    ? 'Uploading…'
                    : coverImageUrl
                      ? 'Replace'
                      : 'Upload cover'}
                </button>
                {coverImageUrl && (
                  <button
                    type="button"
                    onClick={onClearCover}
                    disabled={pendingCover}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-red-300 transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </div>
              <span className="max-w-[320px] text-xs leading-relaxed text-fg-tertiary">
                Wide image works best — at least 1200×600. PNG, JPG, WebP or GIF, up to 8&nbsp;MB.
              </span>
            </div>
          </div>
        </Card>

        {/* Where */}
        <Card id="sec-location">
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
              <Field
                label="Country (optional)"
                htmlFor="fld-country"
                help="Shown on the project card and used by the browse-page country filter."
              >
                <CountrySelect id="fld-country" value={countryCode} onChange={setCountryCode} />
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

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
            </Field>

            {/* Membership: join policy */}
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
        <Card id="sec-steps">
          <CardHead
            eyebrow="The plan"
            title="Steps to make it real."
            desc="Add, edit, reorder, or remove steps. Steps that have been claimed will release their assignee if you delete them — be deliberate."
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
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSaveBlueprint}
              disabled={pendingBlueprint || pendingSave}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="size-3.5" strokeWidth={2} />
              {pendingBlueprint ? 'Saving…' : 'Save as blueprint'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={pendingSave || pendingBlueprint}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {pendingSave ? 'Saving…' : 'Save changes'}
              {!pendingSave && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
            </button>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   Sub-components — TOC + status pill preview
   ================================================================ */

function SectionNav({
  sections,
  activeId,
  onActiveChange,
}: {
  sections: Array<{ id: string; label: string }>
  activeId: string
  onActiveChange: (id: string) => void
}) {
  // Scroll-spy: when a section's top crosses ~120px from the viewport top,
  // mark it as active so the nav follows the user's reading position.
  useEffect(() => {
    const sectionEls = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el)
    if (sectionEls.length === 0) return

    const onScroll = () => {
      const threshold = 140
      let current = sectionEls[0].id
      for (const el of sectionEls) {
        const top = el.getBoundingClientRect().top
        if (top <= threshold) current = el.id
        else break
      }
      onActiveChange(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections, onActiveChange])

  return (
    <nav
      aria-label="Sections"
      className="-mx-2 flex flex-row gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-bg-surface px-2 py-2 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0"
    >
      <span className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-fg-tertiary lg:block">
        On this page
      </span>
      {sections.map((s) => {
        const active = activeId === s.id
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:border-l-2 lg:border-transparent',
              active
                ? 'bg-bg-surface-2 text-amber-500 lg:bg-transparent lg:border-amber-500 lg:font-medium'
                : 'text-fg-secondary hover:text-fg-primary',
            )}
          >
            {s.label}
          </a>
        )
      })}
    </nav>
  )
}

/**
 * Inline preview pill — sits inside each radio option so the lead can see
 * exactly how the chosen status will read on the project page.
 */
function StatusPillPreview({
  status,
  label,
}: {
  status: ProjectStatus
  label: string
}) {
  const palette =
    status === 'needs_help'
      ? 'border-amber-500/55 bg-amber-500/[0.16] text-amber-400'
      : status === 'in_progress'
        ? 'border-green-500/40 bg-green-500/[0.14] text-green-300'
        : status === 'defining'
          ? 'border-blue-400/35 bg-blue-500/[0.10] text-blue-200'
          : 'border-green-500/35 bg-green-500/[0.10] text-green-300'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        palette,
      )}
    >
      <PreviewGlyph status={status} />
      {label}
    </span>
  )
}

function PreviewGlyph({ status }: { status: ProjectStatus }) {
  if (status === 'needs_help') {
    return (
      <span className="inline-flex size-3 items-center justify-center rounded-full bg-amber-500 font-display text-[9px] font-bold leading-none text-amber-900">
        !
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="relative inline-flex size-3 items-center justify-center rounded-full border-[1.5px] border-green-500">
        <span className="size-1.5 rounded-full bg-green-300" />
      </span>
    )
  }
  if (status === 'defining') {
    return (
      <span className="relative size-3 rounded-full border-[1.5px] border-dashed border-blue-300">
        <span className="absolute left-1/2 top-1/2 h-px w-1.5 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-blue-300" />
      </span>
    )
  }
  return (
    <span className="inline-flex size-3 items-center justify-center rounded-full bg-green-500 text-blue-900">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-2"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

