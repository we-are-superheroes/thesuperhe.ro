import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { getSkillMatchFeed } from '@/lib/skill-matches'
import { normaliseStepStatus, stepNeedsHelp } from '@/lib/step-status'
import type { MatchCardData } from '@/components/platform/skill-matches-client'
import { GlobalSearch } from '@/components/platform/global-search'
import { ProjectStatusBadge } from '@/components/platform/project-status-badge'
import Link from 'next/link'
import Image from 'next/image'
import {
  Bell,
  Plus,
  ArrowRight,
  Clock,
  FolderOpen,
  CheckSquare,
  Star,
  Check,
} from 'lucide-react'

/* ================================================================
   DATA FETCHING
   ================================================================ */

async function getDashboardData(userId: string) {
  const [user, contributions] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        createdAt: true,
        skills: {
          where: { isSeeking: true },
          select: {
            skill: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.contribution.findMany({
      where: { userId, status: { in: ['active', 'pending'] } },
      select: {
        role: true,
        hoursContributed: true,
        projectId: true,
        projectStepId: true,
        project: {
          select: {
            id: true,
            title: true,
            status: true,
            location: true,
            coverImageUrl: true,
            projectType: { select: { name: true } },
            steps: {
              select: { id: true, status: true, helpWanted: true },
            },
          },
        },
      },
    }),
  ])

  // Unique projects the user contributes to
  const projectMap = new Map<string, typeof contributions[number]>()
  for (const c of contributions) {
    if (!projectMap.has(c.projectId)) {
      projectMap.set(c.projectId, c)
    }
  }
  const pinnedProjects = Array.from(projectMap.values()).slice(0, 3)

  // Quick stats
  const projectCount = projectMap.size
  const totalHours = contributions.reduce((s, c) => s + c.hoursContributed, 0)

  // Get steps from contributed projects for "next steps"
  const projectIds = Array.from(projectMap.keys())
  let mySteps: Array<{
    id: string
    title: string
    status: string
    helpWanted: boolean
    estimatedHrs: number | null
    project: { title: string }
    skills: Array<{ skill: { name: string } }>
  }> = []

  if (projectIds.length > 0) {
    mySteps = await db.projectStep.findMany({
      where: {
        projectId: { in: projectIds },
        status: { not: 'completed' },
        // Only steps the user has actually joined — being a member of the
        // project isn't enough for "your next steps".
        contributions: { some: { userId, status: 'active' } },
      },
      select: {
        id: true,
        title: true,
        status: true,
        helpWanted: true,
        estimatedHrs: true,
        project: { select: { title: true } },
        skills: { select: { skill: { select: { name: true } } } },
      },
      orderBy: { order: 'asc' },
      take: 5,
    })
  }

  // Sort steps by urgency: asking for help > in progress > open
  const statusPriority: Record<string, number> = {
    in_progress: 1,
    open: 2,
  }
  const stepPriority = (s: (typeof mySteps)[number]) =>
    stepNeedsHelp(s) ? 0 : (statusPriority[normaliseStepStatus(s.status, true)] ?? 99)
  mySteps.sort((a, b) => stepPriority(a) - stepPriority(b))

  // Open steps count — the user's own joined, not-yet-completed steps, so
  // the number matches what /my-steps shows behind "View all".
  const openStepCount = await db.projectStep.count({
    where: {
      status: { not: 'completed' },
      contributions: { some: { userId, status: 'active' } },
    },
  })

  // Suggested matches — same scoring as the Skill Matches page, top 3.
  const userSkillIds = user?.skills.map((us) => us.skill.id) ?? []
  let suggestedMatches: MatchCardData[] = []
  if (userSkillIds.length > 0) {
    const feed = await getSkillMatchFeed(userId)
    suggestedMatches = feed.cards.slice(0, 3)
  }

  // Get some sample skills for the empty state skill chips
  const sampleSkills = await db.skill.findMany({
    select: { name: true },
    take: 8,
  })

  return {
    user,
    pinnedProjects,
    mySteps,
    suggestedMatches,
    projectCount,
    openStepCount,
    totalHours,
    userSkillIds,
    sampleSkills,
  }
}

/* ================================================================
   PAGE COMPONENT
   ================================================================ */

export default async function DashboardPage() {
  const { userId } = await auth()
  const t = await getTranslations('dashboard')

  const {
    user,
    pinnedProjects,
    mySteps,
    suggestedMatches,
    projectCount,
    openStepCount,
    totalHours,
    userSkillIds,
    sampleSkills,
  } = await getDashboardData(userId!)

  const firstName = user?.name?.split(' ')[0] ?? t('greeting.fallbackName')
  const hasSkills = userSkillIds.length > 0
  const hasProjects = projectCount > 0
  const isNewUser = !hasSkills && !hasProjects

  // Amber emphasis islands inside translated headings.
  const em = (chunks: React.ReactNode) => (
    <em className="italic text-amber-500">{chunks}</em>
  )

  // Determine setup checklist completion
  const checklistDone = {
    account: true, // they're logged in
    skills: hasSkills,
    project: hasProjects,
  }
  const checklistCount = [checklistDone.account, checklistDone.skills, checklistDone.project].filter(Boolean).length

  return (
    <>
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <GlobalSearch />
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <button
            type="button"
            className="relative hidden size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary sm:flex"
            title={t('topbar.notificationsTitle')}
          >
            <Bell className="size-[18px]" />
          </button>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            <span className="hidden sm:inline">{t('topbar.startProject')}</span>
            <span className="sm:hidden">{t('topbar.startProjectShort')}</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 overflow-y-auto p-4 sm:gap-12 sm:p-6 lg:p-10">
        {/* ── Greeting ── */}
        <section className="flex flex-col items-start gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div>
            <h1 className="mb-3 font-display text-[clamp(32px,7vw,52px)] font-normal leading-none tracking-tight">
              {hasProjects ? t('greeting.welcomeBack') : t('greeting.welcome')}
              <br />
              <em className="italic text-amber-500">{firstName}.</em>
            </h1>
            {hasProjects ? (
              <p className="max-w-[560px] text-base leading-relaxed text-fg-secondary sm:text-lg">
                {t('greeting.summary', { steps: openStepCount, projects: projectCount })}
                {openStepCount > 0 && (
                  <strong className="font-semibold text-amber-500">
                    {' '}{t('greeting.someNeedHelp')}
                  </strong>
                )}
              </p>
            ) : (
              <p className="max-w-[560px] text-base leading-relaxed text-fg-secondary sm:text-lg">
                {t('greeting.newUser')}
              </p>
            )}
          </div>
          <div className="flex w-full flex-wrap gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4 sm:gap-8 sm:px-6 sm:py-5 lg:w-auto">
            <QuickStat value={projectCount} label={t('stats.projects')} dimIfZero />
            <QuickStat value={openStepCount} label={t('stats.openSteps')} dimIfZero />
            <QuickStat value={totalHours} label={t('stats.contributed')} suffix={t('stats.hoursSuffix')} dimIfZero />
          </div>
        </section>

        {/* ── Setup Checklist (new users only) ── */}
        {isNewUser && (
          <section>
            <SectionHeader
              eyebrow={t('checklist.eyebrow')}
              title={t.rich('checklist.title', { em })}
              rightContent={
                <span className="text-sm text-fg-tertiary">{t('checklist.progress', { count: checklistCount })}</span>
              }
            />
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface">
              <ChecklistRow
                done={checklistDone.account}
                title={t('checklist.account.title')}
                description={t('checklist.account.description', { name: firstName })}
                ctaLabel={t('checklist.account.cta')}
              />
              <ChecklistRow
                done={checklistDone.skills}
                title={t('checklist.skills.title')}
                description={t('checklist.skills.description')}
                ctaLabel={t('checklist.skills.cta')}
                href="/profile"
              />
              <ChecklistRow
                done={checklistDone.project}
                title={t('checklist.project.title')}
                description={t('checklist.project.description')}
                ctaLabel={t('checklist.project.cta')}
                href="/projects"
                isLast
              />
            </div>
          </section>
        )}

        {/* ── Pinned Projects ── */}
        <section>
          {hasProjects ? (
            <>
              <SectionHeader
                eyebrow={t('pinned.eyebrow')}
                title={t.rich('pinned.title', { em })}
                linkLabel={t('pinned.seeAll')}
                linkHref="/my-projects"
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {pinnedProjects.map((c, i) => {
                  const steps = c.project.steps
                  const doneCount = steps.filter((s) => s.status === 'completed').length
                  const totalSteps = steps.length
                  const progressPct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0
                  const needsHelpCount = steps.filter(stepNeedsHelp).length

                  return (
                    <Link
                      key={c.projectId}
                      href={`/projects/${c.projectId}`}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface transition-all duration-standard hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md"
                    >
                      <div className={`relative aspect-[16/8] overflow-hidden ${c.project.coverImageUrl ? '' : PIN_GRADIENTS[i % PIN_GRADIENTS.length]}`}>
                        {c.project.coverImageUrl && (
                          <Image
                            src={c.project.coverImageUrl}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            className="object-cover"
                          />
                        )}
                        <span className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-neutral-700 bg-blue-900/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fg-primary backdrop-blur-sm">
                            {t(`pinned.role.${c.role}`)}
                          </span>
                          <ProjectStatusBadge
                            status={c.project.status}
                            className="bg-blue-900/85 backdrop-blur-sm"
                          />
                        </span>
                        {needsHelpCount > 0 && (
                          <span className="absolute right-3 top-3 flex items-center gap-[5px] rounded-full border border-neutral-700 bg-blue-900/85 px-2.5 py-1 text-[11px] font-semibold text-amber-500 backdrop-blur-sm">
                            <span className="size-[5px] rounded-full bg-amber-500 shadow-[0_0_5px_var(--color-amber-500)]" />
                            {t('pinned.needHelp', { n: needsHelpCount })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <span className="text-xs tracking-tight text-fg-tertiary">
                          {c.project.projectType?.name ?? t('pinned.typeFallback')}{c.project.location ? ` · ${c.project.location}` : ''}
                        </span>
                        <h3 className="font-display text-xl leading-tight">{c.project.title}</h3>
                        <div className="mt-auto flex flex-col gap-2">
                          <div className="flex justify-between text-xs text-fg-tertiary">
                            <span>{t('pinned.progressLabel')}</span>
                            <span>
                              {t.rich('pinned.progressValue', {
                                strong: (chunks) => (
                                  <strong className="font-semibold text-fg-primary">{chunks}</strong>
                                ),
                                pct: progressPct,
                                done: doneCount,
                                total: totalSteps,
                              })}
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-sm bg-bg-surface-2">
                            <div
                              className="h-full rounded-sm bg-gradient-to-r from-amber-500 to-amber-400"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <SectionHeader eyebrow={t('pinned.eyebrow')} title={t('pinned.emptyHeading')} />
              <EmptyState
                icon={FolderOpen}
                title={t('pinned.emptyTitle')}
                description={t('pinned.emptyDescription')}
                actions={
                  <>
                    <Link
                      href="/projects"
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
                    >
                      {t('pinned.browseProjects')}
                      <ArrowRight className="size-3.5" strokeWidth={2.5} />
                    </Link>
                    <Link
                      href="/projects/new"
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
                    >
                      {t('pinned.startYourOwn')}
                    </Link>
                  </>
                }
              />
            </>
          )}
        </section>

        {/* ── Next Steps ── */}
        <section>
          {mySteps.length > 0 ? (
            <>
              <SectionHeader
                eyebrow={t('nextSteps.eyebrow')}
                title={t('nextSteps.title')}
                linkLabel={t('nextSteps.viewAll', { n: openStepCount })}
                linkHref="/my-steps"
              />
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface">
                {mySteps.map((step, i) => {
                  const status = stepNeedsHelp(step) ? 'needs_help' : normaliseStepStatus(step.status, true)
                  const statusKey =
                    status === 'needs_help' ? 'needsHelp' : status === 'in_progress' ? 'inProgress' : 'notStarted'
                  return (
                    <div
                      key={step.id}
                      className={`flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors duration-fast hover:bg-bg-surface-2 sm:px-6 sm:py-5 ${i < mySteps.length - 1 ? 'border-b border-white/[0.08]' : ''}`}
                    >
                      <StepStatusIndicator
                        status={status}
                        ariaLabel={t(`stepStatus.${statusKey}AriaLabel`)}
                        title={t(`stepStatus.${statusKey}Title`)}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-base font-medium text-fg-primary">
                          {step.title}
                        </span>
                        <span className="truncate text-xs text-fg-tertiary">
                          {step.project.title}
                        </span>
                      </div>
                      {step.skills[0] && (
                        <span className="hidden whitespace-nowrap rounded-full border border-white/[0.08] bg-bg-surface-2 px-2.5 py-1 text-xs text-fg-secondary sm:inline">
                          {step.skills[0].skill.name}
                        </span>
                      )}
                      {step.estimatedHrs != null && (
                        <span className="hidden items-center gap-[5px] whitespace-nowrap text-xs text-fg-tertiary sm:flex">
                          <Clock className="size-3" />
                          {t('estimatedHours', { hours: step.estimatedHrs })}
                        </span>
                      )}
                      <span className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-amber-500">
                        {t('nextSteps.open')}
                        <ArrowRight className="size-3" strokeWidth={2.5} />
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <SectionHeader eyebrow={t('nextSteps.eyebrow')} title={t('nextSteps.emptyHeading')} />
              <EmptyState
                icon={CheckSquare}
                title={t('nextSteps.emptyTitle')}
                description={t('nextSteps.emptyDescription')}
              />
            </>
          )}
        </section>

        {/* ── Suggested / Skill Matches ── */}
        <section>
          {hasSkills && suggestedMatches.length > 0 ? (
            <>
              <SectionHeader
                eyebrow={t('matches.eyebrow')}
                title={t.rich('matches.title', { em })}
                linkLabel={t('matches.browseAll')}
                linkHref="/skill-matches"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {suggestedMatches.map((m) => (
                  <Link
                    key={`${m.kind}-${m.id}`}
                    href={m.href}
                    className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-bg-surface p-5 transition-all duration-standard hover:-translate-y-0.5 hover:border-neutral-600"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex flex-wrap items-center gap-1.5 text-xs tracking-tight text-fg-tertiary">
                        <ProjectStatusBadge status={m.projectStatus} />
                        {m.type ?? t('matches.typeFallback')}
                        {m.location ? ` · ${m.location}` : m.remote ? ` · ${t('matches.remote')}` : ''}
                      </span>
                      <div className="text-right">
                        <div className="font-display text-2xl leading-none text-amber-500">
                          {m.score}
                          <span className="text-sm text-fg-tertiary">%</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-fg-tertiary">
                          {t('matches.matchLabel')}
                        </div>
                      </div>
                    </div>
                    <h4 className="font-display text-lg leading-snug">{m.title}</h4>
                    {m.kind === 'step' && m.projectTitle && (
                      <p className="-mt-2 text-xs text-fg-tertiary">
                        {t('matches.stepIn', { project: m.projectTitle })}
                        {m.estimatedHrs != null && <> · {t('estimatedHours', { hours: m.estimatedHrs })}</>}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {m.direct.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-amber-500/40 bg-amber-500/[0.10] px-2.5 py-[3px] text-[11px] text-amber-500"
                        >
                          {skill}
                        </span>
                      ))}
                      {m.related.slice(0, Math.max(0, 3 - m.direct.length)).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-blue-400/40 bg-blue-500/[0.10] px-2.5 py-[3px] text-[11px] text-blue-300"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <SectionHeader
                eyebrow={t('matches.eyebrow')}
                title={t.rich('matches.emptyHeading', { em })}
              />
              <EmptyState
                icon={Star}
                title={t('matches.emptyTitle')}
                description={t('matches.emptyDescription')}
                actions={
                  <Link
                    href="/profile"
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
                  >
                    {t('matches.addSkills')}
                    <ArrowRight className="size-3.5" strokeWidth={2.5} />
                  </Link>
                }
              >
                {sampleSkills.length > 0 && (
                  <div className="mt-3 flex max-w-[480px] flex-wrap justify-center gap-2">
                    {sampleSkills.map((s) => (
                      <span
                        key={s.name}
                        className="cursor-pointer rounded-full border border-white/[0.08] bg-bg-surface-2 px-3 py-1.5 text-xs text-fg-secondary transition-colors duration-fast hover:border-amber-500 hover:text-amber-500"
                      >
                        + {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </EmptyState>
            </>
          )}
        </section>
      </div>
    </>
  )
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

const PIN_GRADIENTS = [
  'bg-gradient-to-br from-[#1a3d2c] to-[#6b9d7e]',
  'bg-gradient-to-br from-[#5C3600] to-[#B86E00]',
  'bg-gradient-to-br from-[#0E1A2B] to-[#2E5FAA]',
]

function QuickStat({
  value,
  label,
  suffix,
  dimIfZero,
}: {
  value: number
  label: string
  suffix?: string
  dimIfZero?: boolean
}) {
  const isDim = dimIfZero && value === 0
  return (
    <div>
      <div className={`font-display text-3xl leading-none ${isDim ? 'text-fg-tertiary' : 'text-amber-500'}`}>
        {value}
        {suffix && <span className="text-[0.6em]">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  linkLabel,
  linkHref,
  rightContent,
}: {
  eyebrow: string
  title: React.ReactNode
  linkLabel?: string
  linkHref?: string
  rightContent?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-6">
      <div>
        <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
          {eyebrow}
        </div>
        <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
          {title}
        </h2>
      </div>
      {linkLabel && linkHref && (
        <Link
          href={linkHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-500 transition-all hover:gap-2"
        >
          {linkLabel}
          <ArrowRight className="size-3.5" strokeWidth={2.5} />
        </Link>
      )}
      {rightContent}
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-5 py-10 text-center sm:px-8 sm:py-12">
      <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
        <Icon className="size-7" />
      </div>
      <h3 className="font-display text-2xl leading-snug">{title}</h3>
      <p className="max-w-[460px] leading-relaxed text-fg-secondary">{description}</p>
      {children}
      {actions && (
        <div className="mt-3 flex flex-wrap justify-center gap-3">{actions}</div>
      )}
    </div>
  )
}

function StepStatusIndicator({
  status,
  ariaLabel,
  title,
}: {
  status: string
  ariaLabel: string
  title: string
}) {
  // The colour is decorative; the status is announced via a label so it
  // isn't colour-only (also shows as a tooltip on hover).
  if (status === 'needs_help') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        title={title}
        className="flex size-[22px] items-center justify-center rounded-full border-[1.5px] border-amber-500 bg-amber-500/20 shadow-[0_0_8px_rgba(244,165,53,0.4)]"
      >
        <span aria-hidden className="font-display text-[13px] font-bold text-amber-500">!</span>
      </div>
    )
  }
  if (status === 'in_progress') {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        title={title}
        className="flex size-[22px] items-center justify-center rounded-full border-[1.5px] border-blue-500 bg-blue-500/15"
      >
        <span aria-hidden className="size-2 rounded-full bg-blue-300" />
      </div>
    )
  }
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      title={title}
      className="size-[22px] rounded-full border-[1.5px] border-neutral-600"
    />
  )
}

function ChecklistRow({
  done,
  title,
  description,
  ctaLabel,
  href,
  isLast,
}: {
  done: boolean
  title: string
  description: string
  ctaLabel: string
  href?: string
  isLast?: boolean
}) {
  const content = (
    <>
      <div
        className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${done ? 'border-green-500 bg-green-500 text-blue-900' : 'border-[1.5px] border-neutral-600'}`}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </div>
      <div className="flex flex-col gap-1">
        <span className={`text-base font-medium ${done ? 'text-fg-tertiary line-through' : 'text-fg-primary'}`}>
          {title}
        </span>
        <span className="text-xs text-fg-tertiary">{description}</span>
      </div>
      <span className={`flex items-center gap-1 whitespace-nowrap text-sm font-medium ${done ? 'text-fg-tertiary' : 'text-amber-500'}`}>
        {ctaLabel}
        {!done && <ArrowRight className="size-3" strokeWidth={2.5} />}
      </span>
    </>
  )

  const className = `grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 transition-colors duration-fast hover:bg-bg-surface-2 sm:gap-5 sm:px-6 sm:py-5 ${!isLast ? 'border-b border-white/[0.08]' : ''}`

  if (href && !done) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    )
  }
  return <div className={className}>{content}</div>
}
