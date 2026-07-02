'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { updateBlueprintAction } from '@/app/(public)/blueprints/[id]/edit/actions'
import {
  Card,
  CardHead,
  Field,
  StepRow,
  AddStepButton,
  CountrySelect,
  type FormStep,
  type SkillOption,
} from '@/components/platform/project-form-bits'
import { LANGUAGES as ISO_LANGUAGES } from '@/lib/locales'

/* ================================================================
   Modify Blueprint form.
   Blueprints carry less than projects (no status / cover / join
   policy / location), so the form is shorter than the project
   edit form. The interesting extras are the parent picker (turn
   a root into a variant of another root) and the country +
   language fields that drive /blueprints filtering + browse
   inheritance on forked projects.
   ================================================================ */

export interface EditBlueprintStepInitial {
  id: string
  title: string
  description: string
  skillIds: string[]
  estimatedHrs: number | null
}

export interface ParentBlueprintOption {
  id: string
  title: string
  country: string | null
  language: string | null
}

export interface EditBlueprintInitial {
  id: string
  title: string
  description: string
  projectTypeId: string | null
  parentBlueprintId: string | null
  countryCode: string | null
  languageCode: string | null
  /** Number of existing variants. When > 0 this blueprint can't itself
   *  become a variant — the form hides the parent picker. */
  childCount: number
  steps: EditBlueprintStepInitial[]
}

export function EditBlueprintForm({
  initial,
  skills,
  projectTypes,
  parents,
  canHaveParent,
}: {
  initial: EditBlueprintInitial
  skills: SkillOption[]
  projectTypes: Array<{ id: string; name: string }>
  parents: ParentBlueprintOption[]
  canHaveParent: boolean
}) {
  const router = useRouter()

  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [projectTypeId, setProjectTypeId] = useState<string | null>(
    initial.projectTypeId,
  )
  const [parentBlueprintId, setParentBlueprintId] = useState<string | null>(
    initial.parentBlueprintId,
  )
  const [countryCode, setCountryCode] = useState<string | null>(initial.countryCode)
  const [languageCode, setLanguageCode] = useState<string | null>(
    initial.languageCode,
  )

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
  const [pending, startTransition] = useTransition()

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
    startTransition(async () => {
      const result = await updateBlueprintAction(initial.id, {
        title,
        description,
        projectTypeId,
        parentBlueprintId,
        countryCode,
        languageCode,
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
      router.push(`/blueprints/${initial.id}`)
    })
  }

  const isVariant = !!parentBlueprintId
  const titleForPreview = title.trim() || initial.title || 'Untitled blueprint'

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-bg-base px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <Link
            href="/blueprints"
            className="transition-colors duration-fast hover:text-fg-primary"
          >
            Blueprints
          </Link>
          <span className="opacity-50">/</span>
          <Link
            href={`/blueprints/${initial.id}`}
            className="max-w-[260px] truncate transition-colors duration-fast hover:text-fg-primary"
          >
            {initial.title}
          </Link>
          <span className="opacity-50">/</span>
          <span className="font-medium text-fg-primary">Modify</span>
        </div>
        <Link
          href={`/blueprints/${initial.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
        >
          <ChevronLeft className="size-3.5" strokeWidth={2.5} />
          Back to blueprint
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[1000px] p-4 sm:p-6 lg:p-10">
        <header className="mb-8 sm:mb-10">
          <span className="mb-2 inline-flex items-center gap-2 text-xs text-fg-tertiary">
            Modifying
            <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2.5 py-[3px] font-medium text-amber-500">
              Blueprint
            </span>
          </span>
          <h1 className="font-display text-[clamp(28px,3vw,40px)] font-normal leading-tight tracking-tight">
            <em className="italic text-amber-500">{titleForPreview}</em>
          </h1>
        </header>

        <div className="flex flex-col gap-8 sm:gap-10">
          {/* Basics */}
          <Card>
            <CardHead
              eyebrow="The basics"
              title="What is this blueprint?"
              desc="Two sentences are enough to describe the pattern. You can flesh it out later."
            />
            <div className="flex flex-col gap-5">
              <Field label="Title" htmlFor="fld-bp-title">
                <input
                  id="fld-bp-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Repair Café"
                  className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-4 py-3.5 font-display text-2xl leading-tight text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                />
              </Field>
              <Field
                label="Description"
                htmlFor="fld-bp-desc"
                help="The first paragraph is what shows up on the blueprint card."
              >
                <textarea
                  id="fld-bp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="What problem does this pattern solve, and what does running it look like?"
                  className="min-h-[130px] w-full resize-y rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm leading-relaxed text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                />
              </Field>
              <Field label="Project type" htmlFor="fld-bp-type">
                <select
                  id="fld-bp-type"
                  value={projectTypeId ?? ''}
                  onChange={(e) => setProjectTypeId(e.target.value || null)}
                  className="w-full appearance-none rounded-lg border border-neutral-700 bg-bg-surface-2 py-2.5 pl-3.5 pr-9 font-sans text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)] [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%238097B5%22_stroke-width=%222.5%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_14px_center] [background-repeat:no-repeat]"
                >
                  <option value="">— none —</option>
                  {projectTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          {/* Locale + family */}
          <Card>
            <CardHead
              eyebrow="Locale"
              title="Where and in what language?"
              desc="Forks of this blueprint inherit these tags by default. Variants must declare at least one of country or language."
            />
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Country (optional unless this is a variant)" htmlFor="fld-bp-country">
                  <CountrySelect
                    id="fld-bp-country"
                    value={countryCode}
                    onChange={setCountryCode}
                  />
                </Field>
                <Field label="Working language (optional unless this is a variant)" htmlFor="fld-bp-lang">
                  <select
                    id="fld-bp-lang"
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

              {canHaveParent ? (
                <Field
                  label="Family"
                  htmlFor="fld-bp-parent"
                  help={
                    isVariant
                      ? 'This blueprint is currently a variant of the family below. Set to “Standalone” to promote it to a root.'
                      : 'Optional. If you’re adapting an existing pattern, link to the original root so the two appear together as a family.'
                  }
                >
                  <select
                    id="fld-bp-parent"
                    value={parentBlueprintId ?? ''}
                    onChange={(e) => setParentBlueprintId(e.target.value || null)}
                    className="w-full appearance-none rounded-lg border border-neutral-700 bg-bg-surface-2 py-2.5 pl-3.5 pr-9 font-sans text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)] [background-image:url('data:image/svg+xml;utf8,<svg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%2212%22_viewBox=%220_0_24_24%22_fill=%22none%22_stroke=%22%238097B5%22_stroke-width=%222.5%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22><polyline_points=%226_9_12_15_18_9%22/></svg>')] [background-position:right_14px_center] [background-repeat:no-repeat]"
                  >
                    <option value="">Standalone (no parent)</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="rounded-lg border border-white/[0.08] bg-bg-surface-2 p-4 text-xs text-fg-tertiary">
                  This blueprint already has{' '}
                  <strong className="font-semibold text-fg-secondary">
                    {initial.childCount} variant{initial.childCount === 1 ? '' : 's'}
                  </strong>{' '}
                  of its own, so it stays a family root.
                </div>
              )}
            </div>
          </Card>

          {/* Steps */}
          <Card>
            <CardHead
              eyebrow="The plan"
              title="Steps to deliver the pattern."
              desc="Anyone who forks this blueprint will start with these steps. Edit, reorder, or remove as needed."
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
              {error && <span className="text-red-300">{error}</span>}
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {pending ? 'Saving…' : 'Save changes'}
              {!pending && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
