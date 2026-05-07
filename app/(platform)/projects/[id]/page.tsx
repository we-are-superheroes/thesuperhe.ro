import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ChevronRight, Share2, Bookmark, MapPin, Globe, Calendar, FolderOpen, Clock, User } from 'lucide-react'
import { ProjectStepsList, type StepCardData } from '@/components/platform/project-steps-list'
import { JoinProjectTopButton, JoinProjectCard } from '@/components/platform/join-project-controls'

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

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4a8b6e, #3DAF7C)',
  'linear-gradient(135deg, #F4A535, #F7BD64)',
  'linear-gradient(135deg, #4A7FD4, #7AAEE8)',
  'linear-gradient(135deg, #B86E00, #F4A535)',
  'linear-gradient(135deg, #2E5FAA, #4A7FD4)',
  'linear-gradient(135deg, #1A5C40, #3DAF7C)',
]

function initial(name: string | null | undefined) {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
}

interface ProjectViewParams {
  params: Promise<{ id: string }>
}

export default async function ProjectViewPage({ params }: ProjectViewParams) {
  const { id } = await params
  const { userId } = await auth()

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      location: true,
      remoteOk: true,
      timeCommitmentHrs: true,
      createdAt: true,
      projectType: { select: { name: true } },
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          order: true,
          estimatedHrs: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
          skills: {
            select: { skill: { select: { id: true, name: true } } },
          },
        },
      },
      contributions: {
        where: { status: { in: ['active', 'pending'] } },
        select: {
          role: true,
          hoursContributed: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!project) notFound()

  // Is the current user already a project-level member?
  const isMember = userId
    ? !!(await db.contribution.findFirst({
        where: {
          userId,
          projectId: id,
          projectStepId: null,
          status: { in: ['active', 'pending'] },
        },
        select: { id: true },
      }))
    : false

  // How many steps are assigned to me on this project? (used to confirm leave)
  const myAssignedStepCount = userId
    ? project.steps.filter((s) => s.assignedToId === userId).length
    : 0

  const totalSteps = project.steps.length
  const stepsByStatus = {
    needs_help: project.steps.filter((s) => s.status === 'needs_help').length,
    in_progress: project.steps.filter((s) => s.status === 'in_progress').length,
    done: project.steps.filter((s) => s.status === 'done').length,
    not_started: project.steps.filter((s) => s.status === 'not_started').length,
  }

  // Find the lead contributor (first contribution with role=lead, fallback to none)
  const lead = project.contributions.find((c) => c.role === 'lead') ?? null

  // Hours given across all contributions
  const totalHours = project.contributions.reduce((s, c) => s + c.hoursContributed, 0)

  const created = project.createdAt
  const days = daysSince(created)

  // Status pill text
  const statusText = (() => {
    switch (project.status) {
      case 'active':
        return stepsByStatus.in_progress > 0 ? 'Active · in progress' : 'Active'
      case 'draft':
        return 'Draft'
      case 'completed':
        return 'Completed'
      case 'archived':
        return 'Archived'
      default:
        return project.status
    }
  })()

  // Cover gradient by project type
  const coverGradient =
    (project.projectType?.name && TYPE_COVER_GRADIENT[project.projectType.name]) ??
    TYPE_COVER_GRADIENT['Urban Rewilding']

  // Shape steps for the client component
  const stepCards: StepCardData[] = project.steps.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    order: s.order,
    totalSteps,
    estimatedHrs: s.estimatedHrs,
    assignedToName: s.assignedTo?.name ?? null,
    assignedToMe: !!userId && s.assignedToId === userId,
    skills: s.skills.map((ss) => ss.skill.name),
  }))

  // Description split by paragraph (newlines)
  const descParagraphs = project.description.split(/\n+/).map((p) => p.trim()).filter(Boolean)

  // Contributors for avatar stack (deduped by user id)
  const contributorMap = new Map<string, { name: string }>()
  for (const c of project.contributions) {
    if (c.user) contributorMap.set(c.user.id, { name: c.user.name })
  }
  const contributors = Array.from(contributorMap.values())
  const visibleContributors = contributors.slice(0, 5)
  const moreContributors = Math.max(0, contributors.length - visibleContributors.length)

  return (
    <>
      {/* Topbar */}
      <div className="flex items-center justify-between gap-6 border-b border-white/[0.08] px-10 py-5">
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <Link href="/projects" className="transition-colors duration-fast hover:text-fg-primary">
            Browse projects
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-fg-primary">{project.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
            title="Share"
          >
            <Share2 className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
            title="Pin"
          >
            <Bookmark className="size-4" />
          </button>
          <JoinProjectTopButton
            projectId={id}
            isSignedIn={!!userId}
            isMember={isMember}
          />
        </div>
      </div>

      <div className="overflow-y-auto">
        {/* Cover */}
        <div
          className="relative flex min-h-[360px] items-end overflow-hidden border-b border-white/[0.08]"
          style={{ background: coverGradient }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-30% to-blue-900/[0.92]" />
          <div className="relative z-[1] mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-10 pb-8 pt-12">
            <div className="flex flex-wrap items-center gap-3">
              {project.projectType?.name && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/[0.16] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400 backdrop-blur-sm">
                  <span className="size-[5px] rounded-full bg-amber-500 shadow-[0_0_5px_var(--color-amber-500)]" />
                  {project.projectType.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/35 bg-green-500/[0.16] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-green-300 backdrop-blur-sm">
                <span className="size-[5px] rounded-full bg-green-500 shadow-[0_0_5px_var(--color-green-500)]" />
                {statusText}
              </span>
            </div>
            <h1 className="my-2 font-display text-[clamp(40px,5vw,60px)] font-normal leading-none tracking-tight">
              {project.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-base text-fg-secondary">
              {project.location && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-3.5" />
                  {project.location}
                </span>
              )}
              {project.location && (project.remoteOk || project.createdAt) && (
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
                Started {formatDate(created)}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto grid w-full max-w-[1240px] grid-cols-[1fr_340px] items-start gap-10 p-10">
          {/* Left column */}
          <div>
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

            {/* Steps */}
            <section className="mt-12">
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
                        <em className="italic text-amber-500">in motion</em>
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
                />
              ) : (
                <EmptyBlock
                  title="The step list is empty."
                  description="Once the project lead breaks the work down into steps, they’ll show up here so you can pick one to claim."
                />
              )}
            </section>
          </div>

          {/* Right rail */}
          <aside className="sticky top-6 flex flex-col gap-5">
            {/* Join CTA */}
            <JoinProjectCard
              projectId={id}
              isSignedIn={!!userId}
              isMember={isMember}
              myAssignedStepCount={myAssignedStepCount}
            />

            {/* Stats */}
            <div className="rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
              <div className="mb-4 font-display text-lg">By the numbers</div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08]">
                <Stat value={contributors.length} label="Contributors" />
                <Stat value={totalHours} unit="h" label="Hours given" />
                <Stat
                  value={stepsByStatus.done}
                  trailing={
                    totalSteps > 0 ? (
                      <span className="text-fg-tertiary text-[0.6em]">/{totalSteps}</span>
                    ) : null
                  }
                  label="Steps done"
                />
                <Stat value={days} unit="d" label="In motion" />
              </div>

              {contributors.length > 0 ? (
                <div className="mt-3 flex items-center">
                  {visibleContributors.map((c, i) => (
                    <div
                      key={i}
                      className="-ml-2 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-bg-surface text-[11px] font-semibold text-blue-900 first:ml-0"
                      style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
                      title={c.name}
                    >
                      {initial(c.name)}
                    </div>
                  ))}
                  {moreContributors > 0 && (
                    <div className="-ml-2 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-bg-surface bg-bg-surface-3 font-sans text-[11px] font-semibold text-fg-secondary">
                      +{moreContributors}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-fg-tertiary">
                  No contributors yet — be the first.
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
                {project.location ?? <Muted>Not specified</Muted>}
              </DetailRow>
              <DetailRow icon={<Globe className="size-3.5" />} label="Remote contributions">
                {project.remoteOk ? 'Welcome' : 'Not at this project'}
              </DetailRow>
              <DetailRow icon={<Clock className="size-3.5" />} label="Time commitment">
                {project.timeCommitmentHrs != null ? (
                  `~${project.timeCommitmentHrs}h on average`
                ) : (
                  <Muted>Flexible</Muted>
                )}
              </DetailRow>
              <DetailRow icon={<Calendar className="size-3.5" />} label="Created">
                {formatDate(created)} <Muted>· {days} day{days === 1 ? '' : 's'} ago</Muted>
              </DetailRow>
              <DetailRow icon={<User className="size-3.5" />} label="Lead">
                {lead?.user?.name ?? <Muted>No lead yet</Muted>}
              </DetailRow>
            </div>
          </aside>
        </div>
      </div>
    </>
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
