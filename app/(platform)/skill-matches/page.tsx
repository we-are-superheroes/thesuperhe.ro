import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { MapPin, Globe, Pencil, Star } from 'lucide-react'
import { db } from '@/lib/db'
import { visibleProjectsWhere } from '@/lib/orgs'
import {
  analyseMatch,
  cityOf,
  LANGUAGE_SKILL_TO_ISO,
  type MatchMe,
} from '@/lib/matching'
import { languageLabel } from '@/lib/locales'
import {
  SkillMatchesClient,
  type MatchCardData,
} from '@/components/platform/skill-matches-client'

/* ================================================================
   /skill-matches — steps and projects scored against the signed-in
   user's seeking skills, city and spoken languages. Scoring lives in
   lib/matching.ts (ported from the design mockup); this page fetches
   the candidates, scores them server-side and hands plain data to
   the client component for filtering.
   ================================================================ */

const LIVE_PROJECT_STATUSES = ['defining', 'needs_help', 'in_progress'] as const
const JOINABLE_STEP_STATUSES = ['open', 'defining', 'needs_help', 'in_progress'] as const

export default async function SkillMatchesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const me = await db.user.findUnique({
    where: { id: userId },
    select: {
      location: true,
      skills: {
        where: { isSeeking: true },
        select: { skill: { select: { id: true, name: true, category: true } } },
      },
    },
  })

  // Languages count regardless of is_seeking — speaking one isn't "seeking
  // work in it", it's a matching fact. Fetch all the user's language skills.
  const languageSkills = await db.userSkill.findMany({
    where: { userId, skill: { category: 'Languages' } },
    select: { skill: { select: { name: true } } },
  })

  const seekingSkills = (me?.skills ?? [])
    .map((us) => us.skill)
    .filter((s) => s.category !== 'Languages')
  const languages = languageSkills
    .map((ls) => LANGUAGE_SKILL_TO_ISO[ls.skill.name])
    .filter((code): code is string => !!code)

  const basis: MatchMe = {
    skillNames: new Set(seekingSkills.map((s) => s.name)),
    categories: new Set(seekingSkills.map((s) => s.category)),
    city: cityOf(me?.location),
    languages: new Set(languages),
  }

  const skillIds = seekingSkills.map((s) => s.id)
  const categories = [...basis.categories]

  let cards: MatchCardData[] = []

  if (skillIds.length > 0) {
    const skillFilter = {
      OR: [{ id: { in: skillIds } }, { category: { in: categories } }],
    }

    const [steps, projects] = await Promise.all([
      // Steps needing one of the user's skills (or an adjacent one), on live
      // projects, that the user hasn't already joined.
      db.projectStep.findMany({
        where: {
          status: { in: [...JOINABLE_STEP_STATUSES] },
          skills: { some: { skill: skillFilter } },
          project: {
            status: { in: [...LIVE_PROJECT_STATUSES] },
            AND: [visibleProjectsWhere(userId)],
          },
          contributions: {
            none: { userId, status: { in: ['active', 'pending'] } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 120,
        select: {
          id: true,
          title: true,
          description: true,
          estimatedHrs: true,
          skills: { select: { skill: { select: { name: true, category: true } } } },
          project: {
            select: {
              id: true,
              title: true,
              location: true,
              language: true,
              remoteOk: true,
              projectType: { select: { name: true } },
            },
          },
        },
      }),
      // Whole projects whose steps need those skills, that the user isn't in.
      db.project.findMany({
        where: {
          status: { in: [...LIVE_PROJECT_STATUSES] },
          AND: [visibleProjectsWhere(userId)],
          steps: { some: { skills: { some: { skill: skillFilter } } } },
          contributions: {
            none: { userId, projectStepId: null, status: { in: ['active', 'pending'] } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          language: true,
          remoteOk: true,
          projectType: { select: { name: true } },
          steps: {
            select: {
              skills: { select: { skill: { select: { name: true, category: true } } } },
            },
          },
        },
      }),
    ])

    for (const s of steps) {
      const analysis = analyseMatch(
        {
          skills: s.skills.map((ss) => ss.skill),
          remote: s.project.remoteOk,
          location: s.project.location,
          language: s.project.language,
        },
        basis,
      )
      if (!analysis) continue
      cards.push({
        kind: 'step',
        id: s.id,
        href: `/projects/${s.project.id}`,
        title: s.title,
        projectTitle: s.project.title,
        type: s.project.projectType?.name ?? null,
        description: s.description,
        skills: s.skills.map((ss) => ss.skill.name),
        remote: s.project.remoteOk,
        location: s.project.location,
        language: s.project.language,
        languageLabel: languageLabel(s.project.language),
        estimatedHrs: s.estimatedHrs,
        ...analysis,
      })
    }

    for (const p of projects) {
      // A project "needs" the union of its steps' skills.
      const seen = new Map<string, { name: string; category: string }>()
      for (const st of p.steps)
        for (const ss of st.skills) seen.set(ss.skill.name, ss.skill)
      const analysis = analyseMatch(
        {
          skills: [...seen.values()],
          remote: p.remoteOk,
          location: p.location,
          language: p.language,
        },
        basis,
      )
      if (!analysis) continue
      cards.push({
        kind: 'project',
        id: p.id,
        href: `/projects/${p.id}`,
        title: p.title,
        projectTitle: null,
        type: p.projectType?.name ?? null,
        description: p.description.split(/\n+/)[0],
        skills: [...seen.keys()],
        remote: p.remoteOk,
        location: p.location,
        language: p.language,
        languageLabel: languageLabel(p.language),
        estimatedHrs: null,
        ...analysis,
      })
    }

    cards = cards.sort((a, b) => b.score - a.score)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1020px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        {/* Page head */}
        <header>
          <h1 className="mb-3 font-display text-[clamp(36px,4vw,52px)] font-normal leading-none tracking-tight">
            Matched to <em className="italic text-amber-500">your skills</em>.
          </h1>
          <p className="max-w-[600px] text-lg leading-relaxed text-fg-secondary">
            Steps and projects picked for what you&rsquo;re good at — and where you are.
            Remote work is matched on the languages you speak instead.
          </p>
        </header>

        {/* Matching-basis strip */}
        <section
          aria-label="What these matches are based on"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4"
        >
          <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            Matching on
          </span>
          {seekingSkills.length > 0 ? (
            seekingSkills.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1 text-sm font-medium text-amber-500"
              >
                {s.name}
              </span>
            ))
          ) : (
            <span className="text-sm text-fg-tertiary">No skills on your profile yet</span>
          )}
          {me?.location && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-surface-2 px-3 py-1 text-sm text-fg-secondary">
              <MapPin className="size-3.5 shrink-0" />
              {me.location}
            </span>
          )}
          {languages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-surface-2 px-3 py-1 text-sm text-fg-secondary">
              <Globe className="size-3.5 shrink-0" />
              {languages.map((code) => languageLabel(code) ?? code).join(', ')}
            </span>
          )}
          <Link
            href="/profile"
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-fg-tertiary transition-colors hover:text-amber-500"
          >
            <Pencil className="size-3.5" />
            Edit profile
          </Link>
        </section>

        {skillIds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
            <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
              <Star className="size-7" />
            </div>
            <h3 className="font-display text-2xl">Tell us what you&rsquo;re good at.</h3>
            <p className="max-w-[460px] leading-relaxed text-fg-secondary">
              Matches are built from the skills on your profile. Add a few — any
              skill counts, not just technical ones — and matches will appear here.
            </p>
            <Link
              href="/profile"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
            >
              Add skills to your profile
            </Link>
          </div>
        ) : (
          <SkillMatchesClient cards={cards} />
        )}
      </div>
    </div>
  )
}
