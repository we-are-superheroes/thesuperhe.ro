'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  Search,
  Bell,
  Plus,
  MapPin,
  Clock,
  Star,
  Users,
  AlertCircle,
  LayoutGrid,
  List as ListIcon,
  FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectBox } from '@/components/platform/project-form-bits'
import { ProjectStatusBadge } from '@/components/platform/project-status-badge'

/* ================================================================
   Types
   ================================================================ */

type CardStepStatus = 'needs_help' | 'in_progress' | 'open' | 'done'

export interface MyProject {
  id: string
  title: string
  type: string
  imgKey: string
  coverImageUrl: string | null
  location: string
  role: string // ContributionRole — lead | contributor
  status: 'active' | 'finished' | 'archived'
  /** Raw ProjectStatus for the shared status badge. */
  projectStatus: string
  progress: number
  contributors: number
  contributorInitials: string[]
  lastActivity: string
  lastActivityMs: number
  hoursContributed: number
  nextStep: {
    id: string
    name: string
    status: CardStepStatus
    due: string
    urgent: boolean
    dueSort: number
  } | null
}

type Tab = 'active' | 'finished' | 'archived'
type RoleFilter = 'all' | 'lead' | 'contributor' | 'needs_action'
type SortKey = 'recent' | 'due' | 'progress' | 'title'

/* ================================================================
   Image-key → tailwind gradient
   ================================================================ */

const IMG_CLASS: Record<string, string> = {
  energy:
    '[background:radial-gradient(circle_at_60%_40%,#4A7FD4_0%,transparent_60%),linear-gradient(135deg,#0E1A2B,#2E5FAA)]',
  rewild:
    '[background:radial-gradient(circle_at_70%_60%,#4a8b6e_0%,transparent_60%),linear-gradient(135deg,#1a3d2c,#6b9d7e)]',
  circular:
    '[background:radial-gradient(circle_at_30%_50%,#f4a535_0%,transparent_70%),linear-gradient(160deg,#5C3600,#B86E00)]',
  policy:
    '[background:radial-gradient(circle_at_50%_30%,#B2D0F5_0%,transparent_65%),linear-gradient(160deg,#152236,#1B3A6B)]',
  food: '[background:radial-gradient(circle_at_25%_70%,#7DD3B0_0%,transparent_70%),linear-gradient(135deg,#1A5C40,#3DAF7C)]',
  mobility:
    '[background:radial-gradient(circle_at_70%_30%,#FAD08F_0%,transparent_60%),linear-gradient(160deg,#2E1A00,#8A5200)]',
  water: '[background:radial-gradient(circle_at_30%_50%,#7AAEE8_0%,transparent_65%),linear-gradient(135deg,#060D18,#1B3A6B)]',
  education:
    '[background:radial-gradient(circle_at_60%_50%,#F7BD64_0%,transparent_60%),linear-gradient(135deg,#2A3A52,#5A7090)]',
}

const AVATAR_PALETTE = [
  'bg-gradient-to-br from-[#4a8b6e] to-[#3DAF7C]',
  'bg-gradient-to-br from-[#4A7FD4] to-[#7AAEE8]',
  'bg-gradient-to-br from-[#F4A535] to-[#F7BD64]',
  'bg-gradient-to-br from-[#7DD3B0] to-[#3DAF7C]',
  'bg-gradient-to-br from-[#B2D0F5] to-[#4A7FD4]',
  'bg-gradient-to-br from-[#FAD08F] to-[#F4A535]',
]

type MyProjectsT = ReturnType<typeof useTranslations<'myProjects'>>

function roleLabel(t: MyProjectsT, role: string): string {
  if (role === 'lead' || role === 'contributor') return t(`role.${role}`)
  return role
}

/* ================================================================
   Component
   ================================================================ */

export function MyProjectsClient({
  projects,
  stats,
}: {
  projects: MyProject[]
  stats: { active: number; openSteps: number; totalHours: number }
}) {
  const t = useTranslations('myProjects')
  const [tab, setTab] = useState<Tab>('active')
  const [role, setRole] = useState<RoleFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  // Counts per tab/role bucket
  const tabCounts = useMemo(
    () => ({
      active: projects.filter((p) => p.status === 'active').length,
      finished: projects.filter((p) => p.status === 'finished').length,
      archived: projects.filter((p) => p.status === 'archived').length,
    }),
    [projects],
  )

  const roleCounts = useMemo(() => {
    const inTab = projects.filter((p) => p.status === tab)
    return {
      all: inTab.length,
      lead: inTab.filter((p) => p.role === 'lead').length,
      contributor: inTab.filter((p) => p.role === 'contributor').length,
      needs_action: inTab.filter((p) => p.nextStep?.urgent).length,
    }
  }, [projects, tab])

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        if (p.status !== tab) return false
        if (query.trim()) {
          const q = query.trim().toLowerCase()
          if (!`${p.title} ${p.location} ${p.type}`.toLowerCase().includes(q)) return false
        }
        if (role === 'needs_action') return !!p.nextStep?.urgent
        if (role !== 'all' && p.role !== role) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'recent') return a.lastActivityMs - b.lastActivityMs
        if (sort === 'due')
          return (a.nextStep?.dueSort ?? 99999) - (b.nextStep?.dueSort ?? 99999)
        if (sort === 'progress') return b.progress - a.progress
        if (sort === 'title') return a.title.localeCompare(b.title)
        return 0
      })
  }, [projects, tab, role, query, sort])

  const resetFilters = () => {
    setQuery('')
    setRole('all')
  }

  return (
    <>
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="relative order-2 w-full min-w-0 max-w-[480px] flex-1 sm:order-1 sm:w-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('topbar.searchPlaceholder')}
            className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
        <div className="order-1 flex items-center gap-3 sm:order-2">
          <button
            type="button"
            className="hidden size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary sm:flex"
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
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 overflow-y-auto p-4 sm:p-6 lg:p-10">
        {/* Page header */}
        <section className="flex flex-col items-start gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div>
            <h1 className="mb-3 font-display text-[clamp(32px,7vw,52px)] font-normal leading-none tracking-tight">
              {t.rich('hero.title', {
                em: (chunks) => <em className="italic text-amber-500">{chunks}</em>,
              })}
            </h1>
            <p className="max-w-[560px] text-base leading-relaxed text-fg-secondary sm:text-lg">
              {t('hero.subtitle')}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4 sm:gap-8 sm:px-6 sm:py-5 lg:w-auto">
            <QuickStat value={stats.active} label={t('stats.active')} dimIfZero />
            <QuickStat value={stats.openSteps} label={t('stats.openSteps')} dimIfZero />
            <QuickStat
              value={stats.totalHours}
              label={t('stats.contributed')}
              suffix={t('stats.hoursSuffix')}
              dimIfZero
            />
          </div>
        </section>

        {/* Tabs */}
        <div className="-mb-px flex gap-2 border-b border-white/[0.08]">
          <TabButton
            active={tab === 'active'}
            label={t('tabs.active')}
            count={tabCounts.active}
            onClick={() => {
              setTab('active')
              setRole('all')
            }}
          />
          <TabButton
            active={tab === 'finished'}
            label={t('tabs.finished')}
            count={tabCounts.finished}
            onClick={() => {
              setTab('finished')
              setRole('all')
            }}
          />
          <TabButton
            active={tab === 'archived'}
            label={t('tabs.archived')}
            count={tabCounts.archived}
            onClick={() => {
              setTab('archived')
              setRole('all')
            }}
          />
        </div>

        {/* Tools */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <FilterPill active={role === 'all'} label={t('roleFilter.all')} count={roleCounts.all} onClick={() => setRole('all')} />
            <FilterPill
              active={role === 'lead'}
              icon={<Star className="size-3.5" strokeWidth={2.5} />}
              label={t('roleFilter.leading')}
              count={roleCounts.lead}
              onClick={() => setRole('lead')}
            />
            <FilterPill
              active={role === 'contributor'}
              icon={<Users className="size-3.5" strokeWidth={2.5} />}
              label={t('roleFilter.contributing')}
              count={roleCounts.contributor}
              onClick={() => setRole('contributor')}
            />
            <FilterPill
              active={role === 'needs_action'}
              icon={<AlertCircle className="size-3.5" strokeWidth={2.5} />}
              label={t('roleFilter.needsAction')}
              count={roleCounts.needs_action}
              onClick={() => setRole('needs_action')}
            />
          </div>
          <div className="flex items-center gap-3">
            <SelectBox
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-auto cursor-pointer bg-bg-surface py-2 pl-3 pr-8 [background-position:right_10px_center]"
            >
              <option value="recent">{t('sort.recent')}</option>
              <option value="due">{t('sort.due')}</option>
              <option value="progress">{t('sort.progress')}</option>
              <option value="title">{t('sort.title')}</option>
            </SelectBox>
            <div className="flex rounded-lg border border-neutral-700 bg-bg-surface p-[3px]">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'flex items-center rounded-md border-none px-2.5 py-1.5 transition-colors',
                  view === 'grid' ? 'bg-bg-surface-2 text-fg-primary' : 'bg-transparent text-fg-tertiary',
                )}
                title={t('view.grid')}
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center rounded-md border-none px-2.5 py-1.5 transition-colors',
                  view === 'list' ? 'bg-bg-surface-2 text-fg-primary' : 'bg-transparent text-fg-tertiary',
                )}
                title={t('view.list')}
              >
                <ListIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <EmptyState tab={tab} hasFilters={!!query.trim() || role !== 'all'} onReset={resetFilters} />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface">
            <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_1fr] gap-4 border-b border-white/[0.08] bg-bg-surface-2 px-6 py-3.5 text-xs font-semibold uppercase tracking-widest text-fg-tertiary lg:grid">
              <span>{t('listHeader.project')}</span>
              <span>{t('listHeader.nextStep')}</span>
              <span>{t('listHeader.role')}</span>
              <span>{t('listHeader.progress')}</span>
            </div>
            {filtered.map((p) => (
              <ProjectListRow key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ================================================================
   Sub-components
   ================================================================ */

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
  const dim = dimIfZero && value === 0
  return (
    <div>
      <div className={cn('font-display text-3xl leading-none', dim ? 'text-fg-tertiary' : 'text-amber-500')}>
        {value}
        {suffix && <span className="text-[0.6em]">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
    </div>
  )
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors',
        active
          ? 'border-amber-500 font-medium text-amber-500'
          : 'border-transparent text-fg-tertiary hover:text-fg-secondary',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-2 py-px text-[11px] font-semibold',
          active ? 'bg-amber-500/[0.18] text-amber-500' : 'bg-bg-surface-2 text-fg-tertiary',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function FilterPill({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  icon?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-all',
        active
          ? 'border-amber-500/40 bg-amber-500/[0.12] text-amber-500'
          : 'border-neutral-700 bg-bg-surface text-fg-secondary hover:border-neutral-600 hover:text-fg-primary',
      )}
    >
      {icon}
      {label}
      <span className={cn('ml-0.5 text-[11px]', active ? 'text-amber-500/85' : 'text-fg-tertiary')}>
        {count}
      </span>
    </button>
  )
}

function RoleBadge({ role }: { role: string }) {
  const t = useTranslations('myProjects')
  const className = (() => {
    if (role === 'lead') return 'border-amber-500/40 bg-amber-500/[0.10] text-amber-500'
    if (role === 'contributor') return 'border-blue-500/40 bg-blue-500/[0.10] text-blue-300'
    return 'border-neutral-700 bg-bg-surface-2 text-fg-secondary'
  })()
  const Icon = role === 'lead' ? Star : Users
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] font-semibold',
        className,
      )}
    >
      <Icon className="size-2.5" strokeWidth={2.5} />
      {roleLabel(t, role)}
    </span>
  )
}

function StepStatusDot({ status }: { status: CardStepStatus }) {
  if (status === 'needs_help') {
    return (
      <div className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-amber-500 bg-amber-500/[0.18] shadow-[0_0_8px_rgba(244,165,53,0.4)]">
        <span className="font-display text-xs font-bold text-amber-500">!</span>
      </div>
    )
  }
  if (status === 'in_progress') {
    return (
      <div className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-blue-500 bg-blue-500/15">
        <span className="size-2 rounded-full bg-blue-300" />
      </div>
    )
  }
  if (status === 'open') {
    return (
      <div className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-neutral-600 bg-bg-surface-2">
        <span className="size-2 rounded-full border border-fg-tertiary" />
      </div>
    )
  }
  return (
    <div className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-green-500 bg-green-500 text-blue-900">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  )
}

function AvatarStack({ initials, total }: { initials: string[]; total: number }) {
  const visible = initials.slice(0, 4)
  const more = Math.max(0, total - visible.length)
  return (
    <div className="flex">
      {visible.map((letter, i) => (
        <div
          key={i}
          className={cn(
            '-ml-[7px] flex size-[22px] items-center justify-center rounded-full border-2 border-bg-surface text-[10px] font-semibold text-blue-900 first:ml-0',
            AVATAR_PALETTE[(letter.charCodeAt(0) || 65) % AVATAR_PALETTE.length],
          )}
        >
          {letter}
        </div>
      ))}
      {more > 0 && (
        <div className="-ml-[7px] flex size-[22px] items-center justify-center rounded-full border-2 border-bg-surface bg-bg-surface-3 text-[10px] font-semibold text-fg-secondary">
          +{more}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project: p }: { project: MyProject }) {
  const t = useTranslations('myProjects')
  return (
    <Link
      href={`/projects/${p.id}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface transition-all duration-standard hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md',
        p.status === 'archived' && 'opacity-70',
      )}
    >
      {/* Cover */}
      <div className={cn('relative aspect-[16/8] overflow-hidden', !p.coverImageUrl && (IMG_CLASS[p.imgKey] ?? IMG_CLASS.rewild))}>
        {p.coverImageUrl && (
          <Image
            src={p.coverImageUrl}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        )}
        <span className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-neutral-700 bg-blue-900/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fg-primary backdrop-blur-sm">
            {p.type}
          </span>
          <ProjectStatusBadge status={p.projectStatus} className="bg-blue-900/85 backdrop-blur-sm" />
        </span>
        <span
          className={cn(
            'absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border bg-blue-900/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm',
            p.role === 'lead' && 'border-amber-500/40 text-amber-500',
            p.role === 'contributor' && 'border-blue-500/40 text-blue-300',
          )}
        >
          {(() => {
            const Icon = p.role === 'lead' ? Star : Users
            return <Icon className="size-2.5" strokeWidth={2.5} />
          })()}
          {roleLabel(t, p.role)}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-xs text-fg-tertiary">
          <MapPin className="size-3 shrink-0" />
          {p.location}
          <span className="mx-1 text-neutral-600">·</span>
          {t('card.lastActivity', { when: p.lastActivity })}
        </div>
        <h3 className="font-display text-xl leading-snug">{p.title}</h3>

        {/* My next step */}
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-bg-base p-3">
          {p.nextStep ? (
            <>
              <StepStatusDot status={p.nextStep.status} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-fg-primary">
                  {p.nextStep.name}
                </span>
                <span
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    p.nextStep.urgent ? 'text-amber-500' : 'text-fg-tertiary',
                  )}
                >
                  <Clock className="size-3" />
                  {p.nextStep.due}
                </span>
              </div>
            </>
          ) : (
            <span className="italic text-sm text-fg-tertiary">{t('card.noOpenSteps')}</span>
          )}
        </div>

        {/* Foot */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs text-fg-tertiary">
          <AvatarStack initials={p.contributorInitials} total={p.contributors} />
          <div className="mx-3 h-[3px] max-w-[140px] flex-1 overflow-hidden rounded-sm bg-bg-surface-2">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
              style={{ width: `${p.progress}%` }}
            />
          </div>
          <span>
            <strong className="font-semibold text-fg-primary">
              {t('card.percent', { progress: p.progress })}
            </strong>
          </span>
        </div>
      </div>
    </Link>
  )
}

function ProjectListRow({ project: p }: { project: MyProject }) {
  const t = useTranslations('myProjects')
  return (
    <Link
      href={`/projects/${p.id}`}
      className={cn(
        'flex flex-col gap-3 border-b border-white/[0.08] px-4 py-4 transition-colors duration-fast last:border-b-0 hover:bg-bg-surface-2 sm:px-6 sm:py-5 lg:grid lg:grid-cols-[1.4fr_1fr_0.7fr_1fr] lg:items-center lg:gap-4',
        p.status === 'archived' && 'opacity-65',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'relative size-10 shrink-0 overflow-hidden rounded-lg',
            !p.coverImageUrl && (IMG_CLASS[p.imgKey] ?? IMG_CLASS.rewild),
          )}
        >
          {p.coverImageUrl && (
            <Image src={p.coverImageUrl} alt="" fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="truncate font-display text-base leading-tight text-fg-primary">
              {p.title}
            </span>
            <ProjectStatusBadge status={p.projectStatus} className="shrink-0" />
          </span>
          <span className="truncate text-xs text-fg-tertiary">
            {p.location} · {p.type} · {p.lastActivity}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {p.nextStep ? (
          <>
            <StepStatusDot status={p.nextStep.status} />
            <span className="truncate">{p.nextStep.name}</span>
          </>
        ) : (
          <span className="italic text-fg-tertiary">{t('listRow.noOpenStep')}</span>
        )}
      </div>
      <RoleBadge role={p.role} />
      <div className="flex flex-col gap-1 text-xs text-fg-tertiary">
        <div className="h-[3px] overflow-hidden rounded-sm bg-bg-surface-2">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
            style={{ width: `${p.progress}%` }}
          />
        </div>
        <span>
          {t('listRow.progressSummary', { progress: p.progress, count: p.contributors })}
        </span>
      </div>
    </Link>
  )
}

function EmptyState({
  tab,
  hasFilters,
  onReset,
}: {
  tab: Tab
  hasFilters: boolean
  onReset: () => void
}) {
  const t = useTranslations('myProjects')
  let title: string
  let desc: string
  let actions: React.ReactNode = null

  if (tab === 'active') {
    title = hasFilters ? t('empty.activeFilteredTitle') : t('empty.activeTitle')
    desc = hasFilters ? t('empty.activeFilteredDescription') : t('empty.activeDescription')
    actions = hasFilters ? (
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
      >
        {t('empty.clearFilters')}
      </button>
    ) : (
      <>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
        >
          {t('empty.browseProjects')}
        </Link>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
        >
          {t('empty.startYourOwn')}
        </Link>
      </>
    )
  } else if (tab === 'finished') {
    title = t('empty.finishedTitle')
    desc = t('empty.finishedDescription')
  } else {
    title = t('empty.archivedTitle')
    desc = t('empty.archivedDescription')
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
      <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
        <FolderOpen className="size-7" />
      </div>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="max-w-[460px] text-base leading-relaxed text-fg-secondary">{desc}</p>
      {actions && <div className="mt-3 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  )
}
