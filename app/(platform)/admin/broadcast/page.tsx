import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { isCurrentUserAdmin } from '@/lib/auth'
import { BroadcastComposer } from '@/components/platform/broadcast-composer'

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

  const recipientCount = await db.waitlistSubscriber.count({
    where: { status: 'confirmed' },
  })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <BroadcastComposer recipientCount={recipientCount} />
    </div>
  )
}
