import 'server-only'
import { log } from '@/lib/log'
import { isValidLatLng, roundCoordinate } from '@/lib/places-shared'

/* ================================================================
   Geocoding — turning "Froideville" or "1055" into a point on the map.

   Uses Photon, the public OpenStreetMap geocoder run by Komoot. It
   needs no key. The base URL comes from GEOCODER_URL so the provider
   can be swapped (a self-hosted Photon, or another service that speaks
   the same GeoJSON response) without touching code.

   Only the typed search text and the reader's language are sent — no
   user id, no IP forwarding, no cookies.
   ================================================================ */

const DEFAULT_GEOCODER_URL = 'https://photon.komoot.io/api/'
/** Languages Photon can label results in; anything else falls back to the local name. */
const PHOTON_LANGUAGES = new Set(['en', 'de', 'fr'])

export interface GeocodeHit {
  /** Short name for the search field: "Froideville". */
  name: string
  /** Disambiguating context: "Vaud, Switzerland". */
  context: string
  lat: number
  lng: number
  /** ISO 3166-1 alpha-2, upper case, when known. */
  country: string | null
  city: string | null
  postcode: string | null
  street: string | null
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown }
  properties?: Record<string, unknown>
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function parsePhotonResponse(json: unknown): GeocodeHit[] {
  if (typeof json !== 'object' || json === null) return []
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features)) return []

  const hits: GeocodeHit[] = []
  const seen = new Set<string>()
  for (const feature of features as PhotonFeature[]) {
    const coords = feature?.geometry?.coordinates
    if (!Array.isArray(coords)) continue
    const [lng, lat] = coords as unknown[]
    if (!isValidLatLng(lat, lng)) continue
    const p = feature.properties ?? {}

    const street = [str(p.street), str(p.housenumber)].filter(Boolean).join(' ') || null
    const city = str(p.city) ?? str(p.town) ?? str(p.village) ?? null
    const name = str(p.name) ?? street ?? city ?? str(p.postcode)
    if (!name) continue
    const context = [city !== name ? city : null, str(p.state), str(p.country)]
      .filter((part): part is string => !!part && part !== name)
      .join(', ')

    const key = `${name}|${context}`
    if (seen.has(key)) continue
    seen.add(key)

    const countryCode = str(p.countrycode)?.toUpperCase() ?? null
    hits.push({
      name,
      context,
      lat: roundCoordinate(lat as number),
      lng: roundCoordinate(lng as number),
      country: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
      // A hit that *is* a town has no separate city property.
      city: city ?? (p.osm_key === 'place' ? name : null),
      postcode: str(p.postcode),
      street,
    })
  }
  return hits
}

/**
 * Look up a town, postcode or address. Returns up to `limit` matches, best
 * first; an empty list when nothing matches or the geocoder is unreachable
 * (the caller shows "no match" either way — the map still works by dragging).
 */
export async function geocode(
  query: string,
  opts: { locale?: string; limit?: number; near?: { lat: number; lng: number } } = {},
): Promise<GeocodeHit[]> {
  const q = query.trim().slice(0, 200)
  if (q.length < 2) return []

  const url = new URL(process.env.GEOCODER_URL || DEFAULT_GEOCODER_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(opts.limit ?? 5))
  if (opts.locale && PHOTON_LANGUAGES.has(opts.locale)) url.searchParams.set('lang', opts.locale)
  if (opts.near) {
    // Prefer matches close to where the map already is.
    url.searchParams.set('lat', String(opts.near.lat))
    url.searchParams.set('lon', String(opts.near.lng))
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'thesuperhero-map' },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    if (!res.ok) {
      log.warn('geocode.bad_status', { status: res.status })
      return []
    }
    return parsePhotonResponse(await res.json())
  } catch (e) {
    log.warn('geocode.failed', { message: e instanceof Error ? e.message : String(e) })
    return []
  }
}
