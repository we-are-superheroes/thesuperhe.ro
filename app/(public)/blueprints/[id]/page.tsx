import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import {
  ArrowRight,
  ChevronRight,
  Clock,
  FolderOpen,
  GitBranch,
  Globe,
  Languages,
  MapPin,
  Pencil,
  Sparkles,
  Zap,
} from 'lucide-react'
import { db } from '@/lib/db'
import {
  countryFlag,
  countryLabel,
  languageDisplay,
  languageLabel,
} from '@/lib/locales'

/* ================================================================
   /blueprints/[id] — public read-only view of a blueprint.
   Mirrors the project-view information architecture (left column
   = "about" + steps, right rail = stats + family + meta) but
   without join/join-step affordances since a blueprint isn't
   joinable: it's a recipe. The CTAs are "Use blueprint" (→ create
   project) and, for the creator, "Modify blueprint".
   ================================================================ */

interface PageParams {
  params: Promise<{ id: string }>
}

export default async function BlueprintViewPage({ params }: PageParams) {
  const { id } = await params
  const { userId } = await auth()

  const blueprint = await db.blueprint.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      country: true,
      language: true,
      reuseCount: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdBy: { select: { id: true, name: true } },
      projectType: { select: { id: true, name: true } },
      parentBlueprintId: true,
      parent: {
        select: {
          id: true,
          title: true,
          country: true,
          language: true,
          variants: {
            orderBy: [{ country: 'asc' }, { language: 'asc' }],
            select: {
              id: true,
              title: true,
              country: true,
              language: true,
            },
          },
        },
      },
      variants: {
        orderBy: [{ country: 'asc' }, { language: 'asc' }],
        select: {
          id: true,
          title: true,
          country: true,
          language: true,
          reuseCount: true,
        },
      },
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          order: true,
          estimatedHrs: true,
          skills: { select: { skill: { select: { id: true, name: true } } } },
        },
      },
      _count: { select: { projects: true } },
    },
  })

  if (!blueprint) notFound()

  const isCreator = !!userId && userId === blueprint.createdById
  const totalEstimatedHrs = blueprint.steps.reduce(
    (n, s) => n + (s.estimatedHrs ?? 0),
    0,
  )

  // For the family chip row — root + siblings if this is a variant, else
  // root + own variants if this is a root.
  const rootBlueprint = blueprint.parent
    ? {
        id: blueprint.parent.id,
        title: blueprint.parent.title,
        country: blueprint.parent.country,
        language: blueprint.parent.language,
      }
    : {
        id: blueprint.id,
        title: blueprint.title,
        country: blueprint.country,
        language: blueprint.language,
      }
  const familyVariants = blueprint.parent
    ? blueprint.parent.variants
    : blueprint.variants
  const familySize = 1 + familyVariants.length

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 overflow-y-auto p-4 sm:p-6 lg:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-fg-tertiary">
        <Link href="/blueprints" className="transition-colors hover:text-fg-primary">
          Blueprints
        </Link>
        <ChevronRight className="size-3.5" />
        {blueprint.parent && (
          <>
            <Link
              href={`/blueprints/${blueprint.parent.id}`}
              className="max-w-[220px] truncate transition-colors hover:text-fg-primary"
            >
              {blueprint.parent.title}
            </Link>
            <ChevronRight className="size-3.5" />
          </>
        )}
        <span className="truncate font-medium text-fg-primary">{blueprint.title}</span>
      </nav>

      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {blueprint.projectType && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-500">
              {blueprint.projectType.name}
            </span>
          )}
          {blueprint.parent && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/[0.10] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-200">
              <Sparkles className="size-3" strokeWidth={2.5} />
              Variant
            </span>
          )}
          {blueprint.country && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-bg-surface-2 px-3 py-1 text-xs font-semibold tracking-wider text-fg-secondary">
              <span aria-hidden>{countryFlag(blueprint.country) ?? '🌐'}</span>
              {countryLabel(blueprint.country)}
            </span>
          )}
          {blueprint.language && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-bg-surface-2 px-3 py-1 text-xs font-semibold tracking-wider text-fg-secondary">
              <Languages className="size-3" />
              {languageLabel(blueprint.language)}
            </span>
          )}
        </div>

        <h1 className="font-display text-[clamp(32px,6vw,56px)] font-normal leading-tight tracking-tight">
          {blueprint.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-fg-secondary">
          <span>
            Created by{' '}
            {blueprint.createdBy ? (
              <Link
                href={`/users/${blueprint.createdBy.id}`}
                className="font-medium text-fg-primary transition-colors hover:text-amber-500"
              >
                {blueprint.createdBy.name}
              </Link>
            ) : (
              <span className="text-fg-tertiary">someone</span>
            )}
          </span>
          <span className="size-[3px] rounded-full bg-fg-tertiary" />
          <span className="inline-flex items-center gap-1.5">
            <Zap className="size-3.5" />
            <strong className="font-semibold text-fg-primary">
              {blueprint.reuseCount}
            </strong>
            launch{blueprint.reuseCount === 1 ? '' : 'es'}
          </span>
          <span className="size-[3px] rounded-full bg-fg-tertiary" />
          <span className="inline-flex items-center gap-1.5">
            <FolderOpen className="size-3.5" />
            {blueprint.steps.length} step{blueprint.steps.length === 1 ? '' : 's'}
          </span>
          {totalEstimatedHrs > 0 && (
            <>
              <span className="size-[3px] rounded-full bg-fg-tertiary" />
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" />~{totalEstimatedHrs}h estimated
              </span>
            </>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/new?blueprint=${blueprint.id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            Use blueprint
            <ArrowRight className="size-3.5" strokeWidth={2.5} />
          </Link>
          <Link
            href={`/projects/new?blueprint=${blueprint.id}&variant=1`}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-bg-surface px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:border-neutral-600 hover:bg-white/[0.04]"
            title="Adapt this blueprint for another place or language"
          >
            <GitBranch className="size-3.5" strokeWidth={2.5} />
            Create variant
          </Link>
          {isCreator && (
            <Link
              href={`/blueprints/${blueprint.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-bg-surface px-4 py-2.5 text-sm font-medium text-fg-primary transition-colors hover:border-neutral-600 hover:bg-white/[0.04]"
            >
              <Pencil className="size-3.5" strokeWidth={2.5} />
              Modify blueprint
            </Link>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_340px] lg:gap-10">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-8">
          {/* About */}
          <section>
            <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
              About this blueprint
            </div>
            <h2 className="mb-3 font-display text-2xl font-normal leading-tight tracking-tight">
              What you&apos;ll set up.
            </h2>
            {blueprint.description
              .split(/\n+/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <p key={i} className="mb-3 text-base leading-relaxed text-fg-secondary">
                  {p}
                </p>
              ))}
          </section>

          {/* Steps */}
          <section>
            <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
              The plan
            </div>
            <h2 className="mb-5 font-display text-2xl font-normal leading-tight tracking-tight">
              {blueprint.steps.length} step
              {blueprint.steps.length === 1 ? '' : 's'} to deliver this.
            </h2>
            {blueprint.steps.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center text-sm text-fg-tertiary">
                This blueprint has no steps yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {blueprint.steps.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-3 font-display text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
                      <span>
                        Step {s.order} of {blueprint.steps.length}
                      </span>
                      {s.estimatedHrs != null && (
                        <span className="inline-flex items-center gap-1 text-fg-tertiary">
                          <Clock className="size-3" />~{s.estimatedHrs}h
                        </span>
                      )}
                    </div>
                    <h3 className="font-display text-lg leading-tight">{s.title}</h3>
                    {s.description && (
                      <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
                        {s.description}
                      </p>
                    )}
                    {s.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.skills.map((ss) => (
                          <span
                            key={ss.skill.id}
                            className="rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-1 text-xs text-fg-secondary"
                          >
                            {ss.skill.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
          {/* Family */}
          {familySize > 1 && (
            <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
                Family
                <span className="rounded-full bg-bg-surface-2 px-2 py-0.5 text-[10px] tabular-nums text-fg-secondary">
                  {familySize} variant{familySize === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <FamilyRow
                  href={`/blueprints/${rootBlueprint.id}`}
                  active={blueprint.id === rootBlueprint.id}
                  label={rootBlueprint.title}
                  country={rootBlueprint.country}
                  language={rootBlueprint.language}
                  isRoot
                />
                {familyVariants.map((v) => (
                  <FamilyRow
                    key={v.id}
                    href={`/blueprints/${v.id}`}
                    active={blueprint.id === v.id}
                    label={v.title}
                    country={v.country}
                    language={v.language}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
            <div className="mb-4 font-display text-lg">Details</div>
            <DetailRow icon={<FolderOpen className="size-3.5" />} label="Type">
              {blueprint.projectType?.name ?? <Muted>Not set</Muted>}
            </DetailRow>
            <DetailRow icon={<MapPin className="size-3.5" />} label="Country">
              {blueprint.country ? (
                <>
                  {countryFlag(blueprint.country) ? `${countryFlag(blueprint.country)} ` : ''}
                  {countryLabel(blueprint.country)}
                </>
              ) : (
                <Muted>Any</Muted>
              )}
            </DetailRow>
            <DetailRow icon={<Languages className="size-3.5" />} label="Language">
              {blueprint.language ? (
                languageLabel(blueprint.language)
              ) : (
                <Muted>Any</Muted>
              )}
            </DetailRow>
            <DetailRow icon={<Globe className="size-3.5" />} label="Projects forked">
              {blueprint._count.projects}
            </DetailRow>
          </div>
        </aside>
      </div>
    </div>
  )
}

function FamilyRow({
  href,
  active,
  label,
  country,
  language,
  isRoot,
}: {
  href: string
  active: boolean
  label: string
  country: string | null
  language: string | null
  isRoot?: boolean
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-fg-tertiary">
        {country ? (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>{countryFlag(country) ?? '🌐'}</span>
            <span className="font-mono tracking-wider">{country}</span>
          </span>
        ) : (
          <span className="font-mono tracking-wider">—</span>
        )}
        {language && (
          <span className="rounded-full bg-white/[0.06] px-1.5 py-px font-mono tracking-wider">
            {languageDisplay(language) ?? language.toUpperCase()}
          </span>
        )}
        {isRoot && (
          <span className="text-[9px] uppercase tracking-widest text-fg-tertiary">
            original
          </span>
        )}
      </span>
    </>
  )
  return active ? (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2">
      {inner}
    </div>
  ) : (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-bg-surface-2"
    >
      {inner}
    </Link>
  )
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/[0.08] py-3 first-of-type:pt-0 last:border-b-0 last:pb-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-bg-surface-2 text-fg-secondary">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-tertiary">
          {label}
        </span>
        <span className="text-sm leading-tight text-fg-primary">{children}</span>
      </div>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-fg-secondary">{children}</span>
}
