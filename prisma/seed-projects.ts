import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

/**
 * Seed 3 sample projects with steps and step-skills.
 * Uses existing project types and skills from the reference seed.
 */
async function main() {
  // Look up project types
  const urbanRewilding = await db.projectType.findUnique({ where: { name: 'Urban Rewilding' } })
  const communityEnergy = await db.projectType.findUnique({ where: { name: 'Community Energy' } })
  const repairReuse = await db.projectType.findUnique({ where: { name: 'Repair & Reuse' } })

  // Look up skills we'll assign to steps
  const communityOrganising = await db.skill.findUnique({ where: { name: 'Community organising' } })
  const graphicDesign = await db.skill.findUnique({ where: { name: 'Graphic design' } })
  const projectMgmt = await db.skill.findUnique({ where: { name: 'Project management' } })
  const webDev = await db.skill.findUnique({ where: { name: 'Web development' } })
  const eventCoord = await db.skill.findUnique({ where: { name: 'Event coordination' } })
  const grantWriting = await db.skill.findUnique({ where: { name: 'Grant writing' } })
  const copywriting = await db.skill.findUnique({ where: { name: 'Copywriting' } })
  const socialMedia = await db.skill.findUnique({ where: { name: 'Social media' } })
  const envScience = await db.skill.findUnique({ where: { name: 'Environmental science' } })
  const financialModelling = await db.skill.findUnique({ where: { name: 'Financial modelling' } })

  console.log('Seeding Project 1: Pocket forest in Hackney Wick...')
  const p1 = await db.project.create({
    data: {
      title: 'Pocket forest in Hackney Wick',
      description:
        'Turn a council-owned lot into a Miyawaki-method micro forest with the local community. The Miyawaki method produces dense, biodiverse native forests that grow 10x faster than conventional planting.',
      status: 'active',
      location: 'Hackney, London',
      remoteOk: false,
      timeCommitmentHrs: 6,
      projectTypeId: urbanRewilding?.id ?? null,
    },
  })

  const p1Steps = [
    { title: 'Survey the site and soil', description: 'Visit the lot, measure dimensions, take soil samples, and photograph existing conditions.', order: 1, estimatedHrs: 3, status: 'needs_help' as const, skillIds: [envScience?.id] },
    { title: 'Draft planting plan', description: 'Research native species for the area and create a planting density layout using the Miyawaki method.', order: 2, estimatedHrs: 4, status: 'needs_help' as const, skillIds: [envScience?.id] },
    { title: 'Secure council permission', description: 'Write and submit the proposal to Hackney Council for land-use permission.', order: 3, estimatedHrs: 6, status: 'needs_help' as const, skillIds: [grantWriting?.id, copywriting?.id] },
    { title: 'Recruit local volunteers', description: 'Set up sign-up form and promote the planting day to local community groups.', order: 4, estimatedHrs: 3, status: 'not_started' as const, skillIds: [communityOrganising?.id, socialMedia?.id] },
    { title: 'Organise planting day', description: 'Coordinate logistics: tools, mulch delivery, volunteer scheduling, refreshments.', order: 5, estimatedHrs: 5, status: 'not_started' as const, skillIds: [eventCoord?.id, projectMgmt?.id] },
  ]

  for (const step of p1Steps) {
    const ps = await db.projectStep.create({
      data: {
        projectId: p1.id,
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

  console.log('Seeding Project 2: Bristol solar buying group...')
  const p2 = await db.project.create({
    data: {
      title: 'Bristol solar buying group',
      description:
        'Pool households together to negotiate a cheaper installer rate for residential solar panels. A collective approach means lower costs per household and shared knowledge through the process.',
      status: 'active',
      location: 'Bristol',
      remoteOk: true,
      timeCommitmentHrs: 12,
      projectTypeId: communityEnergy?.id ?? null,
    },
  })

  const p2Steps = [
    { title: 'Research solar installers', description: 'Compare local installers, get quotes for bulk installations, and verify MCS accreditation.', order: 1, estimatedHrs: 8, status: 'needs_help' as const, skillIds: [financialModelling?.id] },
    { title: 'Build sign-up landing page', description: 'Create a simple website where interested households can register their interest and roof details.', order: 2, estimatedHrs: 6, status: 'needs_help' as const, skillIds: [webDev?.id] },
    { title: 'Community outreach', description: 'Promote the scheme through local Facebook groups, NextDoor, and community notice boards.', order: 3, estimatedHrs: 4, status: 'needs_help' as const, skillIds: [socialMedia?.id, communityOrganising?.id] },
    { title: 'Negotiate group rate', description: 'Use the collective buying power to negotiate a bulk discount with the selected installer.', order: 4, estimatedHrs: 5, status: 'not_started' as const, skillIds: [financialModelling?.id] },
    { title: 'Coordinate installation schedule', description: 'Work with the installer and households to plan the installation calendar.', order: 5, estimatedHrs: 4, status: 'not_started' as const, skillIds: [projectMgmt?.id] },
  ]

  for (const step of p2Steps) {
    const ps = await db.projectStep.create({
      data: {
        projectId: p2.id,
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

  console.log('Seeding Project 3: Monthly repair café, Camden...')
  const p3 = await db.project.create({
    data: {
      title: 'Monthly repair café, Camden',
      description:
        'Set up a recurring fix-it event where locals bring broken items and volunteers repair them. Reduces waste, builds community skills, and keeps useful things out of landfill.',
      status: 'active',
      location: 'Camden, London',
      remoteOk: false,
      timeCommitmentHrs: 4,
      projectTypeId: repairReuse?.id ?? null,
    },
  })

  const p3Steps = [
    { title: 'Find a venue', description: 'Approach community centres, churches, or libraries for a free or low-cost monthly booking.', order: 1, estimatedHrs: 3, status: 'needs_help' as const, skillIds: [communityOrganising?.id] },
    { title: 'Design branding and posters', description: 'Create a logo, poster template, and social media assets for the repair café.', order: 2, estimatedHrs: 4, status: 'needs_help' as const, skillIds: [graphicDesign?.id] },
    { title: 'Recruit repair volunteers', description: 'Find people with electronics, textiles, and mechanical repair skills to volunteer.', order: 3, estimatedHrs: 3, status: 'needs_help' as const, skillIds: [communityOrganising?.id] },
    { title: 'Set up booking system', description: 'Create a simple online form where people can book a repair slot and describe their item.', order: 4, estimatedHrs: 2, status: 'not_started' as const, skillIds: [webDev?.id] },
    { title: 'Run first event', description: 'Coordinate the first repair café: set-up, volunteer briefing, visitor flow, teardown.', order: 5, estimatedHrs: 6, status: 'not_started' as const, skillIds: [eventCoord?.id, projectMgmt?.id] },
  ]

  for (const step of p3Steps) {
    const ps = await db.projectStep.create({
      data: {
        projectId: p3.id,
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

  console.log('Done. Seeded 3 projects with 15 steps total.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
