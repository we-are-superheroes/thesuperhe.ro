import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Routes anyone (signed-in or not) can hit.
 * /projects and /projects/<id> are browsable anonymously; the page handles
 * what details to show. /projects/new and /projects/<id>/edit are still
 * gated and matched by `isProtectedProjectSubroute` below so they stay
 * behind auth even though their parents are public.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/home',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
  // Pre-launch waitlist: guest signup + double-opt-in link targets.
  '/waitlist(.*)',
  '/api/waitlist(.*)',
  // Token-guarded unsubscribe for notification emails, and the
  // secret-guarded cron that sends them. Both must be hittable unauthenticated.
  '/api/notifications/unsubscribe',
  '/email-unsubscribe',
  '/email-unsubscribed',
  '/api/cron(.*)',
  '/privacy',
  '/terms',
  '/robots.txt',
  '/sitemap.xml',
  '/projects',
  '/projects/(.*)',
  '/blueprints',
  '/blueprints/(.*)',
  '/orgs/(.*)',
])

const isProtectedOrgSubroute = createRouteMatcher(['/orgs/request'])

const isProtectedBlueprintSubroute = createRouteMatcher([
  '/blueprints/(.*)/edit',
])

const isProtectedProjectSubroute = createRouteMatcher([
  '/projects/new',
  '/projects/(.*)/edit',
])

export default clerkMiddleware(async (auth, req) => {
  if (
    isProtectedProjectSubroute(req) ||
    isProtectedBlueprintSubroute(req) ||
    isProtectedOrgSubroute(req)
  ) {
    await auth.protect()
    return
  }
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
