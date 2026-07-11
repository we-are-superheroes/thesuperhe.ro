import 'server-only'
import { db } from '@/lib/db'
import { visibleProjectsWhere } from '@/lib/orgs'
import { languageLabel } from '@/lib/locales'
import {
  analyseMatch,
  cityOf,
  LANGUAGE_SKILL_TO_ISO,
  type MatchMe,
} from '@/lib/matching'
import type { MatchCardData } from '@/components/platform/skill-matches-client'

/* ================================================================
   Shared skill-match feed: joinable steps and projects scored
   against the user's seeking skills, city and spoken languages
   (scoring in lib/matching.ts). Used by /skill-matches (full list)
   and the dashboard's "Projects that need you" (top 3).
   ================================================================ */

const LIVE_PROJECT_STATUSES = ['defining', 'needs_help', 'in_progress'] as const
const JOINABLE_STEP_STATUSES = ['open', 'in_progress'] as const

export interface SkillMatchFeed {
  /** Scored cards, best match first. */
  cards: MatchCardData[]
  /** The non-language skills the matching is based on. */
  seekingSkills: Array<{ id: string; name: string }>
  /** ISO codes of the user's language skills. */
  languages: string[]
  /** The user's profile location string (city input). */
  location: string | null
}

export async function getSkillMatchFeed(userId: string): Promise<SkillMatchFeed> {
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

  return {
    cards,
    seekingSkills: seekingSkills.map((s) => ({ id: s.id, name: s.name })),
    languages,
    location: me?.location ?? null,
  }
}
