import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { FALLBACK_MAP_VIEW, roughLocation } from '@/lib/geo-headers'
import { getEditablePlace, isCuratorRole, isLeadOfPublicProject } from '@/lib/places'
import {
  PLACE_LIMITS,
  emptyPlaceForm,
  isValidLatLng,
  pickPlaceFields,
  type PlaceFormValues,
} from '@/lib/places-shared'
import { PlaceForm, type PlaceFormMode } from '@/components/map/place-form'
import type { MapView } from '@/components/map/map-canvas'

/* ================================================================
   /map/suggest — add a new place.

     (no params)          a member suggests; a curator adds directly
     ?n=<anything>        the same, with a fresh form (see PlaceForm)
     ?project=<id>        the lead of a public Superhero project (or a
                          curator) puts that project on the map
     ?proposal=<id>       a curator corrects a member's suggestion
                          before approving it

   Signed-in only (proxy.ts + the platform layout). Who may do what is
   decided again in submitPlaceAction — this page only chooses what to
   show.
   ================================================================ */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('mapSuggest.title') }
}

type SearchParams = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** The form's shape from a stored payload — tolerant, the form re-validates on save. */
function valuesFromPayload(base: PlaceFormValues, payload: unknown): PlaceFormValues {
  const fields = pickPlaceFields(payload)
  const merged = { ...base, ...fields } as PlaceFormValues
  if (!isValidLatLng(merged.latitude, merged.longitude)) {
    merged.latitude = null
    merged.longitude = null
  }
  if (!Array.isArray(merged.products)) merged.products = []
  return merged
}

export default async function SuggestPlacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const viewer = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  const isCurator = isCuratorRole(viewer?.role)

  const rough = await roughLocation()
  let startView: MapView = rough ? { centre: rough.centre, zoom: 12 } : FALLBACK_MAP_VIEW
  let mode: PlaceFormMode = isCurator ? 'direct' : 'propose'
  let initial = emptyPlaceForm()
  let project: { id: string; title: string } | undefined
  let place: { id: string; slug: string; name: string } | undefined
  let proposalId: string | undefined
  let backHref = '/map'

  const proposalParam = first(params.proposal)
  const projectParam = first(params.project)

  if (proposalParam) {
    // Reviewing is for curators; everyone else gets a 404, not a hint.
    if (!isCurator) notFound()
    const proposal = await db.placeProposal.findUnique({
      where: { id: proposalParam },
      select: { id: true, kind: true, status: true, placeId: true, payload: true },
    })
    if (!proposal || proposal.status !== 'pending' || proposal.kind === 'remove') notFound()

    if (proposal.kind === 'edit') {
      if (!proposal.placeId) notFound()
      const current = await getEditablePlace(db, { id: proposal.placeId }, { includeHidden: true })
      if (!current) notFound()
      initial = valuesFromPayload(current.data, proposal.payload)
      place = { id: current.id, slug: current.slug, name: current.data.name }
    } else {
      initial = valuesFromPayload(emptyPlaceForm(), proposal.payload)
    }
    mode = 'review'
    proposalId = proposal.id
    backHref = '/admin/places'
  } else if (projectParam) {
    const found = await db.project.findUnique({
      where: { id: projectParam },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        address: true,
        country: true,
        language: true,
        visibility: true,
        place: { select: { slug: true } },
      },
    })
    // Only public projects go on the public map, and only their lead (or a
    // curator) may put them there. Anything else looks like a missing page.
    if (!found || found.visibility !== 'public') notFound()
    if (!isCurator && !(await isLeadOfPublicProject(userId, found.id))) notFound()
    if (found.place) redirect(`/map/${found.place.slug}/suggest`)

    // "City, Country" → the city part.
    const city = found.location?.split(',')[0]?.trim() || null
    initial = emptyPlaceForm({
      name: found.title.slice(0, PLACE_LIMITS.name),
      summary: found.description.split(/\n+/)[0].slice(0, PLACE_LIMITS.summary),
      city,
      country: found.country,
      address: found.address,
      language: found.language,
    })
    project = { id: found.id, title: found.title }
    mode = 'direct'
    backHref = `/projects/${found.id}/edit`
  }

  if (initial.latitude !== null && initial.longitude !== null) {
    startView = { centre: { lat: initial.latitude, lng: initial.longitude }, zoom: 16 }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[820px] p-4 sm:p-6 lg:p-10">
        <PlaceForm
          // A new `n` (set by "Suggest another place") gives a fresh, empty form.
          key={first(params.n) ?? 'form'}
          mode={mode}
          place={place}
          project={project}
          proposalId={proposalId}
          initial={initial}
          startView={startView}
          backHref={backHref}
        />
      </div>
    </div>
  )
}
