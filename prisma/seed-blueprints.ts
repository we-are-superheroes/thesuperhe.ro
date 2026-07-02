// Seed the blueprint catalogue from the "Seeding blueprints" CSV drop:
// 50 canonical (English) blueprints with steps + step skills, plus fr/de
// translated variants (parented to the canonical blueprint, country CH).
//
// Only fields that exist in the schema are used — the CSVs' tier / appeal /
// effort / duration / remote_friendly columns are intentionally ignored, and
// skills stay in English (skill_translations.csv is unused) until proper
// internationalisation lands.
//
// Idempotent: canonical blueprints are skipped when their title already
// exists; variants when the parent already has a variant in that language.
//
//   DATABASE_URL=… npx tsx prisma/seed-blueprints.ts "../Seeding blueprints"
import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

/* ── Minimal RFC-4180 CSV parser (quotes, escaped quotes, newlines) ── */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  const [header, ...data] = rows
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

/* ── CSV category → existing ProjectType name ── */
const TYPE_BY_CATEGORY: Record<string, string> = {
  'waste-circular-economy': 'Waste Reduction',
  'food-agriculture': 'Food & Agriculture',
  'biodiversity-nature': 'Biodiversity',
  energy: 'Community Energy',
  mobility: 'Transport & Mobility',
  'built-environment': 'Built Environment',
  'education-community': 'Education & Awareness',
}

/** BCP 47 ("fr-CH") → our ISO 639-1 language column ("fr"). */
const langOf = (bcp47: string) => bcp47.split('-')[0].toLowerCase()

async function main() {
  const root = process.argv[2]
  if (!root) throw new Error('Usage: npx tsx prisma/seed-blueprints.ts <folder>')
  const canonDir = join(root, '2026-07-02_Blueprints')
  const transDir = join(root, '2026-07-02_BlueprintTranslations')
  const load = (dir: string, f: string) => parseCsv(readFileSync(join(dir, f), 'utf8'))

  const skills = load(canonDir, 'skills.csv')
  const blueprints = load(canonDir, 'blueprints.csv')
  const steps = load(canonDir, 'blueprint_steps.csv')
  const stepSkills = load(canonDir, 'step_skills.csv')
  const bpTranslations = load(transDir, 'blueprint_translations.csv')
  const stepTranslations = load(transDir, 'blueprint_step_translations.csv')

  const creator = await db.user.findFirst({
    where: { role: 'admin' },
    select: { id: true, email: true },
  })
  if (!creator) throw new Error('No admin user found to own the blueprints.')
  console.log(`Creator: ${creator.email}`)

  // ── Skills: reuse existing rows case-insensitively; create the rest ──
  const existingSkills = await db.skill.findMany({ select: { id: true, name: true } })
  const byLowerName = new Map(existingSkills.map((s) => [s.name.toLowerCase(), s.id]))
  const skillIdBySlug = new Map<string, string>()
  let createdSkills = 0
  for (const s of skills) {
    let id = byLowerName.get(s.name.toLowerCase())
    if (!id) {
      const created = await db.skill.create({
        data: { name: s.name, category: s.category },
        select: { id: true },
      })
      id = created.id
      byLowerName.set(s.name.toLowerCase(), id)
      createdSkills++
    }
    skillIdBySlug.set(s.skill_slug, id)
  }
  console.log(`Skills: ${createdSkills} created, ${skills.length - createdSkills} matched existing.`)

  const projectTypes = await db.projectType.findMany({ select: { id: true, name: true } })
  const typeIdByName = new Map(projectTypes.map((t) => [t.name, t.id]))

  // Group child rows by their parents once.
  const stepsByBlueprint = new Map<string, typeof steps>()
  for (const s of steps) {
    const list = stepsByBlueprint.get(s.blueprint_slug) ?? []
    list.push(s)
    stepsByBlueprint.set(s.blueprint_slug, list)
  }
  const skillSlugsByStep = new Map<string, string[]>()
  for (const ss of stepSkills) {
    const list = skillSlugsByStep.get(ss.step_slug) ?? []
    list.push(ss.skill_slug)
    skillSlugsByStep.set(ss.step_slug, list)
  }
  const bpTransBySlug = new Map<string, typeof bpTranslations>()
  for (const t of bpTranslations) {
    const list = bpTransBySlug.get(t.blueprint_slug) ?? []
    list.push(t)
    bpTransBySlug.set(t.blueprint_slug, list)
  }
  const stepTransByKey = new Map<string, { title: string; description: string }>()
  for (const t of stepTranslations) {
    stepTransByKey.set(`${t.step_slug}|${langOf(t.language)}`, {
      title: t.title,
      description: t.description,
    })
  }

  let createdCanonical = 0
  let createdVariants = 0
  let skipped = 0

  for (const bp of blueprints) {
    const projectTypeId = typeIdByName.get(TYPE_BY_CATEGORY[bp.category] ?? '') ?? null
    const bpSteps = (stepsByBlueprint.get(bp.blueprint_slug) ?? []).sort(
      (a, b) => Number(a.step_order) - Number(b.step_order),
    )

    // ── Canonical (English) blueprint ──
    let canonicalId: string
    const existing = await db.blueprint.findFirst({
      where: { title: bp.title, parentBlueprintId: null },
      select: { id: true },
    })
    if (existing) {
      canonicalId = existing.id
      skipped++
    } else {
      canonicalId = await db.$transaction(async (tx) => {
        const created = await tx.blueprint.create({
          data: {
            createdById: creator.id,
            projectTypeId,
            title: bp.title,
            description: bp.summary,
            language: 'en',
            country: null,
            estimatedHrs: Number(bp.total_estimated_hours) || null,
          },
          select: { id: true },
        })
        for (const s of bpSteps) {
          const step = await tx.blueprintStep.create({
            data: {
              blueprintId: created.id,
              title: s.title,
              description: s.description || null,
              order: Number(s.step_order),
              estimatedHrs: Number(s.estimated_hours) || null,
            },
            select: { id: true },
          })
          const slugs = skillSlugsByStep.get(s.step_slug) ?? []
          if (slugs.length > 0) {
            await tx.stepSkill.createMany({
              data: slugs.map((slug) => ({
                skillId: skillIdBySlug.get(slug)!,
                blueprintStepId: step.id,
              })),
            })
          }
        }
        return created.id
      })
      createdCanonical++
    }

    // ── Translated variants (fr, de) — English skills, CH country ──
    for (const trans of bpTransBySlug.get(bp.blueprint_slug) ?? []) {
      const language = langOf(trans.language)
      const already = await db.blueprint.findFirst({
        where: { parentBlueprintId: canonicalId, language },
        select: { id: true },
      })
      if (already) {
        skipped++
        continue
      }
      await db.$transaction(async (tx) => {
        const variant = await tx.blueprint.create({
          data: {
            createdById: creator.id,
            projectTypeId,
            parentBlueprintId: canonicalId,
            title: trans.title,
            description: trans.summary,
            language,
            country: 'CH', // translations are fr-CH / de-CH
            estimatedHrs: Number(bp.total_estimated_hours) || null,
          },
          select: { id: true },
        })
        for (const s of bpSteps) {
          const t = stepTransByKey.get(`${s.step_slug}|${language}`)
          const step = await tx.blueprintStep.create({
            data: {
              blueprintId: variant.id,
              title: t?.title || s.title,
              description: (t?.description || s.description) || null,
              order: Number(s.step_order),
              estimatedHrs: Number(s.estimated_hours) || null,
            },
            select: { id: true },
          })
          const slugs = skillSlugsByStep.get(s.step_slug) ?? []
          if (slugs.length > 0) {
            await tx.stepSkill.createMany({
              data: slugs.map((slug) => ({
                skillId: skillIdBySlug.get(slug)!,
                blueprintStepId: step.id,
              })),
            })
          }
        }
      })
      createdVariants++
    }
    console.log(`  ${bp.blueprint_slug} done`)
  }

  console.log(
    `Done. ${createdCanonical} canonical + ${createdVariants} variants created, ${skipped} skipped (already present).`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
