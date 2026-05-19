import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { db } from '@/lib/db'
import {
  MapPin,
  Clock,
  Calendar,
  Share2,
  MoreHorizontal,
  Pencil,
  Star,
  Users as UsersIcon,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  UserProfileProjects,
  type ProfileProject,
} from '@/components/platform/user-profile-projects'

/* ================================================================
   /users/[id] — public profile view.
   Renders any user's bio, skills, stats, and projects. Self-view
   swaps the "Send a message / Invite" CTAs for an "Edit profile"
   shortcut into /profile.
   ================================================================ */

interface Params {
  params: Promise<{ id: string }>
}

const TYPE_IMG_KEY: Record<string, string> = {
  'Community Energy': 'energy',
  'Urban Rewilding': 'rewild',
  'Repair & Reuse': 'circular',
  'Policy Advocacy': 'policy',
  'Food & Agriculture': 'food',
  'Transport & Mobility': 'mobility',
  'Water & Conservation': 'water',
  'Education & Awareness': 'education',
  Biodiversity: 'rewild',
  'Waste Reduction': 'circular',
  'Climate Finance': 'energy',
  'Research & Data': 'policy',
  'Built Environment': 'mobility',
  'Ocean & Marine': 'water',
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function joinedLabel(d: Date): string {
  return `Joined ${d.toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`
}

const LEVEL_LABEL = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
} as const

export default async function UserProfilePage({ params }: Params) {
  const { id } = await params
  const { userId: viewerId } = await auth()
  if (!viewerId) redirect('/sign-in')

  const [user, stepsShipped, blueprintAggregate] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bio: true,
        location: true,
        timezone: true,
        avatarUrl: true,
        createdAt: true,
        skills: {
          orderBy: { createdAt: 'asc' },
          select: {
            proficiency: true,
            isSeeking: true,
            skill: { select: { id: true, name: true, category: true } },
          },
        },
        contributions: {
          where: { projectStepId: null, status: 'active' },
          orderBy: { joinedAt: 'desc' },
          select: {
            role: true,
            joinedAt: true,
            hoursContributed: true,
            project: {
              select: {
                id: true,
                title: true,
                status: true,
                location: true,
                updatedAt: true,
                projectType: { select: { name: true } },
                steps: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    }),
    db.projectStep.count({
      where: { assignedToId: id, status: 'completed' },
    }),
    db.blueprint.aggregate({
      where: { createdById: id },
      _count: { _all: true },
      _sum: { reuseCount: true },
    }),
  ])

  if (!user) notFound()

  const isSelf = viewerId === user.id

  // ─── Stats ────────────────────────────────────────────────
  const activeProjects = user.contributions.filter(
    (c) =>
      c.project.status === 'defining' ||
      c.project.status === 'needs_help' ||
      c.project.status === 'in_progress',
  )
  const finishedProjects = user.contributions.filter(
    (c) => c.project.status === 'completed',
  )
  const totalProjects = activeProjects.length + finishedProjects.length
  const totalHours = user.contributions.reduce((n, c) => n + c.hoursContributed, 0)

  // ─── Bio paragraphs (\n\n separated) ──────────────────────
  const bioParagraphs = (user.bio ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  // ─── Skills ───────────────────────────────────────────────
  const skills = user.skills.map((us) => ({
    name: us.skill.name,
    category: us.skill.category,
    proficiency: us.proficiency,
    isSeeking: us.isSeeking,
  }))

  // ─── Project cards ───────────────────────────────────────
  const buildProjectCard = (
    c: (typeof user.contributions)[number],
  ): ProfileProject => {
    const p = c.project
    const totalSteps = p.steps.length
    const doneSteps = p.steps.filter((s) => s.status === 'completed').length
    const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0
    const status: ProfileProject['status'] =
      p.status === 'completed' ? 'finished' : 'active'
    return {
      id: p.id,
      title: p.title,
      type: p.projectType?.name ?? 'Other',
      imgKey: (p.projectType?.name && TYPE_IMG_KEY[p.projectType.name]) ?? 'rewild',
      location: p.location ?? 'Remote',
      role: c.role,
      status,
      progress,
      since: status === 'active'
        ? `Joined ${c.joinedAt.toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`
        : `Wrapped ${p.updatedAt.toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`,
    }
  }

  const projectCards: ProfileProject[] = user.contributions.map(buildProjectCard)

  // ─── Render ──────────────────────────────────────────────
  const initials = initialsFor(user.name)
  const stats = {
    projects: { total: totalProjects, active: activeProjects.length, finished: finishedProjects.length },
    hours: totalHours,
    stepsShipped,
    blueprints: {
      count: blueprintAggregate._count._all,
      forked: blueprintAggregate._sum.reuseCount ?? 0,
    },
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="flex min-w-0 items-center gap-2 text-sm text-fg-tertiary">
          <Link
            href="/projects"
            className="hidden transition-colors duration-fast hover:text-fg-primary sm:inline"
          >
            Discover
          </Link>
          <span className="hidden opacity-50 sm:inline">/</span>
          <span className="hidden text-fg-secondary sm:inline">People</span>
          <span className="hidden opacity-50 sm:inline">/</span>
          <span className="truncate font-medium text-fg-primary">{user.name}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="hidden size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary sm:flex"
            title="Share"
          >
            <Share2 className="size-4" />
          </button>
          <button
            type="button"
            className="hidden size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary sm:flex"
            title="More"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 p-4 sm:gap-10 sm:p-6 lg:p-10">
        {/* ── Hero ── */}
        <section className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[168px_1fr] sm:gap-8 lg:grid-cols-[168px_1fr_auto]">
          <div
            className="relative flex size-[120px] items-center justify-center self-start overflow-hidden rounded-full border-4 border-bg-surface bg-gradient-to-br from-[#B86E00] via-amber-500 to-amber-300 font-display text-[52px] font-normal text-amber-900 shadow-md after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] sm:size-[168px] sm:text-[72px]"
          >
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name}
                fill
                sizes="168px"
                className="rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          <div className="min-w-0">
            <h1 className="mb-3 flex flex-wrap items-center gap-3 font-display text-[clamp(36px,4vw,52px)] font-normal leading-none tracking-tight">
              {user.name}
            </h1>
            {bioParagraphs[0] && (
              <p className="mb-4 max-w-[560px] text-base leading-relaxed text-fg-secondary sm:text-lg">
                {bioParagraphs[0]}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-fg-tertiary sm:gap-5">
              {user.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {user.location}
                </span>
              )}
              {user.timezone && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {user.timezone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {joinedLabel(user.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-row flex-wrap items-start gap-2 lg:flex-col lg:items-end">
            {isSelf ? (
              <Link
                href="/profile"
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
              >
                <Pencil className="size-3.5" strokeWidth={2.5} />
                Edit profile
              </Link>
            ) : (
              <>
                <Link
                  href={`/messages?to=${user.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-glow-amber transition-all duration-standard hover:bg-amber-400"
                >
                  <MessageSquare className="size-3.5" strokeWidth={2.5} />
                  Send a message
                </Link>
                <button
                  type="button"
                  disabled
                  title="Project invites are coming soon"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary opacity-60"
                >
                  <UsersIcon className="size-3.5" strokeWidth={2.5} />
                  Invite to a project
                </button>
              </>
            )}
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface sm:grid-cols-4">
          <Stat
            num={stats.projects.total}
            accent
            label="Projects"
            sub={
              stats.projects.total === 0
                ? '—'
                : `${stats.projects.active} active · ${stats.projects.finished} finished`
            }
            divider
          />
          <Stat
            num={stats.hours}
            label="Contributed"
            unit="h"
            sub={stats.hours === 0 ? '—' : 'Across all projects'}
            divider
          />
          <Stat
            num={stats.stepsShipped}
            label="Steps shipped"
            sub={stats.stepsShipped === 0 ? '—' : 'Completed by them'}
            divider
          />
          <Stat
            num={stats.blueprints.count}
            label="Blueprints"
            sub={
              stats.blueprints.count === 0
                ? '—'
                : `Forked ${stats.blueprints.forked} ${stats.blueprints.forked === 1 ? 'time' : 'times'}`
            }
          />
        </section>

        {/* ── About ── */}
        <section>
          <SectionHead eyebrow="About" title={`What ${user.name.split(' ')[0]} cares about.`} />
          {bioParagraphs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-bg-surface px-6 py-8 text-center text-sm text-fg-tertiary">
              {isSelf ? (
                <>
                  You haven’t written a bio yet.{' '}
                  <Link href="/profile" className="text-amber-500 hover:underline">
                    Add one
                  </Link>{' '}
                  to help leads understand what drives you.
                </>
              ) : (
                <>{user.name} hasn’t written a bio yet.</>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-5 sm:p-6 lg:p-8">
              <div className="max-w-[720px] space-y-4 text-base leading-relaxed text-fg-secondary">
                {bioParagraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Skills ── */}
        <section>
          <SectionHead eyebrow="Skills" title={`What ${user.name.split(' ')[0]} brings.`} />
          {skills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-bg-surface px-6 py-8 text-center text-sm text-fg-tertiary">
              {isSelf ? (
                <>
                  No skills on your profile yet.{' '}
                  <Link href="/profile" className="text-amber-500 hover:underline">
                    Add some
                  </Link>{' '}
                  so projects can find you.
                </>
              ) : (
                <>{user.name} hasn’t listed any skills yet.</>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {skills.map((s) => (
                <SkillCard key={s.name} skill={s} />
              ))}
            </div>
          )}
        </section>

        {/* ── Projects ── */}
        <section>
          <SectionHead eyebrow="Projects" title={`What ${user.name.split(' ')[0]} is doing.`} />
          <UserProfileProjects
            active={projectCards.filter((p) => p.status === 'active')}
            finished={projectCards.filter((p) => p.status === 'finished')}
          />
        </section>
      </div>
    </div>
  )
}

/* ================================================================
   Sub-components
   ================================================================ */

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-5">
      <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
        {title}
      </h2>
    </header>
  )
}

function Stat({
  num,
  unit,
  label,
  sub,
  accent,
  divider,
}: {
  num: number
  unit?: string
  label: string
  sub: string
  accent?: boolean
  divider?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-5 py-5 sm:px-6',
        divider && 'sm:border-r sm:border-white/[0.08]',
      )}
    >
      <span className="font-display text-3xl leading-none">
        {accent ? (
          <em className="not-italic text-amber-500">{num}</em>
        ) : (
          <span className="text-fg-primary">{num}</span>
        )}
        {unit && <span className="text-[0.55em] text-fg-tertiary">{unit}</span>}
      </span>
      <span className="text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </span>
      <span className="mt-0.5 text-xs text-fg-tertiary">{sub}</span>
    </div>
  )
}

function SkillCard({
  skill,
}: {
  skill: { name: string; category: string; proficiency: 'beginner' | 'intermediate' | 'expert'; isSeeking: boolean }
}) {
  const levelClass = (() => {
    if (skill.proficiency === 'beginner') return 'text-blue-300 bg-blue-500/[0.10] border-blue-500/30'
    if (skill.proficiency === 'intermediate')
      return 'text-blue-200 bg-blue-500/[0.20] border-blue-500/45'
    return 'text-amber-500 bg-amber-500/[0.12] border-amber-500/40'
  })()
  const filledBars = skill.proficiency === 'beginner' ? 1 : skill.proficiency === 'intermediate' ? 2 : 3

  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border bg-bg-surface px-5 py-4 transition-colors',
        skill.isSeeking
          ? 'border-amber-500/25 bg-[linear-gradient(90deg,rgba(244,165,53,0.05),var(--color-bg-surface)_60%)]'
          : 'border-white/[0.08] hover:border-neutral-700',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg-primary">
          <span>{skill.name}</span>
          <span className="rounded-full border border-white/[0.08] bg-bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            {skill.category}
          </span>
        </div>
        {skill.isSeeking ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
            <Star className="size-3 fill-amber-500" strokeWidth={0} />
            Open to projects needing this
          </span>
        ) : (
          <span className="text-xs italic text-fg-tertiary">Has it, but not chasing more of it</span>
        )}
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
          levelClass,
        )}
      >
        <span className="inline-flex gap-[2px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                'h-2.5 w-1 rounded-[1px]',
                i < filledBars ? 'bg-current opacity-100' : 'bg-current opacity-25',
              )}
            />
          ))}
        </span>
        {LEVEL_LABEL[skill.proficiency]}
      </span>
    </div>
  )
}
