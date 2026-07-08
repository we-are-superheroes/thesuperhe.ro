import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { LeavesMark } from '@/components/ui/logo'
import {
  ArrowRight,
  Search,
  LayoutDashboard,
  LogIn,
  Clock,
  Users,
  Settings2,
} from 'lucide-react'

/* ================================================================
   MARKETING HOMEPAGE — "Don't act alone. Be a superhero, together."
   New design from Claude Design handoff.
   Projects section is dynamic (from DB). Nav is auth-aware.
   ================================================================ */

/* ── Data fetching ─────────────────────────────────────────────── */

async function getRecentProjects() {
  const projects = await db.project.findMany({
    where: {
      status: { in: ['defining', 'needs_help', 'in_progress'] },
      visibility: 'public',
    },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      remoteOk: true,
      timeCommitmentHrs: true,
      createdAt: true,
      projectType: { select: { name: true } },
      steps: {
        select: { status: true },
      },
      contributions: {
        select: { id: true },
      },
    },
  })

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    location: p.location,
    remoteOk: p.remoteOk,
    timeCommitmentHrs: p.timeCommitmentHrs,
    createdAt: p.createdAt,
    projectType: p.projectType?.name ?? null,
    needsHelpCount: p.steps.filter((s) => s.status === 'needs_help').length,
    contributorCount: p.contributions.length,
    daysAgo: Math.floor(
      (Date.now() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    ),
  }))
}

/* ── Gradient backgrounds for project cards ─────────────────────── */

const PROJECT_GRADIENTS = [
  'radial-gradient(circle at 30% 40%, #4a8b6e 0%, transparent 50%), linear-gradient(135deg, #1a3d2c 0%, #6b9d7e 100%)',
  'radial-gradient(circle at 30% 50%, #f4a535 0%, transparent 70%), linear-gradient(160deg, #5C3600 0%, #B86E00 100%)',
  'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.18) 0%, transparent 50%), linear-gradient(135deg, #7A1A1A 0%, #E05252 100%)',
  'radial-gradient(circle at 60% 40%, #4A7FD4 0%, transparent 60%), linear-gradient(135deg, #0E1A2B 0%, #2E5FAA 100%)',
  'radial-gradient(circle at 40% 60%, #7DD3B0 0%, transparent 50%), linear-gradient(160deg, #1A5C40 0%, #3DAF7C 100%)',
  'radial-gradient(circle at 50% 40%, #FAD08F 0%, transparent 60%), linear-gradient(135deg, #2A3A52 0%, #5A7090 100%)',
]

/* Collage card gradients */
const COLLAGE_GRADIENTS = [
  'radial-gradient(circle at 30% 40%, #4a8b6e 0%, transparent 50%), linear-gradient(135deg, #2d5547 0%, #6b9d7e 100%)',
  'linear-gradient(135deg, #1B3A6B 0%, #2E5FAA 100%)',
]

/* ── Page component ─────────────────────────────────────────────── */

/**
 * The marketing home content. Auth-aware (nav + CTAs change when signed
 * in). Shared by `/` (for signed-out visitors) and `/home` (reachable by
 * anyone, including signed-in users who want the landing page).
 */
export async function MarketingHome() {
  const [{ userId }, projects] = await Promise.all([
    auth(),
    getRecentProjects(),
  ])

  const isSignedIn = !!userId

  return (
    <div className="overflow-x-hidden">
      <Navbar isSignedIn={isSignedIn} />
      <Hero projects={projects} />
      <EntryPoints isSignedIn={isSignedIn} />
      <NewProjects projects={projects} />
      <HowItWorks />
      <FinalCTA isSignedIn={isSignedIn} />
      <Footer />
    </div>
  )
}

/**
 * `/` route. Signed-in users land on their dashboard; everyone else gets
 * the marketing home. The home page itself stays reachable at `/home`.
 */
export default async function MarketingHomePage() {
  const { userId } = await auth()
  if (userId) redirect('/dashboard')
  return <MarketingHome />
}

/* ── Types ─────────────────────────────────────────────────────── */

type ProjectSummary = Awaited<ReturnType<typeof getRecentProjects>>[number]

/* ── Navbar ──────────────────────────────────────────────────── */

function Navbar({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.07] bg-blue-900/[0.78] backdrop-blur-2xl backdrop-saturate-[1.4]">
      <div className="mx-auto flex max-w-[1420px] items-center justify-between gap-4 px-4 py-3 sm:gap-8 sm:px-8 sm:py-4">
        <Link href="/" className="flex items-center gap-2 sm:gap-3">
          <LeavesMark className="size-7 sm:size-8" />
          <span className="font-display text-base tracking-tight sm:text-xl">
            The Superhero
          </span>
        </Link>

        <div className="hidden gap-8 text-sm text-neutral-300 lg:flex">
          <Link href="/projects" className="transition-colors duration-fast hover:text-fg-primary">
            Browse projects
          </Link>
          <Link href="/blueprints" className="transition-colors duration-fast hover:text-fg-primary">
            Browse blueprints
          </Link>
          <Link href="#how" className="transition-colors duration-fast hover:text-fg-primary">
            How it works
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isSignedIn ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md border border-white/[0.13] bg-transparent px-3 py-2 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-white/[0.04] sm:px-[18px] sm:py-2.5"
              >
                Dashboard
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden items-center gap-2 rounded-md border border-white/[0.13] bg-transparent px-[18px] py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-white/[0.04] sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-md border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber sm:px-[18px] sm:py-2.5"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

/* ── Sign Out Button (client component inline) ─────────────────── */

import { SignOutButton as ClerkSignOutButton } from '@clerk/nextjs'

function SignOutButton() {
  return (
    <ClerkSignOutButton>
      <button className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber sm:px-[18px] sm:py-2.5">
        Sign out
      </button>
    </ClerkSignOutButton>
  )
}

/* ── Hero ────────────────────────────────────────────────────── */

function Hero({ projects }: { projects: ProjectSummary[] }) {
  // Use the first two projects for the collage cards
  const collageProjects = projects.slice(0, 2)

  return (
    <section className="relative overflow-hidden py-14 pb-12 sm:py-24 sm:pb-20">
      {/* Background radials */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 80% 0%, rgba(244,165,53,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 10% 100%, rgba(46,95,170,0.18) 0%, transparent 60%)',
        }}
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          backgroundPosition: '-1px -1px',
          maskImage:
            'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 80%)',
        }}
      />

      <div className="relative mx-auto grid max-w-[1420px] grid-cols-1 items-center gap-10 px-4 sm:gap-16 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
        {/* Left — copy */}
        <div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.13] px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-neutral-300 animate-[rise_800ms_ease-out_100ms_backwards]">
            <span className="size-1.5 animate-pulse rounded-full bg-amber-500 shadow-[0_0_8px_var(--color-amber-500)]" />
            Climate &amp; sustainability — together
          </div>

          <h1 className="mb-6 font-display text-[clamp(48px,6.2vw,80px)] leading-[0.98] tracking-[-0.025em] animate-[rise_800ms_ease-out_200ms_backwards]">
            Don&apos;t act alone.
            <br />
            Let&apos;s be{' '}
            <span className="relative italic text-amber-500">
              superheroes
              <span className="absolute inset-x-0 bottom-2 -z-10 h-2 rounded-sm bg-amber-500/[0.18]" />
            </span>
            <br />
            together.
          </h1>

          <p className="mb-10 max-w-[540px] text-xl leading-relaxed text-neutral-300 animate-[rise_800ms_ease-out_300ms_backwards]">
            Find climate and sustainability projects that need your skills, or
            bring your own idea and let collaborators help you make it real.
          </p>

          <div className="mb-10 flex items-center gap-3 animate-[rise_800ms_ease-out_400ms_backwards]">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-md border border-amber-500 bg-amber-500 px-6 py-3.5 text-base font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
            >
              Browse projects
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-md border border-white/[0.13] bg-bg-surface-2 px-6 py-3.5 text-base font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-bg-surface-3"
            >
              Start a project
            </Link>
          </div>

          <div className="flex items-center gap-6 text-sm text-neutral-400 animate-[rise_800ms_ease-out_500ms_backwards]">
            <span className="flex items-center gap-2">
              <Clock className="size-4 opacity-70" />
              From 1-hour tasks to long projects
            </span>
            <span className="h-3.5 w-px bg-white/[0.13]" />
            <span className="flex items-center gap-2">
              <Settings2 className="size-4 opacity-70" />
              All skills welcome
            </span>
          </div>
        </div>

        {/* Right — collage */}
        <div className="relative hidden aspect-[5/6] lg:block animate-[rise_800ms_ease-out_300ms_backwards]">
          {/* Floating annotation */}
          <span className="pointer-events-none absolute -left-[8%] -top-3 z-10 -rotate-6 font-display text-lg italic text-amber-500">
            real projects, real impact
            <svg
              className="mt-1 block"
              width="40"
              height="32"
              viewBox="0 0 40 32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M2 2 C 12 18, 22 26, 36 28 M30 22 L36 28 L30 30"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          {/* Card 1 — top right */}
          {collageProjects[0] && (
            <div className="absolute right-0 top-0 z-[3] w-[62%] rotate-[2.5deg] rounded-2xl border border-white/[0.13] bg-bg-surface p-5 shadow-lg backdrop-blur-xl">
              <div
                className="mb-3 aspect-[16/10] overflow-hidden rounded-md"
                style={{ background: COLLAGE_GRADIENTS[0] }}
              />
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                {collageProjects[0].projectType}
                {collageProjects[0].location
                  ? ` · ${collageProjects[0].location}`
                  : ''}
              </div>
              <div className="mb-3 font-display text-lg leading-tight">
                {collageProjects[0].title}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <span>
                  {collageProjects[0].contributorCount} contributor
                  {collageProjects[0].contributorCount !== 1 ? 's' : ''}
                </span>
                <span>·</span>
                {collageProjects[0].needsHelpCount > 0 && (
                  <span className="font-semibold text-amber-500">
                    {collageProjects[0].needsHelpCount} step
                    {collageProjects[0].needsHelpCount !== 1 ? 's' : ''} need
                    help
                  </span>
                )}
              </div>
              {collageProjects[0].needsHelpCount > 0 && (
                <div className="mt-3 h-1 overflow-hidden rounded-sm bg-white/[0.08]">
                  <div
                    className="h-full rounded-sm bg-amber-500"
                    style={{ width: '35%' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Card 2 — bottom left */}
          {collageProjects[1] && (
            <div className="absolute bottom-[14%] left-0 z-[2] w-[64%] -rotate-3 rounded-2xl border border-white/[0.13] bg-bg-surface p-5 shadow-lg backdrop-blur-xl">
              <div
                className="mb-3 aspect-[16/10] overflow-hidden rounded-md"
                style={{ background: COLLAGE_GRADIENTS[1] }}
              />
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                {collageProjects[1].projectType}
                {collageProjects[1].location
                  ? ` · ${collageProjects[1].location}`
                  : ''}
              </div>
              <div className="mb-3 font-display text-lg leading-tight">
                {collageProjects[1].title}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400">
                <span>
                  {collageProjects[1].contributorCount} contributor
                  {collageProjects[1].contributorCount !== 1 ? 's' : ''}
                </span>
                <span>·</span>
                <span>
                  ~{collageProjects[1].timeCommitmentHrs}h commitment
                </span>
              </div>
            </div>
          )}

          {/* Card 3 — amber accent, bottom right */}
          <div className="absolute bottom-0 right-[8%] z-[4] w-[50%] rotate-[4deg] rounded-2xl border border-amber-500 bg-amber-500 p-5 text-amber-900 shadow-lg">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
              Repair Café
            </div>
            <div className="mb-3 font-display text-lg italic leading-tight text-amber-900">
              &ldquo;Bring it broken, take it fixed.&rdquo;
            </div>
            <div className="text-xs text-amber-800">
              ★ Camden, monthly
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Entry Points ────────────────────────────────────────────── */

function EntryPoints({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <section className="border-t border-white/[0.07] py-12 sm:py-20">
      <div className="mx-auto grid max-w-[1420px] grid-cols-1 gap-4 px-4 sm:px-8 md:grid-cols-3">
        {/* Browse — featured */}
        <Link
          href="/projects"
          className="group relative flex min-h-[240px] flex-col gap-4 overflow-hidden rounded-2xl border border-white/[0.13] p-8 transition-all duration-standard hover:-translate-y-[3px] hover:border-white/25 hover:shadow-md"
          style={{
            background:
              'radial-gradient(ellipse at top right, rgba(244,165,53,0.15), transparent 60%), var(--color-bg-surface)',
          }}
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500 text-amber-900">
            <Search className="size-[22px]" />
          </div>
          <div className="mt-3 font-display text-2xl leading-[1.1]">
            Browse projects
          </div>
          <div className="text-sm leading-relaxed text-neutral-300">
            Filter by skill, location, time commitment. Find one that fits and
            join in.
          </div>
          <span className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-amber-500">
            Explore
            <ArrowRight className="size-3.5 transition-transform duration-standard group-hover:translate-x-1" />
          </span>
        </Link>

        {/* Dashboard — amber */}
        <Link
          href="/dashboard"
          className="group relative flex min-h-[240px] flex-col gap-4 overflow-hidden rounded-2xl border border-amber-500 bg-gradient-to-br from-amber-500 to-amber-400 p-8 text-amber-900 transition-all duration-standard hover:-translate-y-[3px] hover:shadow-md"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-900/15 text-amber-900">
            <LayoutDashboard className="size-[22px]" />
          </div>
          <div className="mt-3 font-display text-2xl leading-[1.1] text-amber-900">
            Your dashboard
          </div>
          <div className="text-sm leading-relaxed text-amber-900/[0.78]">
            Pinned projects, next steps, and what&apos;s happening on the
            projects you&apos;ve joined.
          </div>
          <span className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-amber-900">
            Open dashboard
            <ArrowRight className="size-3.5 transition-transform duration-standard group-hover:translate-x-1" />
          </span>
        </Link>

        {/* Sign in */}
        <Link
          href={isSignedIn ? '/dashboard' : '/sign-in'}
          className="group relative flex min-h-[240px] flex-col gap-4 overflow-hidden rounded-2xl border border-white/[0.13] bg-bg-surface p-8 transition-all duration-standard hover:-translate-y-[3px] hover:border-white/25 hover:shadow-md"
        >
          <div className="flex size-11 items-center justify-center rounded-xl bg-bg-surface-3 text-amber-500">
            <LogIn className="size-[22px]" />
          </div>
          <div className="mt-3 font-display text-2xl leading-[1.1]">
            {isSignedIn ? 'Welcome back' : 'Sign in'}
          </div>
          <div className="text-sm leading-relaxed text-neutral-300">
            {isSignedIn
              ? "You're signed in. Head to your dashboard to see your projects."
              : 'Returning? Pick up where you left off. New here? Create an account in under a minute.'}
          </div>
          <span className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-amber-500">
            {isSignedIn ? 'Go to dashboard' : 'Sign in'}
            <ArrowRight className="size-3.5 transition-transform duration-standard group-hover:translate-x-1" />
          </span>
        </Link>
      </div>
    </section>
  )
}

/* ── New Projects ────────────────────────────────────────────── */

function NewProjects({ projects }: { projects: ProjectSummary[] }) {
  return (
    <section className="border-t border-white/[0.07] py-12 sm:py-20" id="browse">
      <div className="mx-auto max-w-[1420px] px-4 sm:px-8">
        {/* Section header */}
        <div className="mb-12 flex items-end justify-between gap-8">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-amber-500">
              <span className="h-px w-6 bg-amber-500" />
              Fresh on the platform
            </div>
            <h2 className="font-display text-[clamp(36px,4vw,56px)] leading-[1.05] tracking-[-0.02em]">
              New projects{' '}
              <em className="not-italic text-amber-500">looking for you</em>.
            </h2>
            <p className="mt-4 max-w-[600px] text-lg leading-relaxed text-neutral-300">
              Just launched, and in need of their first contributors. Steps usually take less than 2 hours.
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex shrink-0 items-center gap-2 border-b border-current pb-2 text-sm font-medium text-amber-500 transition-[gap] duration-standard hover:gap-3"
          >
            See all projects
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* Project grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              gradient={PROJECT_GRADIENTS[i % PROJECT_GRADIENTS.length]}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Project Card ────────────────────────────────────────────── */

function ProjectCard({
  project,
  gradient,
}: {
  project: ProjectSummary
  gradient: string
}) {
  const tags: string[] = []
  if (project.projectType) tags.push(project.projectType)
  if (project.remoteOk) tags.push('Remote OK')
  else if (project.location) tags.push(project.location.split(',')[0])

  const timeLabel = project.timeCommitmentHrs
    ? `~${project.timeCommitmentHrs}h`
    : null

  const ageLabel =
    project.daysAgo <= 1
      ? 'New · today'
      : project.daysAgo < 7
        ? `New · ${project.daysAgo}d ago`
        : `New · 1w ago`

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-bg-surface transition-all duration-standard hover:-translate-y-[3px] hover:border-white/25 hover:shadow-md"
    >
      {/* Image area */}
      <div
        className="relative aspect-[16/10] overflow-hidden"
        style={{ background: gradient }}
      >
        {project.needsHelpCount > 0 && (
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.13] bg-blue-900/[0.85] px-2.5 py-1 text-xs font-semibold tracking-tight text-amber-500 backdrop-blur-lg">
            <span className="size-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_var(--color-amber-500)]" />
            {project.needsHelpCount} step
            {project.needsHelpCount !== 1 ? 's' : ''} need help
          </span>
        )}
        <span className="absolute right-4 top-4 rounded-full bg-blue-900/[0.85] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-fg-primary backdrop-blur-lg">
          {ageLabel}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/[0.07] bg-bg-surface-2 px-2.5 py-0.5 text-xs tracking-tight text-neutral-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <h3 className="mt-0.5 font-display text-2xl leading-[1.15]">
          {project.title}
        </h3>
        <p className="flex-1 text-sm leading-relaxed text-neutral-300">
          {project.description && project.description.length > 120
            ? project.description.slice(0, 120) + '...'
            : project.description}
        </p>
        <div className="mt-2 flex items-center justify-between border-t border-white/[0.07] pt-4">
          <div className="flex gap-4 text-xs text-neutral-400">
            {timeLabel && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {timeLabel}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {project.contributorCount} joined
            </span>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-amber-500">
            View →
          </span>
        </div>
      </div>
    </Link>
  )
}

/* ── How It Works ────────────────────────────────────────────── */

const STEPS = [
  {
    num: '01',
    title: 'Tell us your skills',
    desc: "Add the things you're good at, and the ones you actually want to use on a project. A burnt-out developer doesn't have to do coding.",
  },
  {
    num: '02',
    title: 'Find a fit',
    desc: 'Browse whole projects, or just single steps. The smallest unit can be a 30-minute task, perfect for a quiet evening.',
  },
  {
    num: '03',
    title: 'Get to work',
    desc: 'Join the team, claim a step, and ship something real with people who care about the same thing you do.',
  },
]

function HowItWorks() {
  return (
    <section className="border-t border-white/[0.07] py-12 sm:py-20" id="how">
      <div className="mx-auto max-w-[1420px] px-4 sm:px-8">
        <div className="mb-12">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-amber-500">
            <span className="h-px w-6 bg-amber-500" />
            How it works
          </div>
          <h2 className="max-w-[780px] font-display text-[clamp(36px,4vw,56px)] leading-[1.05] tracking-[-0.02em]">
            Contribute as much, {' '}
            <em className="not-italic text-amber-500">or as little</em>, as your time
            allows.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="rounded-2xl border border-white/[0.07] bg-bg-surface p-8"
            >
              <div className="mb-4 font-display text-[80px] italic leading-none text-amber-500 opacity-85">
                {step.num}
              </div>
              <div className="mb-3 font-display text-2xl leading-[1.15]">
                {step.title}
              </div>
              <p className="text-sm leading-relaxed text-neutral-300">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Final CTA ───────────────────────────────────────────────── */

function FinalCTA({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <section className="mx-auto max-w-[1420px] px-4 sm:px-8">
      <div
        className="relative my-20 overflow-hidden rounded-2xl border border-white/[0.13] p-20 text-center"
        style={{
          background:
            'radial-gradient(ellipse at 30% 50%, rgba(244,165,53,0.18) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(46,95,170,0.2) 0%, transparent 60%), var(--color-bg-surface)',
        }}
      >
        {/* Subtle grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative">
          <h2 className="mb-5 font-display text-[clamp(40px,5vw,64px)] leading-none tracking-[-0.02em]">
            Ready to <em className="not-italic text-amber-500">act?</em>
          </h2>
          <p className="mx-auto mb-10 max-w-[540px] text-lg text-neutral-300">
            Browse what&apos;s live right now, or sign in to see your dashboard.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-md border border-amber-500 bg-amber-500 px-6 py-3.5 text-base font-medium text-blue-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
            >
              Browse projects
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-white/[0.13] bg-bg-surface-2 px-6 py-3.5 text-base font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-bg-surface-3"
            >
              Go to dashboard
            </Link>
            {!isSignedIn && (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-md border border-white/[0.13] bg-transparent px-6 py-3.5 text-base font-medium text-fg-primary transition-all duration-standard hover:border-white/25 hover:bg-white/[0.04]"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Footer ──────────────────────────────────────────────────── */

/** Inline Swiss flag (official Pantone artwork) — an SVG rather than the
 *  🇨🇭 emoji, which Windows browsers render as the letters "CH". */
function SwissFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Swiss flag" role="img">
      <path d="M0 0h32v32H0z" fill="#da291c" />
      <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#fff" />
    </svg>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.07] py-10 pb-8 text-sm text-neutral-400">
      <div className="mx-auto flex max-w-[1420px] flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:gap-6 sm:px-8">
        <div>&copy; 2026 The Superhero · climate &amp; sustainability collaboration</div>
        <div className="flex items-center gap-6">
          <Link href="/projects" className="hover:text-fg-primary">
            Projects
          </Link>
          <Link href="/blueprints" className="hover:text-fg-primary">
            Blueprints
          </Link>
          <Link href="/privacy" className="hover:text-fg-primary">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-fg-primary">
            Terms
          </Link>
        </div>
        <div className="flex items-center gap-2">
          Created in Switzerland
          <SwissFlag className="size-4" />
        </div>
      </div>
    </footer>
  )
}
