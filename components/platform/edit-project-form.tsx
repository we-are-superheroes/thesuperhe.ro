'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileText, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateProjectAction } from '@/app/(platform)/projects/[id]/edit/actions'
import { saveBlueprintAction } from '@/app/(platform)/projects/new/actions'
import {
  Card,
  CardHead,
  Field,
  StepRow,
  AddStepButton,
  COUNTRIES,
  REMOTE_OPTIONS,
  type FormStep,
  type SkillOption,
} from '@/components/platform/project-form-bits'

/* ================================================================
   Types
   ================================================================ */

export interface EditProjectInitial {
  id: string
  title: string
  description: string
  city: string
  country: string
  remote: 'yes' | 'some' | 'no'
  steps: Array<{
    id: string
    title: string
    description: string
    skillId: string | null
  }>
}

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
  // Pre-select the country if the saved one is in the dropdown, otherwise
  // fall back to the first option so the field never renders blank.
  const [country, setCountry] = useState(
    initial.country && COUNTRIES.includes(initial.country) ? initial.country : COUNTRIES[0],
  )
  const [remote, setRemote] = useState<'yes' | 'some' | 'no'>(initial.remote)
  const [steps, setSteps] = useState<FormStep[]>(
    initial.steps.length > 0
      ? initial.steps.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          skillId: s.skillId,
        }))
      : [{ id: `tmp-${Date.now()}`, title: '', description: '', skillId: null }],
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
      { id: `tmp-${Date.now()}-${prev.length}`, title: '', description: '', skillId: null },
    ])
  }

  const onSave = () => {
    setError(null)
    startSave(async () => {
      const result = await updateProjectAction(initial.id, {
        title,
        description,
        city,
        country,
        remote,
        steps: steps.map((s) => ({
          id: s.id.startsWith('tmp-') ? null : s.id,
          title: s.title,
          description: s.description,
          skillId: s.skillId,
        })),
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/projects/${initial.id}`)
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
        country,
        remote,
        projectTypeId: null,
        blueprintId: null,
        steps: steps.map((s) => ({
          title: s.title,
          description: s.description,
          skillId: s.skillId,
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
      <div className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-white/[0.08] bg-bg-base px-10 py-5">
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

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-10 p-10">
        {/* Editor header */}
        <header>
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
            </Field>
          </div>
        </Card>

        {/* Steps */}
        <Card>
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
        <div className="sticky bottom-0 -mx-10 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-bg-base from-25% to-transparent px-10 py-6">
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
  )
}
