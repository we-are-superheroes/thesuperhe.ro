'use server'

import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { tError } from '@/lib/errors'
import { geocode, type GeocodeHit } from '@/lib/geocode'
import {
  findPlacesNear,
  getPlaceDetailView,
  type PlaceDetailView,
  type PlaceResult,
} from '@/lib/places'
import { MAX_RADIUS_KM, coarsen, isValidLatLng } from '@/lib/places-shared'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Public map actions — usable signed out, so both are rate-limited
   per client IP. Neither stores anything.
   ================================================================ */

async function clientIp(): Promise<string> {
  const hdrs = await headers()
  return (hdrs.get('x-forwarded-for')?.split(',')[0] ?? hdrs.get('x-real-ip') ?? 'unknown').trim()
}

/** Look up a town, postcode or address for the "where" field and the pin picker. */
export async function geocodeAction(
  query: string,
  near?: { lat: number; lng: number },
): Promise<ServerActionResult<GeocodeHit[]>> {
  const limited = rateLimit(`geocode:${await clientIp()}`, 30, 60_000)
  if (!limited.ok) return { success: false, error: await tError(rateLimitError(limited)) }
  if (typeof query !== 'string') return { success: true, data: [] }

  const locale = await getLocale()
  const hits = await geocode(query, {
    locale,
    near: near && isValidLatLng(near.lat, near.lng) ? near : undefined,
  })
  // null = no geocoder answered. Say so, rather than "we could not find it".
  if (hits === null) return { success: false, error: await tError({ key: 'places.searchUnavailable' }) }
  return { success: true, data: hits }
}

/**
 * Places around the visitor's own position ("Use my location"). The browser
 * rounds the position to about 1 km before sending; it is rounded again here,
 * used for this one query and not stored or logged. A server action (POST
 * body) rather than a URL, so the position never lands in a link or history.
 */
export async function loadPlacesNearAction(position: {
  lat: number
  lng: number
}): Promise<ServerActionResult<{ centre: { lat: number; lng: number }; places: PlaceResult[] }>> {
  const limited = rateLimit(`places-near:${await clientIp()}`, 30, 60_000)
  if (!limited.ok) return { success: false, error: await tError(rateLimitError(limited)) }
  if (!position || !isValidLatLng(position.lat, position.lng)) {
    return { success: false, error: await tError({ key: 'places.positionRequired' }) }
  }

  const centre = { lat: coarsen(position.lat), lng: coarsen(position.lng) }
  try {
    const places = await findPlacesNear(centre, MAX_RADIUS_KM, await getLocale())
    return { success: true, data: { centre, places } }
  } catch {
    return { success: false, error: await tError({ key: 'common.somethingWrong' }) }
  }
}

/**
 * Everything about one place, for the details panel on the map. Reads
 * through publicPlacesWhere() (inside getPlaceDetailView), so a hidden place
 * or one whose project is no longer public is "not found" here too.
 */
export async function loadPlaceDetailAction(
  slug: string,
): Promise<ServerActionResult<PlaceDetailView>> {
  const limited = rateLimit(`place-detail:${await clientIp()}`, 120, 60_000)
  if (!limited.ok) return { success: false, error: await tError(rateLimitError(limited)) }
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > 120) {
    return { success: false, error: await tError({ key: 'places.notFound' }) }
  }
  try {
    const detail = await getPlaceDetailView(slug, await getLocale())
    if (!detail) return { success: false, error: await tError({ key: 'places.notFound' }) }
    return { success: true, data: detail }
  } catch {
    return { success: false, error: await tError({ key: 'common.somethingWrong' }) }
  }
}
