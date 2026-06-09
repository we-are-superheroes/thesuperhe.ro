import { countryLabel } from '@/lib/locales'

/* ================================================================
   Helpers for the project location fields:
   - location ("City, Country" display string, derived from the city
     input + the selected ISO country)
   - address (free-form text, optional)

   The public maps link uses Google's Maps URL API with a text query —
   no API key needed, and Google resolves the address itself.
   ================================================================ */

/**
 * Build the "City, Country" display string from the city input and the
 * selected ISO country code. Used by both the create and update actions.
 */
export function buildLocation(city: string, countryCode: string | null): string | null {
  const c = city.trim()
  const label = countryLabel(countryCode)
  if (c && label) return `${c}, ${label}`
  if (c) return c
  return label
}

/**
 * Build the public Google Maps URL for a project. The query combines the
 * address with the coarse location so Google can disambiguate street names
 * that exist in many cities. Returns `null` when there's nothing to search.
 */
export function googleMapsUrl(opts: {
  address: string | null
  location: string | null
}): string | null {
  const address = opts.address?.trim() ?? ''
  const location = opts.location?.trim() ?? ''
  // Skip the location suffix when the address already mentions it (common:
  // full addresses end in "…, City, Country") to avoid a stuttering query.
  const parts =
    address && location && !address.toLowerCase().includes(location.toLowerCase())
      ? [address, location]
      : [address || location]
  const query = parts.filter(Boolean).join(', ')
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
