import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isOrgAdminOfProject } from '@/lib/orgs'
import { COUNTRIES } from '@/lib/locales'
import { isCuratorRole } from '@/lib/places'
import {
  EditProjectForm,
  type EditProjectInitial,
  type ProjectMapEntry,
} from '@/components/platform/edit-project-form'

interface EditProjectParams {
  params: Promise<{ id: string }>
}

// Reverse lookup so legacy locations whose trailing segment is a country
// label (written by the old free-text country field) can recover a code.
const CODE_BY_LABEL = new Map(COUNTRIES.map((c) => [c.label.toLowerCase(), c.code]))

/**
 * Country-aware split of the stored "City, Country" display string back into
 * the form's city input + ISO country code. Only a trailing segment that
 * matches a known country label is stripped — anything else stays in `city`
 * untouched (self-healing on the next save, which regenerates the string).
 */
function splitLocation(
  loc: string | null,
  storedCode: string | null,
): { city: string; countryCode: string | null } {
  if (!loc) return { city: '', countryCode: storedCode }
  const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const trailing = parts[parts.length - 1]
    const matchedCode = CODE_BY_LABEL.get(trailing.toLowerCase()) ?? null
    if (matchedCode) {
      return {
        city: parts.slice(0, -1).join(', '),
        // The stored ISO code is authoritative; the label match only fills
        // in for legacy rows that never had a code.
        countryCode: storedCode ?? matchedCode,
      }
    }
  }
  return { city: loc, countryCode: storedCode }
}

export default async function EditProjectPage({ params }: EditProjectParams) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      projectTypeId: true,
      location: true,
      address: true,
      country: true,
      language: true,
      remoteOk: true,
      coverImageUrl: true,
      joinPolicy: true,
      status: true,
      visibility: true,
      place: { select: { slug: true } },
      contributions: {
        where: {
          userId,
          projectStepId: null,
          role: 'lead',
          status: { in: ['active', 'pending'] },
        },
        select: { id: true, status: true },
      },
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          estimatedHrs: true,
          skills: {
            select: { skill: { select: { id: true } } },
          },
        },
      },
    },
  })

  if (!project) notFound()

  // Authz: the lead — or an admin of the owning organisation (spec D4) —
  // can edit. Everyone else bounces to the project view.
  if (project.contributions.length === 0 && !(await isOrgAdminOfProject(id, userId))) {
    redirect(`/projects/${id}`)
  }

  const [skills, projectTypes] = await Promise.all([
    db.skill.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true },
    }),
    db.projectType.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const { city, countryCode } = splitLocation(project.location, project.country)

  const initial: EditProjectInitial = {
    id: project.id,
    title: project.title,
    description: project.description,
    projectTypeId: project.projectTypeId,
    city,
    // remoteOk → yes; off → no. We can't distinguish "some" once saved, so
    // default the toggle to "yes" when remote is allowed and "no" otherwise.
    remote: project.remoteOk ? 'yes' : 'no',
    address: project.address ?? '',
    countryCode,
    languageCode: project.language,
    coverImageUrl: project.coverImageUrl,
    joinPolicy: project.joinPolicy,
    status: project.status,
    steps: project.steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? '',
      skillIds: s.skills.map((ss) => ss.skill.id),
      estimatedHrs: s.estimatedHrs,
    })),
  }

  // The public-map card: only for people who may change the pin directly —
  // an active lead of the project, or a curator. (An org admin who can edit
  // the project but is neither would be refused by submitPlaceAction.)
  const viewer = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  const mayPin =
    project.contributions.some((c) => c.status === 'active') || isCuratorRole(viewer?.role)
  const mapEntry: ProjectMapEntry | null = !mayPin
    ? null
    : project.visibility !== 'public'
      ? { state: 'membersOnly' }
      : project.place
        ? { state: 'onMap', slug: project.place.slug }
        : { state: 'add' }

  return (
    <EditProjectForm
      initial={initial}
      skills={skills}
      projectTypes={projectTypes}
      mapEntry={mapEntry}
    />
  )
}
