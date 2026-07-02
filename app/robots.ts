import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in surfaces — nothing useful to index there.
      disallow: [
        '/dashboard',
        '/messages',
        '/notifications',
        '/profile',
        '/my-projects',
        '/my-steps',
        '/skill-matches',
        '/api/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
