// Lausanne example projects + tags existing project descriptions with an
// "Example:" prefix. Skips titles that already exist. Run manually:
//   DATABASE_URL=… npx tsx prisma/seed-examples.ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

/**
 * Seed additional example projects (Lausanne-based) and tag the existing
 * sample projects with an "Example:" prefix so it's clear they're demo data.
 */
async function main() {
  // ── 1. Tag existing projects as examples ─────────────────────────────
  console.log('Tagging existing projects with "Example:" prefix...')
  const existing = await db.project.findMany({
    where: { description: { not: { startsWith: 'Example:' } } },
    select: { id: true, description: true },
  })
  for (const p of existing) {
    await db.project.update({
      where: { id: p.id },
      data: { description: `Example: ${p.description}` },
    })
  }
  console.log(`  Tagged ${existing.length} existing projects.`)

  // ── 2. Look up project types and skills ──────────────────────────────
  const [
    waterCons, repairReuse, communityEnergy, biodiversity, transportMobility,
    foodAg, education,
    envScience, biology, communityOrganising, projectMgmt, dataAnalysis,
    grantWriting, eventCoord, webDev, copywriting, socialMedia,
    facilitation, , gis,
  ] = await Promise.all([
    db.projectType.findUnique({ where: { name: 'Water & Conservation' } }),
    db.projectType.findUnique({ where: { name: 'Repair & Reuse' } }),
    db.projectType.findUnique({ where: { name: 'Community Energy' } }),
    db.projectType.findUnique({ where: { name: 'Biodiversity' } }),
    db.projectType.findUnique({ where: { name: 'Transport & Mobility' } }),
    db.projectType.findUnique({ where: { name: 'Food & Agriculture' } }),
    db.projectType.findUnique({ where: { name: 'Education & Awareness' } }),
    db.skill.findUnique({ where: { name: 'Environmental science' } }),
    db.skill.findUnique({ where: { name: 'Biology / ecology' } }),
    db.skill.findUnique({ where: { name: 'Community organising' } }),
    db.skill.findUnique({ where: { name: 'Project management' } }),
    db.skill.findUnique({ where: { name: 'Data analysis' } }),
    db.skill.findUnique({ where: { name: 'Grant writing' } }),
    db.skill.findUnique({ where: { name: 'Event coordination' } }),
    db.skill.findUnique({ where: { name: 'Web development' } }),
    db.skill.findUnique({ where: { name: 'Copywriting' } }),
    db.skill.findUnique({ where: { name: 'Social media' } }),
    db.skill.findUnique({ where: { name: 'Facilitation' } }),
    db.skill.findUnique({ where: { name: 'Engineering' } }),
    db.skill.findUnique({ where: { name: 'GIS / mapping' } }),
    db.skill.findUnique({ where: { name: 'Architecture' } }),
  ])

  type LausanneProject = {
    title: string
    description: string
    location: string
    remoteOk: boolean
    timeCommitmentHrs: number
    projectTypeId: string | null
    steps: Array<{
      title: string
      description: string
      order: number
      estimatedHrs: number
      status: 'needs_help' | 'open' | 'in_progress'
      skillIds: Array<string | undefined>
    }>
  }

  const lausanneProjects: LausanneProject[] = [
    {
      title: 'Lake Geneva water quality citizen monitoring',
      description:
        'Example: A volunteer-led network sampling micro-plastic and nutrient levels along the Lausanne lakefront. Monthly readings feed an open dataset used by EPFL researchers and the Canton.',
      location: 'Lausanne, Switzerland',
      remoteOk: false,
      timeCommitmentHrs: 8,
      projectTypeId: waterCons?.id ?? null,
      steps: [
        { title: 'Map sampling sites along the lakefront', description: 'Identify 12 stable monitoring points from Vidy to Pully using GIS data.', order: 1, estimatedHrs: 5, status: 'needs_help', skillIds: [gis?.id, envScience?.id] },
        { title: 'Recruit volunteer samplers', description: 'Run an info evening at the Lausanne Maker Space to onboard 20 volunteers.', order: 2, estimatedHrs: 4, status: 'needs_help', skillIds: [communityOrganising?.id, eventCoord?.id] },
        { title: 'Build the open data dashboard', description: 'A simple Next.js dashboard so the public can see live readings.', order: 3, estimatedHrs: 12, status: 'needs_help', skillIds: [webDev?.id, dataAnalysis?.id] },
        { title: 'Draft sampling protocol', description: 'A one-page protocol that any volunteer can follow in 20 minutes.', order: 4, estimatedHrs: 3, status: 'open', skillIds: [envScience?.id, copywriting?.id] },
      ],
    },
    {
      title: 'Flon district repair café',
      description:
        'Example: A monthly fix-it event in the Flon, run with local makerspaces. Specialises in small electronics, bikes, and clothing — keeping things out of the Tridel incinerator.',
      location: 'Lausanne, Switzerland',
      remoteOk: false,
      timeCommitmentHrs: 5,
      projectTypeId: repairReuse?.id ?? null,
      steps: [
        { title: 'Find a recurring venue', description: 'Approach venues in the Flon for a free Saturday slot once a month.', order: 1, estimatedHrs: 3, status: 'needs_help', skillIds: [communityOrganising?.id] },
        { title: 'Recruit repair volunteers', description: 'We need 6 fixers across electronics, bikes, and textiles.', order: 2, estimatedHrs: 4, status: 'needs_help', skillIds: [communityOrganising?.id, socialMedia?.id] },
        { title: 'Translate signage to FR/DE/EN', description: 'Triple-language signage so the café is accessible to all of Lausanne.', order: 3, estimatedHrs: 2, status: 'open', skillIds: [copywriting?.id] },
        { title: 'Run the launch event', description: 'Coordinate the first Saturday: setup, volunteer briefing, visitor flow.', order: 4, estimatedHrs: 6, status: 'open', skillIds: [eventCoord?.id, projectMgmt?.id] },
      ],
    },
    {
      title: 'Sauvabelin urban biodiversity corridor',
      description:
        'Example: Connecting the Bois de Sauvabelin to the lake with native-plant pollinator strips along Avenue de Beaulieu. Working with the Ville de Lausanne parks team.',
      location: 'Lausanne, Switzerland',
      remoteOk: false,
      timeCommitmentHrs: 7,
      projectTypeId: biodiversity?.id ?? null,
      steps: [
        { title: 'Survey existing pollinator habitat', description: 'Walk the proposed corridor and map current flowering species and gaps.', order: 1, estimatedHrs: 6, status: 'needs_help', skillIds: [biology?.id, gis?.id] },
        { title: 'Choose native species mix', description: 'Pick 15 species suited to Vaud altitudes and well-loved by local pollinators.', order: 2, estimatedHrs: 4, status: 'needs_help', skillIds: [biology?.id, envScience?.id] },
        { title: 'Submit proposal to the city', description: 'Formal proposal to the Service des parcs et domaines.', order: 3, estimatedHrs: 6, status: 'open', skillIds: [grantWriting?.id, copywriting?.id] },
        { title: 'Run a community planting day', description: 'A Saturday in May with families from neighbouring quartiers.', order: 4, estimatedHrs: 5, status: 'open', skillIds: [eventCoord?.id, communityOrganising?.id] },
      ],
    },
    {
      title: 'Lausanne rooftop solar co-op',
      description:
        'Example: Pooling households across Sous-Gare and Renens to negotiate a group rate on PV panels. Builds on the Canton de Vaud subsidy programme.',
      location: 'Lausanne, Switzerland',
      remoteOk: true,
      timeCommitmentHrs: 10,
      projectTypeId: communityEnergy?.id ?? null,
      steps: [
        { title: 'Map suitable rooftops', description: 'Use Swisstopo solar potential data to identify 40+ candidate addresses.', order: 1, estimatedHrs: 8, status: 'needs_help', skillIds: [gis?.id, dataAnalysis?.id] },
        { title: 'Negotiate group rate with installers', description: 'Get bids from 3 Vaud-based MCS-equivalent installers.', order: 2, estimatedHrs: 6, status: 'needs_help', skillIds: [projectMgmt?.id] },
        { title: 'Build sign-up website', description: 'Bilingual FR/EN landing page where households register interest.', order: 3, estimatedHrs: 8, status: 'in_progress', skillIds: [webDev?.id] },
        { title: 'Outreach to neighbourhood associations', description: 'Brief Société de développement Sous-Gare and similar groups.', order: 4, estimatedHrs: 4, status: 'open', skillIds: [communityOrganising?.id, facilitation?.id] },
      ],
    },
    {
      title: 'Vélo-école for new arrivals',
      description:
        'Example: Free Saturday cycling lessons for refugees and migrants in the Lausanne area. Bikes provided by Pro Velo Vaud — we need volunteer instructors and a route planner.',
      location: 'Lausanne, Switzerland',
      remoteOk: false,
      timeCommitmentHrs: 4,
      projectTypeId: transportMobility?.id ?? null,
      steps: [
        { title: 'Recruit volunteer cycling instructors', description: 'Six confident cyclists, ideally multilingual.', order: 1, estimatedHrs: 4, status: 'needs_help', skillIds: [communityOrganising?.id, facilitation?.id] },
        { title: 'Plan beginner-friendly routes', description: 'Map quiet routes from Vidy to Bellerive avoiding main roads.', order: 2, estimatedHrs: 5, status: 'needs_help', skillIds: [gis?.id] },
        { title: 'Translate safety briefing', description: 'A short video script in FR, EN, AR, FA and TI.', order: 3, estimatedHrs: 3, status: 'open', skillIds: [copywriting?.id] },
        { title: 'Coordinate with EVAM', description: 'Get on the activities calendar of the cantonal asylum support office.', order: 4, estimatedHrs: 2, status: 'open', skillIds: [communityOrganising?.id] },
      ],
    },
    {
      title: 'EPFL community garden network',
      description:
        'Example: Linking the EPFL agroecology plots with neighbourhood gardens in Ecublens and Chavannes to share seedlings, tools, and harvest data.',
      location: 'Lausanne, Switzerland',
      remoteOk: false,
      timeCommitmentHrs: 6,
      projectTypeId: foodAg?.id ?? null,
      steps: [
        { title: 'Audit existing community plots', description: 'Visit each garden, note size, soil type, current crops.', order: 1, estimatedHrs: 8, status: 'needs_help', skillIds: [envScience?.id, biology?.id] },
        { title: 'Build a seed library exchange', description: 'A shared online catalogue + monthly physical swap meet.', order: 2, estimatedHrs: 10, status: 'needs_help', skillIds: [webDev?.id, projectMgmt?.id] },
        { title: 'Draft a shared harvest data form', description: 'Track yields and pest pressure across plots — open dataset.', order: 3, estimatedHrs: 4, status: 'open', skillIds: [dataAnalysis?.id, copywriting?.id] },
      ],
    },
    {
      title: 'Climate literacy for Lausanne secondary schools',
      description:
        'Example: Co-designing climate lesson plans with teachers from Gymnase de la Cité and École de la Sallaz. Building on the Plan d’études romand.',
      location: 'Lausanne, Switzerland',
      remoteOk: true,
      timeCommitmentHrs: 12,
      projectTypeId: education?.id ?? null,
      steps: [
        { title: 'Co-design first lesson with teachers', description: 'A 2-hour workshop at Gymnase de la Cité.', order: 1, estimatedHrs: 6, status: 'needs_help', skillIds: [facilitation?.id, eventCoord?.id] },
        { title: 'Illustrate the worksheet pack', description: 'Approachable infographics — printable in BW for school printers.', order: 2, estimatedHrs: 8, status: 'needs_help', skillIds: [copywriting?.id] },
        { title: 'Pilot with two classes', description: 'Run the lesson, gather student feedback forms, iterate.', order: 3, estimatedHrs: 6, status: 'open', skillIds: [facilitation?.id, dataAnalysis?.id] },
      ],
    },
  ]

  // ── 3. Create Lausanne projects (skip if title already exists) ───────
  console.log('Seeding Lausanne projects...')
  let created = 0
  for (const proj of lausanneProjects) {
    const existsAlready = await db.project.findFirst({
      where: { title: proj.title },
      select: { id: true },
    })
    if (existsAlready) {
      console.log(`  Skipping (already exists): ${proj.title}`)
      continue
    }
    const p = await db.project.create({
      data: {
        title: proj.title,
        description: proj.description,
        status: 'in_progress',
        location: proj.location,
        remoteOk: proj.remoteOk,
        timeCommitmentHrs: proj.timeCommitmentHrs,
        projectTypeId: proj.projectTypeId,
      },
    })
    for (const step of proj.steps) {
      const ps = await db.projectStep.create({
        data: {
          projectId: p.id,
          title: step.title,
          description: step.description,
          order: step.order,
          estimatedHrs: step.estimatedHrs,
          status: step.status,
        },
      })
      for (const skillId of step.skillIds) {
        if (skillId) {
          await db.stepSkill.create({
            data: { skillId, projectStepId: ps.id },
          })
        }
      }
    }
    created++
    console.log(`  Created: ${proj.title}`)
  }
  console.log(`Done. Created ${created} new Lausanne projects.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
