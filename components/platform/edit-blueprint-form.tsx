'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { updateBlueprintAction } from '@/app/(public)/blueprints/[id]/edit/actions'
import {
  Card,
  CardHead,
  Field,
  StepRow,
  AddStepButton,
  CountrySelect,
  SelectBox,
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
  const t = useTranslations('blueprints')
  const tCommon = useTranslations('common')
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
  const titleForPreview = title.trim() || initial.title || t('edit.untitledBlueprint')

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-bg-base px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <Link
            href="/blueprints"
            className="transition-colors duration-fast hover:text-fg-primary"
          >
            {t('detail.breadcrumbRoot')}
          </Link>
          <span className="opacity-50">/</span>
          <Link
            href={`/blueprints/${initial.id}`}
            className="max-w-[260px] truncate transition-colors duration-fast hover:text-fg-primary"
          >
            {initial.title}
          </Link>
          <span className="opacity-50">/</span>
          <span className="font-medium text-fg-primary">{t('edit.breadcrumbModify')}</span>
        </div>
        <Link
          href={`/blueprints/${initial.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
        >
          <ChevronLeft className="size-3.5" strokeWidth={2.5} />
          {t('edit.backToBlueprint')}
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[1000px] p-4 sm:p-6 lg:p-10">
        <header className="mb-8 sm:mb-10">
          <span className="mb-2 inline-flex items-center gap-2 text-xs text-fg-tertiary">
            {t('edit.modifying')}
            <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2.5 py-[3px] font-medium text-amber-500">
              {t('edit.blueprintBadge')}
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
              eyebrow={t('edit.basics.eyebrow')}
              title={t('edit.basics.title')}
              desc={t('edit.basics.desc')}
            />
            <div className="flex flex-col gap-5">
              <Field label={t('edit.basics.titleLabel')} htmlFor="fld-bp-title">
                <input
                  id="fld-bp-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('edit.basics.titlePlaceholder')}
                  className="w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-4 py-3.5 font-display text-2xl leading-tight text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                />
              </Field>
              <Field
                label={t('edit.basics.descriptionLabel')}
                htmlFor="fld-bp-desc"
                help={t('edit.basics.descriptionHelp')}
              >
                <textarea
                  id="fld-bp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder={t('edit.basics.descriptionPlaceholder')}
                  className="min-h-[130px] w-full resize-y rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm leading-relaxed text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
                />
              </Field>
              <Field label={t('edit.basics.projectTypeLabel')} htmlFor="fld-bp-type">
                <SelectBox
                  id="fld-bp-type"
                  value={projectTypeId ?? ''}
                  onChange={(e) => setProjectTypeId(e.target.value || null)}
                >
                  <option value="">{t('edit.basics.noneOption')}</option>
                  {projectTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </SelectBox>
              </Field>
            </div>
          </Card>

          {/* Locale + family */}
          <Card>
            <CardHead
              eyebrow={t('edit.locale.eyebrow')}
              title={t('edit.locale.title')}
              desc={t('edit.locale.desc')}
            />
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={t('edit.locale.countryLabel')} htmlFor="fld-bp-country">
                  <CountrySelect
                    id="fld-bp-country"
                    value={countryCode}
                    onChange={setCountryCode}
                  />
                </Field>
                <Field label={t('edit.locale.languageLabel')} htmlFor="fld-bp-lang">
                  <SelectBox
                    id="fld-bp-lang"
                    value={languageCode ?? ''}
                    onChange={(e) => setLanguageCode(e.target.value || null)}
                  >
                    <option value="">{t('edit.basics.noneOption')}</option>
                    {ISO_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </SelectBox>
                </Field>
              </div>

              {canHaveParent ? (
                <Field
                  label={t('edit.locale.familyLabel')}
                  htmlFor="fld-bp-parent"
                  help={
                    isVariant
                      ? t('edit.locale.familyHelpVariant')
                      : t('edit.locale.familyHelpRoot')
                  }
                >
                  <SelectBox
                    id="fld-bp-parent"
                    value={parentBlueprintId ?? ''}
                    onChange={(e) => setParentBlueprintId(e.target.value || null)}
                  >
                    <option value="">{t('edit.locale.standaloneOption')}</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </SelectBox>
                </Field>
              ) : (
                <div className="rounded-lg border border-white/[0.08] bg-bg-surface-2 p-4 text-xs text-fg-tertiary">
                  {t.rich('edit.locale.hasVariantsNotice', {
                    count: initial.childCount,
                    strong: (chunks) => (
                      <strong className="font-semibold text-fg-secondary">{chunks}</strong>
                    ),
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Steps */}
          <Card>
            <CardHead
              eyebrow={t('edit.steps.eyebrow')}
              title={t('edit.steps.title')}
              desc={t('edit.steps.desc')}
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
              {pending ? tCommon('state.saving') : t('edit.saveChanges')}
              {!pending && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
