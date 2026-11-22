import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getEditablePlace, isCuratorRole, placeEditMode } from '@/lib/places'
import { PlaceForm } from '@/components/map/place-form'

/* ================================================================
   /map/[slug]/suggest — change an existing place.

   Curators and admins, and the lead of the Superhero project the
   place belongs to, edit it directly. Every other member suggests an
   edit for a curator to review. The same choice is made again, on the
   server, when the form is saved.
   ================================================================ */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('mapSuggest.title') }
}

export default async function EditPlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const viewer = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!viewer) redirect('/sign-in')

  // Curators can reach a hidden place to correct it; for everyone else a
  // hidden place — or one whose project is no longer public — is a 404.
  const place = await getEditablePlace(db, { slug }, { includeHidden: isCuratorRole(viewer.role) })
  if (!place) notFound()

  const mode = await placeEditMode(viewer, place.projectId)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[820px] p-4 sm:p-6 lg:p-10">
        <PlaceForm
          mode={mode}
          place={{ id: place.id, slug: place.slug, name: place.data.name }}
          initial={place.data}
          startView={{ centre: { lat: place.data.latitude, lng: place.data.longitude }, zoom: 16 }}
          backHref={`/map/${place.slug}`}
        />
      </div>
    </div>
  )
}
