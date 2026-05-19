import { db } from '@/lib/db'
import { BrowseProjectsClient, type BrowseProject } from '@/components/platform/browse-projects-client'

/* ================================================================
   BROWSE PROJECTS — server component
   Fetches all active projects + filter taxonomies from the DB,
   then hands them to a client component for filtering/sorting.
   ================================================================ */

const TYPE_IMG_KEY: Record<string, string> = {
  'Community Energy': 'energy',
  'Urban Rewilding': 'rewild',
  'Repair & Reuse': 'circular',
  'Policy Advocacy': 'policy',
  'Food & Agriculture': 'food',
  'Transport & Mobility': 'mobility',
  'Water & Conservation': 'water',
  'Education & Awareness': 'education',
  'Biodiversity': 'rewild',
  'Waste Reduction': 'circular',
  'Climate Finance': 'energy',
  'Research & Data': 'policy',
  'Built Environment': 'mobility',
  'Ocean & Marine': 'water',
}

async function getBrowseData(): Promise<{
  projects: BrowseProject[]
  projectTypes: { id: string; name: string; count: number }[]
  skills: { id: string; name: string; count: number }[]
  locations: { name: string; count: number }[]
}> {
  const [projects, projectTypes, skills] = await Promise.all([
    db.project.findMany({
      where: { status: { in: ['defining', 'needs_help', 'in_progress'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        remoteOk: true,
        timeCommitmentHrs: true,
        coverImageUrl: true,
        createdAt: true,
        projectType: { select: { id: true, name: true } },
        steps: {
          select: {
            status: true,
            skills: {
              select: {
                skill: { select: { id: true, name: true } },
              },
            },
          },
        },
        contributions: { select: { id: true } },
      },
    }),
    db.projectType.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.skill.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  // Compute days ago helper
  const daysAgo = (d: Date) => Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  const postedLabel = (n: number) =>
    n <= 0 ? 'today' : n === 1 ? '1 day ago' : n < 7 ? `${n} days ago` : n < 14 ? '1 week ago' : `${Math.floor(n / 7)} weeks ago`

  // Shape projects for the client
  const browseProjects: BrowseProject[] = projects.map((p) => {
    const totalSteps = p.steps.length
    const doneSteps = p.steps.filter((s) => s.status === 'completed').length
    const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0
    const needs = p.steps.filter((s) => s.status === 'needs_help').length

    // Unique skill names across all steps
    const skillNameSet = new Set<string>()
    const skillIdSet = new Set<string>()
    for (const step of p.steps) {
      for (const ss of step.skills) {
        skillNameSet.add(ss.skill.name)
        skillIdSet.add(ss.skill.id)
      }
    }

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      location: p.location ?? 'Remote',
      type: p.projectType?.name ?? 'Other',
      typeId: p.projectType?.id ?? null,
      imgKey: (p.projectType?.name && TYPE_IMG_KEY[p.projectType.name]) ?? 'rewild',
      coverImageUrl: p.coverImageUrl ?? null,
      skills: Array.from(skillNameSet),
      skillIds: Array.from(skillIdSet),
      needs,
      progress,
      contributors: p.contributions.length,
      posted: postedLabel(daysAgo(p.createdAt)),
      sortRecent: daysAgo(p.createdAt),
      sortNeeds: needs,
      sortProgress: progress,
    }
  })

  // Compute counts for each filter taxon based on the visible projects
  const typeCount = new Map<string, number>()
  const skillCount = new Map<string, number>()
  const locationCount = new Map<string, number>()
  for (const p of browseProjects) {
    if (p.typeId) typeCount.set(p.typeId, (typeCount.get(p.typeId) ?? 0) + 1)
    for (const sid of p.skillIds) skillCount.set(sid, (skillCount.get(sid) ?? 0) + 1)
    locationCount.set(p.location, (locationCount.get(p.location) ?? 0) + 1)
  }

  const typesWithCounts = projectTypes
    .map((t) => ({ id: t.id, name: t.name, count: typeCount.get(t.id) ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)

  const skillsWithCounts = skills
    .map((s) => ({ id: s.id, name: s.name, count: skillCount.get(s.id) ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)

  const locationsWithCounts = Array.from(locationCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    projects: browseProjects,
    projectTypes: typesWithCounts,
    skills: skillsWithCounts,
    locations: locationsWithCounts,
  }
}

export default async function BrowseProjectsPage() {
  const data = await getBrowseData()

  return (
    <BrowseProjectsClient
      projects={data.projects}
      projectTypes={data.projectTypes}
      skills={data.skills}
      locations={data.locations}
    />
  )
}
