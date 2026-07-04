import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { SITE_URL } from '@/lib/site'

// Request-time generation — reads the DB, so it must never run at build.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, blueprints] = await Promise.all([
    db.project.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    }),
    db.blueprint.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    }),
  ])

  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/projects`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/blueprints`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    ...projects.map((p) => ({
      url: `${SITE_URL}/projects/${p.id}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...blueprints.map((b) => ({
      url: `${SITE_URL}/blueprints/${b.id}`,
      lastModified: b.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}
