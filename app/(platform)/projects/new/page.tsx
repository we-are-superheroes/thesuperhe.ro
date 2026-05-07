import { db } from '@/lib/db'
import {
  CreateProjectForm,
  type BlueprintOption,
  type SkillOption,
} from '@/components/platform/create-project-form'

export default async function CreateProjectPage() {
  const [blueprints, skills] = await Promise.all([
    db.blueprint.findMany({
      orderBy: [{ reuseCount: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        reuseCount: true,
        projectTypeId: true,
        projectType: { select: { id: true, name: true } },
        steps: {
          orderBy: { order: 'asc' },
          select: {
            title: true,
            description: true,
            order: true,
            skills: { select: { skill: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    db.skill.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true },
    }),
  ])

  // Pretty emoji per project type for the blueprint thumbnail
  const TYPE_EMOJI: Record<string, string> = {
    'Community Energy': '☀️',
    'Urban Rewilding': '🌳',
    'Repair & Reuse': '🛠',
    'Policy Advocacy': '📜',
    'Food & Agriculture': '🥕',
    'Transport & Mobility': '🚲',
    'Water & Conservation': '💧',
    'Education & Awareness': '📚',
    Biodiversity: '🦋',
    'Waste Reduction': '♻️',
    'Climate Finance': '💚',
    'Research & Data': '🔬',
    'Built Environment': '🏗️',
    'Ocean & Marine': '🌊',
  }
  const TYPE_COLOR: Record<string, string> = {
    'Community Energy': '#F4A535',
    'Urban Rewilding': '#3DAF7C',
    'Repair & Reuse': '#F7BD64',
    'Policy Advocacy': '#B2D0F5',
    'Food & Agriculture': '#7DD3B0',
    'Transport & Mobility': '#FAD08F',
    'Water & Conservation': '#7AAEE8',
    'Education & Awareness': '#F4A535',
    Biodiversity: '#3DAF7C',
    'Waste Reduction': '#F7BD64',
  }

  const blueprintOptions: BlueprintOption[] = blueprints.map((bp) => ({
    id: bp.id,
    title: bp.title,
    description: bp.description,
    reuseCount: bp.reuseCount,
    stepCount: bp.steps.length,
    projectTypeId: bp.projectTypeId,
    projectTypeName: bp.projectType?.name ?? null,
    emoji: (bp.projectType?.name && TYPE_EMOJI[bp.projectType.name]) ?? '✨',
    color: (bp.projectType?.name && TYPE_COLOR[bp.projectType.name]) ?? '#F4A535',
    steps: bp.steps.map((s) => ({
      title: s.title,
      description: s.description ?? '',
      skillId: s.skills[0]?.skill.id ?? null,
    })),
  }))

  const skillOptions: SkillOption[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  }))

  return <CreateProjectForm blueprints={blueprintOptions} skills={skillOptions} />
}
