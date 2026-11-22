import 'server-only'
import { headers } from 'next/headers'
import { coarsen, isValidLatLng, type LatLng } from '@/lib/places-shared'

/* ================================================================
   The host's rough, city-level guess of where a visitor is, read from
   the request headers Vercel adds. Used only to pick a sensible
   starting point for the map — for this render, never stored or
   logged, and rounded to about 1 km. Absent in local development.
   ================================================================ */

export async function roughLocation(): Promise<{ centre: LatLng; label: string | null } | null> {
  const hdrs = await headers()
  const lat = Number(hdrs.get('x-vercel-ip-latitude') ?? Number.NaN)
  const lng = Number(hdrs.get('x-vercel-ip-longitude') ?? Number.NaN)
  if (!isValidLatLng(lat, lng) || (lat === 0 && lng === 0)) return null
  let label: string | null = null
  try {
    // The city name arrives URL-encoded ("S%C3%A3o%20Paulo").
    label = decodeURIComponent(hdrs.get('x-vercel-ip-city') ?? '').trim() || null
  } catch {
    label = null
  }
  return { centre: { lat: coarsen(lat), lng: coarsen(lng) }, label }
}

/** Where a map looks when nothing else is known: Europe. */
export const FALLBACK_MAP_VIEW = { centre: { lat: 48.5, lng: 9 }, zoom: 3.4 }
