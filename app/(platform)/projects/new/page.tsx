import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getUserActiveOrgs } from '@/lib/orgs'
import {
  CreateProjectForm,
  type BlueprintOption,
  type SkillOption,
} from '@/components/platform/create-project-form'

/* ================================================================
   /projects/new — the create-project editor.

   Entry points:
     · plain            → the chooser (scratch · Browse blueprints).
     · ?blueprint=<id>  → straight to the editor, pre-filled from that
                          blueprint ("Use blueprint").
     · &variant=1       → same, but the blueprint-save split button
                          defaults to "Save as blueprint variant"
                          ("Create variant").

   A saved variant must hang off a family *root* (one level deep). If
   the source blueprint is itself a variant, we parent the new variant
   under its root so it lands as a sibling.
   ================================================================ */

interface SearchParams {
  searchParams: Promise<{ blueprint?: string; variant?: string; org?: string }>
}

export default async function CreateProjectPage({ searchParams }: SearchParams) {
  const params = await searchParams
  const blueprintId = params.blueprint?.trim() || null
  const variantIntent = params.variant === '1'
  const { userId } = await auth()

  const [source, skills, orgRows] = await Promise.all([
    blueprintId
      ? db.blueprint.findUnique({
          where: { id: blueprintId },
          select: {
            id: true,
            title: true,
            description: true,
            projectTypeId: true,
            country: true,
            language: true,
            parentBlueprintId: true,
            steps: {
              orderBy: { order: 'asc' },
              select: {
                title: true,
                description: true,
                estimatedHrs: true,
                skills: { select: { skill: { select: { id: true } } } },
              },
            },
          },
        })
      : Promise.resolve(null),
    db.skill.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true },
    }),
    userId ? getUserActiveOrgs(userId) : Promise.resolve([]),
  ])

  // Only active orgs can own projects — hide pending ones from the picker.
  const myOrgs = orgRows
    .filter((row) => row.org.status === 'active')
    .map((row) => ({ id: row.org.id, slug: row.org.slug, name: row.org.name }))

  const sourceBlueprint: BlueprintOption | null = source
    ? {
        id: source.id,
        title: source.title,
        description: source.description,
        projectTypeId: source.projectTypeId,
        country: source.country,
        language: source.language,
        steps: source.steps.map((s) => ({
          title: s.title,
          description: s.description ?? '',
          skillIds: s.skills.map((ss) => ss.skill.id),
          estimatedHrs: s.estimatedHrs,
        })),
      }
    : null

  // The root the new variant parents under: the source's parent if it's
  // already a variant, otherwise the source itself.
  const variantParentId = source
    ? (source.parentBlueprintId ?? source.id)
    : null

  const skillOptions: SkillOption[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  }))

  return (
    <CreateProjectForm
      sourceBlueprint={sourceBlueprint}
      variantIntent={variantIntent}
      variantParentId={variantParentId}
      skills={skillOptions}
      myOrgs={myOrgs}
      initialOrgSlug={params.org?.trim() || null}
    />
  )
}
