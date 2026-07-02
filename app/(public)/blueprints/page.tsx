import { db } from '@/lib/db'
import {
  BlueprintsClient,
  type BlueprintFamily,
  type BlueprintVariantOption,
} from '@/components/platform/blueprints-client'
import { COUNTRIES, LANGUAGES } from '@/lib/locales'

/* ================================================================
   /blueprints — public catalog.

   A "family" is a root blueprint (parentBlueprintId = null) and its
   immediate children (the localised variants). Root + children get
   bundled into one card so users can flip between locales without
   leaving the page.

   One-level deep only (see schema comments). Anyone can browse
   without signing in; the "Use blueprint" CTA bounces through
   /sign-in when needed.
   ================================================================ */

type RawBlueprint = {
  id: string
  title: string
  description: string
  language: string | null
  country: string | null
  reuseCount: number
  createdAt: Date
  parentBlueprintId: string | null
  projectTypeId: string | null
  projectType: { id: string; name: string } | null
  _count: { steps: number; projects: number }
}

export const metadata = {
  title: 'Blueprints — The Superhero',
  description:
    'Proven, reusable project plans — repair cafés, pocket forests, solar co-ops and more. Fork one and adapt it to your community.',
}

export default async function BlueprintsCatalogPage() {
  const [blueprints, projectTypes] = await Promise.all([
    db.blueprint.findMany({
      orderBy: [{ reuseCount: 'desc' }, { createdAt: 'desc' }],
      // Ceiling for the fetch-all + client-side-filter approach. Move to
      // real pagination when the catalogue approaches this.
      take: 500,
      select: {
        id: true,
        title: true,
        description: true,
        language: true,
        country: true,
        reuseCount: true,
        createdAt: true,
        parentBlueprintId: true,
        projectTypeId: true,
        projectType: { select: { id: true, name: true } },
        _count: { select: { steps: true, projects: true } },
      },
    }),
    db.projectType.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const byId = new Map<string, RawBlueprint>(
    blueprints.map((b) => [b.id, b as RawBlueprint]),
  )

  // Group into families: roots (no parent) + their immediate children. If a
  // child references a parent that doesn't exist (e.g. parent deleted), treat
  // it as a root so we don't lose blueprints.
  const childrenByRoot = new Map<string, RawBlueprint[]>()
  const roots: RawBlueprint[] = []
  for (const b of blueprints as RawBlueprint[]) {
    if (b.parentBlueprintId && byId.has(b.parentBlueprintId)) {
      const list = childrenByRoot.get(b.parentBlueprintId) ?? []
      list.push(b)
      childrenByRoot.set(b.parentBlueprintId, list)
    } else {
      roots.push(b)
    }
  }

  const shapeVariant = (b: RawBlueprint): BlueprintVariantOption => ({
    id: b.id,
    title: b.title,
    description: b.description,
    country: b.country,
    language: b.language,
    reuseCount: b.reuseCount,
    stepCount: b._count.steps,
    isRoot: !b.parentBlueprintId,
  })

  const families: BlueprintFamily[] = roots.map((root) => {
    const children = (childrenByRoot.get(root.id) ?? []).slice()
    // Sort children by country label then language code for a stable chip row.
    children.sort((a, b) => {
      const ca = (a.country ?? '').localeCompare(b.country ?? '')
      if (ca !== 0) return ca
      return (a.language ?? '').localeCompare(b.language ?? '')
    })
    const variants = [shapeVariant(root), ...children.map(shapeVariant)]
    const totalReuse = variants.reduce((n, v) => n + v.reuseCount, 0)
    return {
      id: root.id,
      title: root.title,
      tagline: firstSentence(root.description),
      description: root.description,
      projectTypeId: root.projectTypeId,
      projectTypeName: root.projectType?.name ?? null,
      totalReuse,
      stepCount: root._count.steps,
      addedAt: root.createdAt.getTime(),
      variants,
    }
  })

  // Filter taxonomy counts.
  const typeCount = new Map<string, number>()
  const countryCount = new Map<string, number>()
  const languageCount = new Map<string, number>()
  for (const fam of families) {
    if (fam.projectTypeId) {
      typeCount.set(fam.projectTypeId, (typeCount.get(fam.projectTypeId) ?? 0) + 1)
    }
    const seenCountries = new Set<string>()
    const seenLanguages = new Set<string>()
    for (const v of fam.variants) {
      if (v.country) seenCountries.add(v.country)
      if (v.language) seenLanguages.add(v.language)
    }
    for (const c of seenCountries) countryCount.set(c, (countryCount.get(c) ?? 0) + 1)
    for (const l of seenLanguages) languageCount.set(l, (languageCount.get(l) ?? 0) + 1)
  }

  const typeOptions = projectTypes
    .map((t) => ({ id: t.id, name: t.name, count: typeCount.get(t.id) ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)

  const countryOptions = COUNTRIES.map((c) => ({
    code: c.code,
    label: c.label,
    count: countryCount.get(c.code) ?? 0,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)

  const languageOptions = LANGUAGES.map((l) => ({
    code: l.code,
    label: l.label,
    count: languageCount.get(l.code) ?? 0,
  }))
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count)

  const totalVariants = families.reduce((n, f) => n + f.variants.length, 0)
  const totalLaunches = families.reduce((n, f) => n + f.totalReuse, 0)

  return (
    <BlueprintsClient
      families={families}
      types={typeOptions}
      countries={countryOptions}
      languages={languageOptions}
      stats={{
        familyCount: families.length,
        variantCount: totalVariants,
        launchCount: totalLaunches,
      }}
    />
  )
}

function firstSentence(s: string): string {
  const trimmed = s.trim()
  const stop = trimmed.search(/(?<=[.!?])\s/)
  if (stop === -1 || stop > 180) return trimmed.slice(0, 180)
  return trimmed.slice(0, stop + 1)
}
