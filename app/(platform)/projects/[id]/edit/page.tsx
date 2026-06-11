import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { COUNTRIES } from '@/lib/locales'
import {
  EditProjectForm,
  type EditProjectInitial,
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
      location: true,
      address: true,
      country: true,
      language: true,
      remoteOk: true,
      coverImageUrl: true,
      joinPolicy: true,
      status: true,
      contributions: {
        where: {
          userId,
          projectStepId: null,
          role: 'lead',
          status: { in: ['active', 'pending'] },
        },
        select: { id: true },
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

  // Authz: only the lead can edit. Non-leads bounce to the project view.
  if (project.contributions.length === 0) {
    redirect(`/projects/${id}`)
  }

  const skills = await db.skill.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true },
  })

  const { city, countryCode } = splitLocation(project.location, project.country)

  const initial: EditProjectInitial = {
    id: project.id,
    title: project.title,
    description: project.description,
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

  return <EditProjectForm initial={initial} skills={skills} />
}
