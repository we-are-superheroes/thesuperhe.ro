/* ================================================================
   Helpers for the optional precise-location fields on Project:
   - address (free-form text)
   - latitude / longitude (decimal degrees)

   The form accepts coords as a single "lat, lng" string for paste-
   from-Google-Maps convenience; this module parses + validates and
   builds the public maps URL.
   ================================================================ */

export interface ParsedCoords {
  latitude: number
  longitude: number
}

/**
 * Parse a "lat, lng" string into a coords pair. Accepts:
 *   "51.5424, -0.0244"
 *   "51.5424,-0.0244"
 *   "51.5424 -0.0244"
 *   "51.5424°N, 0.0244°W"  (we strip the direction markers + flip sign)
 *
 * Returns `null` for empty/whitespace input, throws if it looks like
 * coords but doesn't parse to a valid pair so the caller can surface
 * a useful error.
 */
export function parseCoords(raw: string): ParsedCoords | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Strip cardinal-direction suffixes (N/S/E/W) and remember the sign change.
  const normalised = trimmed
    .replace(/[°]/g, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = normalised.split(' ')
  if (parts.length < 2) {
    throw new Error('Coordinates need a latitude and longitude.')
  }

  const readNumber = (token: string, axis: 'lat' | 'lng'): number => {
    const m = token.match(/^(-?\d+(?:\.\d+)?)([NSEWnsew]?)$/)
    if (!m) throw new Error('Coordinates couldn’t be parsed.')
    let value = Number(m[1])
    const dir = m[2]?.toUpperCase()
    if (dir === 'S' || dir === 'W') value = -value
    if (axis === 'lat' && (value < -90 || value > 90)) {
      throw new Error('Latitude must be between -90 and 90.')
    }
    if (axis === 'lng' && (value < -180 || value > 180)) {
      throw new Error('Longitude must be between -180 and 180.')
    }
    return value
  }

  const latitude = readNumber(parts[0], 'lat')
  const longitude = readNumber(parts[1], 'lng')
  return { latitude, longitude }
}

/** Render coords back to the canonical "lat, lng" string for prefill. */
export function formatCoords(lat: number, lng: number, decimals = 6): string {
  return `${lat.toFixed(decimals).replace(/\.?0+$/, '')}, ${lng
    .toFixed(decimals)
    .replace(/\.?0+$/, '')}`
}

/**
 * Build the public Google Maps URL for a project's precise location.
 * Prefers coords (most accurate); falls back to the address text; returns
 * `null` if neither is set.
 */
export function googleMapsUrl(opts: {
  address: string | null
  latitude: number | null
  longitude: number | null
}): string | null {
  if (opts.latitude != null && opts.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${opts.latitude},${opts.longitude}`
  }
  const addr = opts.address?.trim()
  if (addr) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
  }
  return null
}
