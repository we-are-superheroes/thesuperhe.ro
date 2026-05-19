import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  EditBlueprintForm,
  type EditBlueprintInitial,
  type ParentBlueprintOption,
} from '@/components/platform/edit-blueprint-form'

interface PageParams {
  params: Promise<{ id: string }>
}

export default async function EditBlueprintPage({ params }: PageParams) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const blueprint = await db.blueprint.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      projectTypeId: true,
      parentBlueprintId: true,
      country: true,
      language: true,
      createdById: true,
      _count: { select: { variants: true } },
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          estimatedHrs: true,
          skills: { select: { skill: { select: { id: true } } } },
        },
      },
    },
  })
  if (!blueprint) notFound()
  if (blueprint.createdById !== userId) {
    // Non-creators can view but not edit.
    redirect(`/blueprints/${id}`)
  }

  // Eligible parents: every root blueprint (parentBlueprintId = null) except
  // this one. If this blueprint already has children, it can't itself become
  // a variant — we hide the parent picker in that case.
  let parentOptions: ParentBlueprintOption[] = []
  const canHaveParent = blueprint._count.variants === 0
  if (canHaveParent) {
    const roots = await db.blueprint.findMany({
      where: { parentBlueprintId: null, id: { not: id } },
      orderBy: [{ title: 'asc' }],
      select: { id: true, title: true, country: true, language: true },
    })
    parentOptions = roots
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

  const initial: EditBlueprintInitial = {
    id: blueprint.id,
    title: blueprint.title,
    description: blueprint.description,
    projectTypeId: blueprint.projectTypeId,
    parentBlueprintId: blueprint.parentBlueprintId,
    countryCode: blueprint.country,
    languageCode: blueprint.language,
    childCount: blueprint._count.variants,
    steps: blueprint.steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? '',
      skillIds: s.skills.map((ss) => ss.skill.id),
      estimatedHrs: s.estimatedHrs,
    })),
  }

  return (
    <EditBlueprintForm
      initial={initial}
      skills={skills}
      projectTypes={projectTypes}
      parents={parentOptions}
      canHaveParent={canHaveParent}
    />
  )
}
