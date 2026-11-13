/**
 * Canonical public origin — used by robots, the sitemap, OG metadata, and the
 * links inside outbound emails (waitlist confirm/unsubscribe, notification
 * digests). It MUST point at the environment that will actually serve the
 * link: a preview/staging build whose emails link to production sends guests
 * to a different deployment — one that may predate the route and gate it
 * behind auth — which is exactly the "confirm link asks me to log in" trap.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_SITE_URL — an explicit override always wins (set it to the
 *     canonical domain in production, or to any origin for local testing).
 *  2. On a non-production Vercel deployment, the deployment's own host
 *     (the stable branch alias when available), so staging links to staging.
 *  3. The production domain as the final fallback.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
    if (host) return `https://${host}`
  }

  return 'https://thesuperhe.ro'
}

export const SITE_URL = resolveSiteUrl()
