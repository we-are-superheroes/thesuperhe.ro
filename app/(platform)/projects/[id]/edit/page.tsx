import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  EditProjectForm,
  type EditProjectInitial,
} from '@/components/platform/edit-project-form'

interface EditProjectParams {
  params: Promise<{ id: string }>
}

/**
 * Best-effort split of "City, Country" back into the form's two fields.
 * Falls back to putting the whole thing in `city` if it doesn't look like a
 * clean comma split.
 */
function splitLocation(loc: string | null): { city: string; country: string } {
  if (!loc) return { city: '', country: '' }
  const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const country = parts[parts.length - 1]
    const city = parts.slice(0, -1).join(', ')
    return { city, country }
  }
  return { city: loc, country: '' }
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
      remoteOk: true,
      coverImageUrl: true,
      joinPolicy: true,
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

  const { city, country } = splitLocation(project.location)

  const initial: EditProjectInitial = {
    id: project.id,
    title: project.title,
    description: project.description,
    city,
    country,
    // remoteOk → yes; off → no. We can't distinguish "some" once saved, so
    // default the toggle to "yes" when remote is allowed and "no" otherwise.
    remote: project.remoteOk ? 'yes' : 'no',
    coverImageUrl: project.coverImageUrl,
    joinPolicy: project.joinPolicy,
    steps: project.steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? '',
      skillId: s.skills[0]?.skill.id ?? null,
    })),
  }

  return <EditProjectForm initial={initial} skills={skills} />
}
