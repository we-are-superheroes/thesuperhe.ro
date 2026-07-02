// Base reference data (33 skills + 14 project types). Idempotent (upserts).
// Run by the "Seed database" GitHub workflow, or locally: npx tsx prisma/seed.ts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

const skills = [
  // Technical
  { name: 'Web development', category: 'Technical' },
  { name: 'Mobile development', category: 'Technical' },
  { name: 'Data analysis', category: 'Technical' },
  { name: 'GIS / mapping', category: 'Technical' },
  { name: 'DevOps / infrastructure', category: 'Technical' },
  { name: 'Machine learning', category: 'Technical' },
  // Legal
  { name: 'Legal research', category: 'Legal' },
  { name: 'Contract drafting', category: 'Legal' },
  { name: 'Policy analysis', category: 'Legal' },
  { name: 'Regulatory compliance', category: 'Legal' },
  // Creative
  { name: 'Graphic design', category: 'Creative' },
  { name: 'Video production', category: 'Creative' },
  { name: 'Photography', category: 'Creative' },
  { name: 'Copywriting', category: 'Creative' },
  { name: 'UX / product design', category: 'Creative' },
  // Community
  { name: 'Community organising', category: 'Community' },
  { name: 'Event coordination', category: 'Community' },
  { name: 'Facilitation', category: 'Community' },
  { name: 'Volunteer management', category: 'Community' },
  { name: 'Translation / interpretation', category: 'Community' },
  // Finance & Operations
  { name: 'Grant writing', category: 'Finance & Operations' },
  { name: 'Financial modelling', category: 'Finance & Operations' },
  { name: 'Accounting', category: 'Finance & Operations' },
  { name: 'Project management', category: 'Finance & Operations' },
  { name: 'Supply chain / procurement', category: 'Finance & Operations' },
  // Communications
  { name: 'Social media', category: 'Communications' },
  { name: 'Public relations', category: 'Communications' },
  { name: 'Journalism / writing', category: 'Communications' },
  { name: 'Public speaking', category: 'Communications' },
  // Science & Research
  { name: 'Environmental science', category: 'Science & Research' },
  { name: 'Climate science', category: 'Science & Research' },
  { name: 'Biology / ecology', category: 'Science & Research' },
  { name: 'Engineering', category: 'Science & Research' },
  { name: 'Architecture', category: 'Science & Research' },
]

const projectTypes = [
  { name: 'Community Energy', description: 'Local renewable energy projects and cooperatives', icon: '⚡' },
  { name: 'Urban Rewilding', description: 'Restoring nature in cities and urban spaces', icon: '🌿' },
  { name: 'Policy Advocacy', description: 'Influencing climate policy at local and national level', icon: '📜' },
  { name: 'Education & Awareness', description: 'Teaching and communicating about climate change', icon: '📚' },
  { name: 'Repair & Reuse', description: 'Reducing waste through repair cafés and circular economy', icon: '🔧' },
  { name: 'Food & Agriculture', description: 'Sustainable food systems and regenerative agriculture', icon: '🌱' },
  { name: 'Transport & Mobility', description: 'Low-carbon transport and active travel initiatives', icon: '🚲' },
  { name: 'Waste Reduction', description: 'Cutting waste at source and improving recycling', icon: '♻️' },
  { name: 'Water & Conservation', description: 'Water stewardship and habitat conservation', icon: '💧' },
  { name: 'Climate Finance', description: 'Green finance, impact investing, and divestment', icon: '💚' },
  { name: 'Research & Data', description: 'Climate research, monitoring, and open data', icon: '🔬' },
  { name: 'Built Environment', description: 'Green buildings, retrofit, and sustainable design', icon: '🏗️' },
  { name: 'Ocean & Marine', description: 'Ocean conservation and marine ecosystem protection', icon: '🌊' },
  { name: 'Biodiversity', description: 'Protecting and restoring species and ecosystems', icon: '🦋' },
]

async function main() {
  console.log('Seeding skills...')
  for (const skill of skills) {
    await db.skill.upsert({
      where: { name: skill.name },
      update: { category: skill.category },
      create: { name: skill.name, category: skill.category },
    })
  }

  console.log('Seeding project types...')
  for (const pt of projectTypes) {
    await db.projectType.upsert({
      where: { name: pt.name },
      update: { description: pt.description, icon: pt.icon },
      create: { name: pt.name, description: pt.description, icon: pt.icon },
    })
  }

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
