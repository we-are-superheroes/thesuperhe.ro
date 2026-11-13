import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { isCurrentUserAdmin } from '@/lib/auth'
import {
  BroadcastComposer,
  type BroadcastCountry,
} from '@/components/platform/broadcast-composer'

/* ================================================================
   /admin/broadcast — the launch-broadcast composer.

   Admin-only. The page 404s for non-admins (no dead UI, no hint that
   it exists). Authorization is enforced again inside the server
   actions the composer calls — this gate only decides what renders.
   ================================================================ */

// The send action works through the list in batches inside a time budget;
// give it the room it plans for.
export const maxDuration = 60

export default async function BroadcastPage() {
  if (!(await isCurrentUserAdmin())) notFound()

  // Confirmed subscribers per signup country (null = country not known).
  const [groups, locale] = await Promise.all([
    db.waitlistSubscriber.groupBy({
      by: ['country'],
      where: { status: 'confirmed' },
      _count: { _all: true },
    }),
    getLocale(),
  ])

  // Country names are resolved here so server and browser render the same text.
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' })
  const nameFor = (code: string): string => {
    try {
      return regionNames.of(code) ?? code
    } catch {
      return code
    }
  }

  let unknownCount = 0
  const countries: BroadcastCountry[] = []
  for (const group of groups) {
    if (group.country === null) unknownCount += group._count._all
    else countries.push({ code: group.country, name: nameFor(group.country), count: group._count._all })
  }
  countries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, locale))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <BroadcastComposer countries={countries} unknownCount={unknownCount} />
    </div>
  )
}
