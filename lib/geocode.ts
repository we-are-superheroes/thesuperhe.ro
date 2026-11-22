import 'server-only'
import { log } from '@/lib/log'
import { isValidLatLng, roundCoordinate } from '@/lib/places-shared'

/* ================================================================
   Geocoding — turning "Froideville" or "1055" into a point on the map.

   Uses Photon, the public OpenStreetMap geocoder run by Komoot, and
   falls back to Nominatim (run by the OpenStreetMap project) when
   Photon cannot be reached. Neither needs a key. The base URLs come
   from GEOCODER_URL and GEOCODER_FALLBACK_URL so self-hosted copies
   can be used without touching code.

   Only the typed search text and the reader's language are sent — no
   user id, no IP forwarding, no cookies.
   ================================================================ */

const DEFAULT_GEOCODER_URL = 'https://photon.komoot.io/api/'
const DEFAULT_FALLBACK_URL = 'https://nominatim.openstreetmap.org/search'
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

/** Nominatim (the OpenStreetMap project's own geocoder) — the fallback. */
export function parseNominatimResponse(json: unknown): GeocodeHit[] {
  if (!Array.isArray(json)) return []
  const hits: GeocodeHit[] = []
  const seen = new Set<string>()
  for (const item of json as Array<Record<string, unknown>>) {
    const lat = Number(item?.lat)
    const lng = Number(item?.lon)
    if (!isValidLatLng(lat, lng)) continue
    const a = (typeof item.address === 'object' && item.address !== null ? item.address : {}) as Record<
      string,
      unknown
    >
    const street = [str(a.road), str(a.house_number)].filter(Boolean).join(' ') || null
    const city = str(a.city) ?? str(a.town) ?? str(a.village) ?? str(a.hamlet) ?? null
    const name = str(item.name) ?? street ?? city ?? str(a.postcode)
    if (!name) continue
    const context = [city !== name ? city : null, str(a.state), str(a.country)]
      .filter((part): part is string => !!part && part !== name)
      .join(', ')
    const key = `${name}|${context}`
    if (seen.has(key)) continue
    seen.add(key)
    const countryCode = str(a.country_code)?.toUpperCase() ?? null
    hits.push({
      name,
      context,
      lat: roundCoordinate(lat),
      lng: roundCoordinate(lng),
      country: countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
      city,
      postcode: str(a.postcode),
      street,
    })
  }
  return hits
}

const USER_AGENT = process.env.GEOCODER_USER_AGENT || 'thesuperhero-map/1.0 (+https://thesuperhe.ro)'

async function fetchJson(url: URL): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

interface GeocodeOptions {
  locale?: string
  limit?: number
  near?: { lat: number; lng: number }
}

async function viaPhoton(q: string, opts: GeocodeOptions): Promise<GeocodeHit[]> {
  const url = new URL(process.env.GEOCODER_URL || DEFAULT_GEOCODER_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(opts.limit ?? 5))
  if (opts.locale && PHOTON_LANGUAGES.has(opts.locale)) url.searchParams.set('lang', opts.locale)
  if (opts.near) {
    // Prefer matches close to where the map already is.
    url.searchParams.set('lat', String(opts.near.lat))
    url.searchParams.set('lon', String(opts.near.lng))
  }
  return parsePhotonResponse(await fetchJson(url))
}

async function viaNominatim(q: string, opts: GeocodeOptions): Promise<GeocodeHit[]> {
  const url = new URL(process.env.GEOCODER_FALLBACK_URL || DEFAULT_FALLBACK_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', String(opts.limit ?? 5))
  if (opts.locale) url.searchParams.set('accept-language', opts.locale)
  return parseNominatimResponse(await fetchJson(url))
}

/* A small per-instance cache: the same few towns are looked up again and
   again, and both geocoders ask callers not to repeat identical requests. */
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 500
const cache = new Map<string, { at: number; hits: GeocodeHit[] }>()

/**
 * Look up a town, postcode or address. Returns up to `limit` matches, best
 * first — an empty list when nothing matches — or `null` when no geocoder
 * could be reached, so the caller can say "try again" instead of "not found".
 *
 * Photon is tried first; if it fails (it sometimes refuses connections from
 * shared hosting addresses) Nominatim is asked instead.
 */
export async function geocode(query: string, opts: GeocodeOptions = {}): Promise<GeocodeHit[] | null> {
  const q = query.trim().slice(0, 200)
  if (q.length < 2) return []

  // Coarse position in the key: the bias only matters at the scale of a region.
  const near = opts.near ? `${opts.near.lat.toFixed(0)},${opts.near.lng.toFixed(0)}` : ''
  const key = `${q.toLowerCase()}|${opts.locale ?? ''}|${opts.limit ?? 5}|${near}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hits

  for (const [name, provider] of [
    ['photon', viaPhoton],
    ['nominatim', viaNominatim],
  ] as const) {
    try {
      const hits = await provider(q, opts)
      if (cache.size >= CACHE_MAX) cache.clear()
      cache.set(key, { at: Date.now(), hits })
      return hits
    } catch (e) {
      log.warn('geocode.failed', { provider: name, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return null
}
