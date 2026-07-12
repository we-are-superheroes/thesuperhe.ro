import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import Image from 'next/image'
import { ChevronRight, MapPin, Globe, Calendar, FolderOpen, Clock, User, Pencil, ExternalLink } from 'lucide-react'
import { ShareButton } from '@/components/platform/share-button'
import { googleMapsUrl } from '@/lib/location'
import { resolveLocale } from '@/lib/locale'
import { fmtLongDate } from '@/lib/format'
import { ProjectStepsList, type StepCardData } from '@/components/platform/project-steps-list'
import { JoinProjectTopButton, JoinProjectCard } from '@/components/platform/join-project-controls'
import { AdminDeleteButton } from '@/components/platform/admin-delete-button'
import {
  ProjectTabsProvider,
  ProjectTabBar,
  ProjectTabPanel,
} from '@/components/platform/project-tabs'
import {
  ProjectUpdatesPanel,
  LatestUpdateTeaser,
  type UpdatesFeedItem,
} from '@/components/platform/project-updates'
import { isCurrentUserAdmin } from '@/lib/auth'
import { canViewProject } from '@/lib/orgs'
import { normaliseStepStatus, stepNeedsHelp } from '@/lib/step-status'
import { AVATAR_GRADIENTS, initialOf, initialsOf } from '@/lib/avatar'

/* ================================================================
   PROJECT VIEW — server component
   Loads a single project (with steps, skills, contributions, type)
   and renders the full project page. Anything missing falls back
   to an empty placeholder rather than fake content.
   ================================================================ */

const TYPE_COVER_GRADIENT: Record<string, string> = {
  'Community Energy': 'radial-gradient(circle at 60% 40%, #4A7FD4 0%, transparent 60%), linear-gradient(135deg, #0E1A2B, #2E5FAA)',
  'Urban Rewilding': 'radial-gradient(circle at 70% 60%, #4a8b6e 0%, transparent 60%), linear-gradient(135deg, #1a3d2c, #6b9d7e)',
  'Repair & Reuse': 'radial-gradient(circle at 30% 50%, #f4a535 0%, transparent 70%), linear-gradient(160deg, #5C3600, #B86E00)',
  'Policy Advocacy': 'radial-gradient(circle at 50% 30%, #B2D0F5 0%, transparent 65%), linear-gradient(160deg, #152236, #1B3A6B)',
  'Food & Agriculture': 'radial-gradient(circle at 25% 70%, #7DD3B0 0%, transparent 70%), linear-gradient(135deg, #1A5C40, #3DAF7C)',
  'Transport & Mobility': 'radial-gradient(circle at 70% 30%, #FAD08F 0%, transparent 60%), linear-gradient(160deg, #2E1A00, #8A5200)',
  'Water & Conservation': 'radial-gradient(circle at 30% 50%, #7AAEE8 0%, transparent 65%), linear-gradient(135deg, #060D18, #1B3A6B)',
  'Education & Awareness': 'radial-gradient(circle at 60% 50%, #F7BD64 0%, transparent 60%), linear-gradient(135deg, #2A3A52, #5A7090)',
  'Biodiversity': 'radial-gradient(circle at 40% 50%, #7DD3B0 0%, transparent 60%), linear-gradient(135deg, #0E2A1E, #1A5C40)',
  'Waste Reduction': 'radial-gradient(circle at 30% 50%, #f4a535 0%, transparent 70%), linear-gradient(160deg, #5C3600, #B86E00)',
}

function formatDate(d: Date, locale: string): string {
  return fmtLongDate(d, locale)
}

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
}

interface ProjectViewParams {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProjectViewParams) {
  const { id } = await params
  const project = await db.project.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      coverImageUrl: true,
      location: true,
      visibility: true,
    },
  })
  if (!project) return { title: 'Project not found — The Superhero' }
  // Members-only projects don't leak their title into tags/crawlers.
  if (project.visibility !== 'public') {
    return { title: 'Members-only project — The Superhero' }
  }
  const description = project.description.split(/\n+/)[0].slice(0, 160)
  return {
    title: `${project.title} — The Superhero`,
    description,
    openGraph: {
      title: project.title,
      description,
      ...(project.coverImageUrl ? { images: [project.coverImageUrl] } : {}),
    },
  }
}

export default async function ProjectViewPage({ params }: ProjectViewParams) {
  const { id } = await params
  const { userId } = await auth()
  const locale = await resolveLocale()

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      location: true,
      address: true,
      remoteOk: true,
      timeCommitmentHrs: true,
      coverImageUrl: true,
      createdAt: true,
      orgId: true,
      visibility: true,
      organisation: { select: { slug: true, name: true, type: true } },
      projectType: { select: { name: true } },
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          helpWanted: true,
          order: true,
          estimatedHrs: true,
          completedAt: true,
          coordinatorId: true,
          coordinator: { select: { id: true, name: true } },
          skills: {
            select: { skill: { select: { id: true, name: true } } },
          },
          contributions: {
            where: { status: 'active' },
            orderBy: { joinedAt: 'asc' },
            select: {
              user: { select: { id: true, name: true } },
            },
          },
          // For the time-log row at the bottom of each step card. Take the
          // 4 most recent for the popover; counts/totals come from another
          // shape below.
          timeLogs: {
            orderBy: { loggedOn: 'desc' },
            take: 4,
            select: {
              id: true,
              hours: true,
              note: true,
              loggedOn: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      },
      contributions: {
        where: {
          status: { in: ['active', 'pending'] },
          projectStepId: null,
        },
        select: {
          role: true,
          status: true,
          joinedAt: true,
          hoursContributed: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!project) notFound()

  // Members-only projects are invisible to everyone outside the owning
  // organisation — same response as a project that doesn't exist.
  if (!(await canViewProject(project, userId))) notFound()

  // Build the public Google Maps URL once — address plus the coarse
  // location so Google can disambiguate; null if neither is set.
  const mapsUrl = googleMapsUrl({
    address: project.address,
    location: project.location,
  })

  // Aggregate time logs across all steps in one round-trip, so each card can
  // render its own summary (total hours, contributors, entry count) without
  // re-querying. Then we already have the 4 most recent entries embedded on
  // each step from the main query.
  const stepIds = project.steps.map((s) => s.id)
  const timeStats = stepIds.length
    ? await db.timeLog.groupBy({
        by: ['projectStepId'],
        where: { projectStepId: { in: stepIds } },
        _sum: { hours: true },
        _count: { _all: true },
      })
    : []
  const timeStatsByStep = new Map(
    timeStats.map((t) => ({
      stepId: t.projectStepId,
      total: t._sum.hours ?? 0,
      count: t._count._all,
    })).map((t) => [t.stepId, t]),
  )

  // Distinct contributors per step from the loaded recent logs. (The full
  // contributor list is bounded by recentLogs anyway, which is fine for a
  // 4-avatar stack; older contributors fold into the "+N earlier entries"
  // line in the panel.)

  // Is the current user already a project-level member?
  // Active membership vs pending approval are now distinct states. A user
  // whose join request is awaiting approval should see "Request sent", not
  // "Joined".
  const myContribution = userId
    ? await db.contribution.findFirst({
        where: { userId, projectId: id, projectStepId: null },
        select: { status: true },
      })
    : null
  const isMember = myContribution?.status === 'active'
  const isPendingApproval = myContribution?.status === 'pending'

  // How many steps am I on for this project? (used to confirm leave)
  const myAssignedStepCount = userId
    ? project.steps.filter((s) =>
        s.contributions.some((c) => c.user?.id === userId),
      ).length
    : 0

  // Is the current user the project lead? Only the lead sees Modify project.
  const isLead = userId
    ? !!(await db.contribution.findFirst({
        where: {
          userId,
          projectId: id,
          projectStepId: null,
          role: 'lead',
          status: { in: ['active', 'pending'] },
        },
        select: { id: true },
      }))
    : false

  // Platform admins can delete any project. The button is gated here, but the
  // delete is authorised again server-side in the action.
  const isAdmin = await isCurrentUserAdmin()

  // ── Updates feed ────────────────────────────────────────────────
  // Members-only posts are visible to active members and platform admins
  // (moderation). Everyone else gets public posts plus a gate showing how
  // many are hidden.
  const canSeeMembersOnly = isMember || isAdmin
  const [updates, hiddenMembersOnlyCount] = await Promise.all([
    db.projectUpdate.findMany({
      where: {
        projectId: id,
        ...(canSeeMembersOnly ? {} : { visibility: 'public' as const }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        body: true,
        visibility: true,
        createdAt: true,
        editedAt: true,
        author: { select: { id: true, name: true } },
      },
    }),
    canSeeMembersOnly
      ? Promise.resolve(0)
      : db.projectUpdate.count({ where: { projectId: id, visibility: 'members' } }),
  ])

  const totalSteps = project.steps.length
  const stepsByStatus = {
    needs_help: project.steps.filter(stepNeedsHelp).length,
    in_progress: project.steps.filter(
      (s) => normaliseStepStatus(s.status, s.contributions.length > 0) === 'in_progress',
    ).length,
    open: project.steps.filter(
      (s) => normaliseStepStatus(s.status, s.contributions.length > 0) === 'open',
    ).length,
    completed: project.steps.filter((s) => s.status === 'completed').length,
  }

  // Find the lead contributor (first contribution with role=lead, fallback to none)
  const lead = project.contributions.find((c) => c.role === 'lead') ?? null

  // Assemble the updates feed: authored posts plus derived milestones
  // (completed steps, members joining), newest first. Author names are always
  // shown — posting is a deliberate public statement by the lead, whose name
  // is already public in the Details card. Joiner names follow the page's
  // existing anonymisation for signed-out viewers.
  const feedItems: UpdatesFeedItem[] = updates.map((u) => ({
    kind: 'update' as const,
    id: u.id,
    body: u.body,
    visibility: u.visibility,
    createdAtMs: u.createdAt.getTime(),
    editedAtMs: u.editedAt?.getTime() ?? null,
    author: u.author ? { id: u.author.id, name: u.author.name } : null,
    isMine: !!userId && u.author?.id === userId,
  }))

  for (const s of project.steps) {
    if (s.status === 'completed' && s.completedAt) {
      feedItems.push({
        kind: 'step_completed',
        id: `step-${s.id}`,
        stepTitle: s.title,
        atMs: s.completedAt.getTime(),
      })
    }
  }

  // Group joins by calendar day so a busy weekend reads as one row. The
  // lead's own creation-day contribution is skipped — "1 person joined —
  // <lead>" on day one would just be noise.
  const joinsByDay = new Map<string, { names: string[]; atMs: number }>()
  for (const c of project.contributions) {
    if (c.status !== 'active' || c.role === 'lead' || !c.user) continue
    const day = c.joinedAt.toISOString().slice(0, 10)
    const entry = joinsByDay.get(day) ?? { names: [], atMs: 0 }
    entry.names.push(userId ? c.user.name : 'Someone')
    entry.atMs = Math.max(entry.atMs, c.joinedAt.getTime())
    joinsByDay.set(day, entry)
  }
  for (const [day, entry] of joinsByDay) {
    feedItems.push({
      kind: 'members_joined',
      id: `join-${day}`,
      names: entry.names,
      atMs: entry.atMs,
    })
  }

  feedItems.sort((a, b) => {
    const ta = a.kind === 'update' ? a.createdAtMs : a.atMs
    const tb = b.kind === 'update' ? b.createdAtMs : b.atMs
    return tb - ta
  })

  const latestUpdate = feedItems.find((f) => f.kind === 'update')
  const memberCount = project.contributions.filter((c) => c.status === 'active').length

  // Hours given across all contributions
  const totalHours = project.contributions.reduce((s, c) => s + c.hoursContributed, 0)

  const created = project.createdAt
  const days = daysSince(created)

  // Status pill text
  const statusText = (() => {
    switch (project.status) {
      case 'defining':
        return 'Being defined'
      case 'needs_help':
        return 'Needs help'
      case 'in_progress':
        return 'In progress'
      case 'completed':
        return 'Completed'
      default:
        return project.status
    }
  })()

  // Cover gradient by project type
  const coverGradient =
    (project.projectType?.name && TYPE_COVER_GRADIENT[project.projectType.name]) ??
    TYPE_COVER_GRADIENT['Urban Rewilding']

  // Shape steps for the client component
  const stepCards: StepCardData[] = project.steps.map((s) => {
    // Joiners are the active step-level contributions. For anonymous viewers
    // we keep the count + coordinator flag but anonymise the names.
    const joiners = s.contributions.map((c) => {
      const name = c.user?.name ?? 'Someone'
      return {
        id: c.user?.id ?? 'anon',
        name: userId ? name : 'Someone',
        initials: userId ? initialsOf(name) : '?',
        isCoordinator: !!s.coordinatorId && s.coordinatorId === c.user?.id,
        isMe: !!userId && c.user?.id === userId,
      }
    })
    const meOnStep = !!userId && joiners.some((j) => j.isMe)

    // Time-log shaping. Anonymise user details for anonymous viewers.
    const stats = timeStatsByStep.get(s.id) ?? { total: 0, count: 0 }
    const recentLogs = s.timeLogs.map((tl) => {
      const name = tl.user?.name ?? 'Someone'
      return {
        id: tl.id,
        hours: tl.hours,
        note: tl.note,
        loggedOnMs: tl.loggedOn.getTime(),
        user: tl.user
          ? {
              id: tl.user.id,
              name: userId ? name : 'Someone',
              initials: userId ? initialsOf(name) : '?',
              isMe: !!userId && tl.user.id === userId,
            }
          : null,
      }
    })
    const seenContrib = new Set<string>()
    const contributors: { id: string; name: string; initials: string }[] = []
    for (const tl of recentLogs) {
      if (!tl.user) continue
      if (seenContrib.has(tl.user.id)) continue
      seenContrib.add(tl.user.id)
      contributors.push({
        id: tl.user.id,
        name: tl.user.name,
        initials: tl.user.initials,
      })
    }

    return {
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
      helpWanted: s.helpWanted,
      order: s.order,
      totalSteps,
      estimatedHrs: s.estimatedHrs,
      joiners,
      meOnStep,
      skills: s.skills.map((ss) => ss.skill.name),
      timeLog: {
        stepId: s.id,
        totalHours: stats.total,
        totalEntryCount: stats.count,
        contributors,
        recentLogs,
      },
    }
  })

  // Description split by paragraph (newlines)
  const descParagraphs = project.description.split(/\n+/).map((p) => p.trim()).filter(Boolean)

  // Contributors for avatar stack (deduped by user id, with id kept so each
  // avatar deep-links to their profile).
  const contributorMap = new Map<string, { id: string; name: string }>()
  for (const c of project.contributions) {
    if (c.user) contributorMap.set(c.user.id, { id: c.user.id, name: c.user.name })
  }
  const contributors = Array.from(contributorMap.values())
  const visibleContributors = contributors.slice(0, 5)
  const moreContributors = Math.max(0, contributors.length - visibleContributors.length)

  return (
    <ProjectTabsProvider projectId={id}>
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:gap-6 sm:px-10 sm:py-5">
        <div className="flex min-w-0 items-center gap-2 text-sm text-fg-tertiary">
          <Link
            href="/projects"
            className="hidden transition-colors duration-fast hover:text-fg-primary sm:inline"
          >
            Browse projects
          </Link>
          <ChevronRight className="hidden size-3 sm:inline" />
          <span className="truncate text-fg-primary">{project.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ShareButton title={project.title} />
          {isLead && (
            <Link
              href={`/projects/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.12] px-3 py-2 text-sm font-medium text-amber-500 transition-all duration-standard hover:-translate-y-px hover:bg-amber-500/[0.18] sm:px-4 sm:py-2.5"
            >
              <Pencil className="size-3.5" strokeWidth={2.5} />
              <span className="hidden sm:inline">Modify project</span>
              <span className="sm:hidden">Modify</span>
            </Link>
          )}
          {isAdmin && (
            <AdminDeleteButton
              kind="project"
              id={id}
              name={project.title}
              redirectTo="/projects"
              variant="icon"
            />
          )}
          <JoinProjectTopButton
            projectId={id}
            projectTitle={project.title}
            isSignedIn={!!userId}
            isMember={isMember}
            isPendingApproval={isPendingApproval}
            myAssignedStepCount={myAssignedStepCount}
          />
        </div>
      </div>

      <div className="overflow-y-auto">
        {/* Cover */}
        <div
          className="relative flex min-h-[280px] items-end overflow-hidden border-b border-white/[0.08] sm:min-h-[360px]"
          style={project.coverImageUrl ? undefined : { background: coverGradient }}
        >
          {project.coverImageUrl && (
            <Image
              src={project.coverImageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-30% to-blue-900/[0.92]" />
          <div className="on-imagery relative z-[1] mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-4 pb-6 pt-10 sm:px-10 sm:pb-8 sm:pt-12">
            <div className="flex flex-wrap items-center gap-3">
              {project.projectType?.name && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/[0.16] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400 backdrop-blur-sm">
                  <span className="size-[5px] rounded-full bg-amber-500 shadow-[0_0_5px_var(--color-amber-500)]" />
                  {project.projectType.name}
                </span>
              )}
              <ProjectStatusPill status={project.status} label={statusText} />
              {project.organisation && (
                <Link
                  href={`/orgs/${project.organisation.slug}?from=/projects/${project.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.15] bg-[rgba(14,26,43,0.6)] px-3 py-1.5 text-xs font-semibold text-fg-primary backdrop-blur-sm transition-colors hover:border-amber-500/50"
                >
                  <span
                    className="flex size-4 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
                    style={{
                      background:
                        project.organisation.type === 'company'
                          ? 'linear-gradient(135deg, #1B3A6B, #4A7FD4)'
                          : 'linear-gradient(135deg, #1A5C40, #3DAF7C)',
                    }}
                  >
                    {project.organisation.name.charAt(0).toUpperCase()}
                  </span>
                  {project.organisation.name}
                </Link>
              )}
              {project.visibility === 'org_members' && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/[0.16] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400 backdrop-blur-sm">
                  Members only
                </span>
              )}
              {isLead && (
                <Link
                  href={`/projects/${id}/edit#sec-status`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary backdrop-blur-sm transition-colors hover:border-amber-500/50 hover:text-amber-500"
                  title="Change project status"
                >
                  <Pencil className="size-3" strokeWidth={2.5} />
                  Change
                </Link>
              )}
            </div>
            {/* Explicit text-fg-primary so the title resolves the token at the
                element — inside .on-imagery that's re-pinned to the light
                (dark-mode) value, so the title stays light on the cover scrim
                in every theme. Plain inheritance would go dark in light themes. */}
            <h1 className="my-2 font-display text-[clamp(40px,5vw,60px)] font-normal leading-none tracking-tight text-fg-primary">
              {project.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-base text-fg-secondary">
              {project.location && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-3.5" />
                  {project.location}
                </span>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-fg-secondary backdrop-blur-sm transition-colors hover:border-amber-500/55 hover:text-amber-500"
                  title={project.address ?? project.location ?? 'Open in Google Maps'}
                >
                  <ExternalLink className="size-3" strokeWidth={2.5} />
                  Open in Google Maps
                </a>
              )}
              {(project.location || mapsUrl) && (project.remoteOk || project.createdAt) && (
                <span className="size-[3px] rounded-full bg-fg-tertiary" />
              )}
              {project.remoteOk && (
                <span className="inline-flex items-center gap-2">
                  <Globe className="size-3.5" />
                  Remote contributors welcome
                </span>
              )}
              {project.remoteOk && project.createdAt && (
                <span className="size-[3px] rounded-full bg-fg-tertiary" />
              )}
              <span className="inline-flex items-center gap-2">
                <Calendar className="size-3.5" />
                Started {formatDate(created, locale)}
              </span>
            </div>
            {project.address && (
              <div className="mt-2 text-sm text-fg-tertiary">
                {project.address}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabBar
          updatesCount={updates.length}
          topOffsetClass={userId ? 'top-0' : 'top-14 sm:top-16'}
        />

        {/* Body */}
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 items-start gap-8 p-4 sm:p-6 lg:grid-cols-[1fr_340px] lg:gap-10 lg:p-10">
          {/* Left column */}
          <div>
            <ProjectTabPanel tab="overview">
            {/* About */}
            <section>
              <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
                About this project
              </div>
              <h2 className="mb-2 font-display text-3xl font-normal leading-tight tracking-tight">
                {project.title}
              </h2>
              {descParagraphs.length > 0 ? (
                <div className="mt-5 flex flex-col gap-4">
                  {descParagraphs.map((para, i) => (
                    <p key={i} className="text-lg leading-relaxed text-fg-secondary">
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <EmptyInline text="No description yet — the project lead hasn’t written one." />
              )}
            </section>

            {latestUpdate?.kind === 'update' && (
              <LatestUpdateTeaser
                authorName={latestUpdate.author?.name ?? 'Former member'}
                body={latestUpdate.body}
                createdAtMs={latestUpdate.createdAtMs}
              />
            )}

            {/* Steps — same tab as the overview; "See open steps" buttons
                scroll here via the anchor. */}
            <section id="steps" className="mt-12 scroll-mt-20">
              <div className="mb-6 flex items-end justify-between gap-6">
                <div>
                  <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
                    Steps to take
                  </div>
                  {totalSteps > 0 ? (
                    <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
                      {totalSteps} step{totalSteps === 1 ? '' : 's'}.{' '}
                      {stepsByStatus.needs_help > 0 ? (
                        <em className="italic text-amber-500">
                          {stepsByStatus.needs_help} need{stepsByStatus.needs_help === 1 ? 's' : ''} help
                        </em>
                      ) : (
                        <em className="italic text-amber-500">making progress</em>
                      )}{' '}
                      right now.
                    </h2>
                  ) : (
                    <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
                      No steps yet.
                    </h2>
                  )}
                </div>
              </div>

              {totalSteps > 0 ? (
                <ProjectStepsList
                  projectId={id}
                  steps={stepCards}
                  stepCounts={stepsByStatus}
                  isSignedIn={!!userId}
                  isMember={isMember}
                  isLead={isLead}
                />
              ) : (
                <EmptyBlock
                  title="The step list is empty."
                  description="Once the project lead breaks the work down into steps, they’ll show up here so you can pick one to claim."
                />
              )}
            </section>
            </ProjectTabPanel>

            <ProjectTabPanel tab="updates">
              <ProjectUpdatesPanel
                projectId={id}
                projectTitle={project.title}
                isSignedIn={!!userId}
                isMember={isMember}
                isLead={isLead}
                isAdmin={isAdmin}
                memberCount={memberCount}
                hiddenMembersOnlyCount={hiddenMembersOnlyCount}
                items={feedItems}
              />
            </ProjectTabPanel>
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
            {/* Join CTA */}
            <JoinProjectCard
              projectId={id}
              isSignedIn={!!userId}
              isMember={isMember}
              isPendingApproval={isPendingApproval}
            />

            {/* Stats */}
            <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
              <div className="mb-4 font-display text-lg">Project numbers</div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08]">
                <Stat value={contributors.length} label="Contributors" />
                <Stat value={totalHours} unit="h" label="Hours given" />
                <Stat
                  value={stepsByStatus.completed}
                  trailing={
                    totalSteps > 0 ? (
                      <span className="text-fg-tertiary text-[0.6em]">/{totalSteps}</span>
                    ) : null
                  }
                  label="Steps done"
                />
                <Stat value={days} unit="d" label="Days active" />
              </div>

              {contributors.length === 0 ? (
                <p className="mt-3 text-xs text-fg-tertiary">
                  No contributors yet — be the first.
                </p>
              ) : userId ? (
                <div className="mt-3 flex items-center">
                  {visibleContributors.map((c, i) => (
                    <Link
                      key={c.id}
                      href={`/users/${c.id}`}
                      className="-ml-2 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-bg-surface text-[11px] font-semibold text-blue-900 transition-transform first:ml-0 hover:scale-105"
                      style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
                      title={c.name}
                    >
                      {initialOf(c.name)}
                    </Link>
                  ))}
                  {moreContributors > 0 && (
                    <div className="-ml-2 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-bg-surface bg-bg-surface-3 font-sans text-[11px] font-semibold text-fg-secondary">
                      +{moreContributors}
                    </div>
                  )}
                </div>
              ) : (
                // Anonymous viewer — hide individual identities, just hint
                // at the team size. They'll get the full list after sign-in.
                <p className="mt-3 text-xs text-fg-tertiary">
                  <Link
                    href="/sign-in"
                    className="text-amber-500 hover:underline"
                  >
                    Sign in
                  </Link>{' '}
                  to see who’s working on this.
                </p>
              )}
            </div>

            {/* Details */}
            <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
              <div className="mb-4 font-display text-lg">Details</div>
              <DetailRow icon={<FolderOpen className="size-3.5" />} label="Type">
                {project.projectType?.name ?? <Muted>Not set</Muted>}
              </DetailRow>
              <DetailRow icon={<Clock className="size-3.5" />} label="Status">
                {statusText}
              </DetailRow>
              <DetailRow icon={<MapPin className="size-3.5" />} label="Location">
                {project.location || project.address ? (
                  <span className="flex flex-col gap-1">
                    {project.location && <span>{project.location}</span>}
                    {project.address && (
                      <span className="text-xs text-fg-tertiary">
                        {project.address}
                      </span>
                    )}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-amber-500 hover:underline"
                      >
                        <ExternalLink className="size-3" strokeWidth={2.5} />
                        Open in Google Maps
                      </a>
                    )}
                  </span>
                ) : (
                  <Muted>Not specified</Muted>
                )}
              </DetailRow>
              <DetailRow icon={<Globe className="size-3.5" />} label="Remote contributions">
                {project.remoteOk ? 'Welcome' : 'Not for this project'}
              </DetailRow>
              <DetailRow icon={<Clock className="size-3.5" />} label="Time commitment">
                {project.timeCommitmentHrs != null ? (
                  `~${project.timeCommitmentHrs}h on average`
                ) : (
                  <Muted>Flexible</Muted>
                )}
              </DetailRow>
              <DetailRow icon={<Calendar className="size-3.5" />} label="Created">
                {formatDate(created, locale)} <Muted>· {days} day{days === 1 ? '' : 's'} ago</Muted>
              </DetailRow>
              <DetailRow icon={<User className="size-3.5" />} label="Lead">
                {lead?.user?.name ?? <Muted>No lead yet</Muted>}
              </DetailRow>
            </div>
          </aside>
        </div>
      </div>
    </ProjectTabsProvider>
  )
}

/* ================================================================
   Sub-components
   ================================================================ */

function Stat({
  value,
  label,
  unit,
  trailing,
}: {
  value: number
  label: string
  unit?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-bg-surface px-5 py-4">
      <div className="font-display text-2xl leading-none text-amber-500">
        {value}
        {unit && <span className="text-[0.6em] text-fg-tertiary">{unit}</span>}
        {trailing}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
    </div>
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

/**
 * Hero status pill — matches the four-state project vocabulary defined in
 * the design (Being defined · Needs help · In progress · Completed). Each
 * state gets its own colour palette + glyph so the eye can tell at a glance
 * whether a project is asking for hands or just chugging along.
 */
function ProjectStatusPill({
  status,
  label,
}: {
  status: string
  label: string
}) {
  const palette =
    status === 'needs_help'
      ? 'border-amber-500/55 bg-amber-500/[0.18] text-amber-300 shadow-[0_0_18px_rgba(244,165,53,0.25)]'
      : status === 'in_progress'
        ? 'border-green-500/40 bg-green-500/[0.16] text-green-300'
        : status === 'defining'
          ? 'border-blue-400/40 bg-blue-500/[0.16] text-blue-200'
          : status === 'completed'
            ? 'border-green-500/30 bg-green-500/[0.10] text-green-300'
            : 'border-white/[0.12] bg-white/[0.04] text-fg-secondary'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-widest backdrop-blur-sm ${palette}`}
    >
      <ProjectStatusGlyph status={status} />
      {label}
    </span>
  )
}

function ProjectStatusGlyph({ status }: { status: string }) {
  if (status === 'needs_help') {
    return (
      <span className="inline-flex size-3 items-center justify-center rounded-full bg-amber-500 font-display text-[9px] font-bold leading-none text-amber-900 shadow-[0_0_8px_rgba(244,165,53,0.6)]">
        !
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="relative inline-flex size-3 items-center justify-center rounded-full border-[1.5px] border-green-500">
        <span className="size-1.5 animate-pulse rounded-full bg-green-300" />
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
  if (status === 'completed') {
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
  return <span className="size-[5px] rounded-full bg-fg-tertiary" />
}

function EmptyInline({ text }: { text: string }) {
  return (
    <p className="mt-5 rounded-xl border border-dashed border-neutral-700 bg-bg-surface-2/40 p-5 text-sm text-fg-tertiary">
      {text}
    </p>
  )
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.04),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="max-w-[420px] text-sm text-fg-secondary">{description}</p>
    </div>
  )
}
