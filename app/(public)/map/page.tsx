import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { FALLBACK_MAP_VIEW, roughLocation } from '@/lib/geo-headers'
import { cookies } from 'next/headers'
import {
  findPlacesNear,
  getPlaceDetailView,
  isCuratorRole,
  type PlaceResult,
} from '@/lib/places'
import {
  DEFAULT_RADIUS_KM,
  MAP_PLACE_COOKIE,
  MAX_RADIUS_KM,
  decodeMapPlaceCookie,
  RADIUS_OPTIONS_KM,
  isPlaceCategory,
  isPlaceOperator,
  isValidLatLng,
  roundCoordinate,
  type LatLng,
  type PlaceCategory,
  type PlaceOperator,
} from '@/lib/places-shared'
import {
  MapExplorer,
  type SortOrder,
  type SourceFilter,
} from '@/components/map/map-explorer'

/* ================================================================
   /map — public map of sustainable places and Superhero projects.

   Readable signed out. The search centre comes from the URL (a town
   the visitor chose: ?c=lat,lng&l=name). Without one we start from
   the host's rough, city-level guess of where the visitor is — read
   from request headers for this render only, never stored — and
   otherwise ask for a town.

   Every place within the largest radius is loaded here through
   findPlacesNear(), which applies publicPlacesWhere(); the finer
   filters run in the browser (components/map/map-explorer.tsx).
   ================================================================ */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('map.title'), description: t('map.description') }
}

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseCentre(raw: string | undefined): LatLng | null {
  if (!raw) return null
  const [lat, lng] = raw.split(',').map(Number)
  if (!isValidLatLng(lat, lng)) return null
  return { lat: roundCoordinate(lat), lng: roundCoordinate(lng) }
}

/**
 * The time of this request. The page is rendered per request (it reads
 * auth and headers), and the browser reuses this value so "open now"
 * reads the same on both sides.
 */
function requestTimeMs(): number {
  return Date.now()
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { userId } = await auth()

  const urlCentre = parseCentre(first(params.c))
  const urlLabel = first(params.l)?.trim().slice(0, 80) || null
  // Without a centre in the URL: the last town this visitor searched for
  // (remembered in a cookie on their device), else the host's rough guess.
  const remembered = urlCentre
    ? null
    : decodeMapPlaceCookie((await cookies()).get(MAP_PLACE_COOKIE)?.value)
  const rough = urlCentre || remembered ? null : await roughLocation()
  const centre = urlCentre ?? remembered?.centre ?? rough?.centre ?? null
  const centreLabel = urlCentre ? urlLabel : (remembered?.label ?? rough?.label ?? null)

  // A shared link to one place (?d=slug): load its details with the page.
  const openParam = first(params.d)?.slice(0, 120) || null
  const locale = await getLocale()
  const initialDetail = openParam ? await getPlaceDetailView(openParam, locale) : null

  const [places, viewer] = await Promise.all([
    centre ? findPlacesNear(centre, MAX_RADIUS_KM, locale) : Promise.resolve<PlaceResult[]>([]),
    userId ? db.user.findUnique({ where: { id: userId }, select: { role: true } }) : null,
  ])

  const radiusParam = Number(first(params.r))
  const radius = (RADIUS_OPTIONS_KM as readonly number[]).includes(radiusParam)
    ? radiusParam
    : DEFAULT_RADIUS_KM
  const categories = (first(params.cat) ?? '')
    .split(',')
    .filter((value): value is PlaceCategory => isPlaceCategory(value))
  const operators = (first(params.op) ?? '')
    .split(',')
    .filter((value): value is PlaceOperator => isPlaceOperator(value))
  const srcParam = first(params.src)
  const source: SourceFilter = srcParam === 'hero' || srcParam === 'indie' ? srcParam : 'all'
  const sort: SortOrder = first(params.sort) === 'name' ? 'name' : 'near'
  const selected = first(params.p) ?? null

  return (
    <MapExplorer
      centre={centre}
      centreLabel={centreLabel}
      centreInUrl={!!urlCentre}
      places={places}
      initial={{
        radius,
        q: (first(params.q) ?? '').slice(0, 100),
        categories,
        operators,
        source,
        sort,
        selected: selected && places.some((p) => p.slug === selected) ? selected : null,
        open: initialDetail?.slug ?? null,
      }}
      initialDetail={initialDetail}
      fallback={FALLBACK_MAP_VIEW}
      canAddDirectly={isCuratorRole(viewer?.role)}
      signedIn={!!userId}
      nowMs={requestTimeMs()}
    />
  )
}
