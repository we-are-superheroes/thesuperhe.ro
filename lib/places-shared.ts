import type { ErrorDescriptor } from '@/lib/validation'
import { normaliseCountry, normaliseLanguage } from '@/lib/locales'
import { parseOpeningHours, type OpeningHours } from '@/lib/opening-hours'

/* ================================================================
   Map places — pure helpers shared by the server (actions, queries)
   and the browser (map page, forms). No I/O, so everything here is
   unit-tested directly. Server-only queries live in lib/places.ts.
   ================================================================ */

/**
 * Categories a place can have (one per place). Labels and the plural
 * filter labels live in the `map` catalog under `categories.<key>`;
 * adding a category is a change here plus its translations, with no
 * database migration.
 */
export const PLACE_CATEGORIES = [
  'farm',
  'organic',
  'coop',
  'nature',
  'repair',
  'garden',
  'learn',
] as const

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === 'string' && (PLACE_CATEGORIES as readonly string[]).includes(value)
}

export const OPERATING_STATUSES = ['active', 'temporarily_closed', 'permanently_closed'] as const
export type OperatingStatus = (typeof OPERATING_STATUSES)[number]

/** Search distances offered on the map, in km. The server always loads the largest. */
export const RADIUS_OPTIONS_KM = [5, 10, 25] as const
export const MAX_RADIUS_KM = 25
export const DEFAULT_RADIUS_KM = 10

/* ================================================================
   Geometry
   ================================================================ */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371.0088
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance between two points, in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface BoundingBox {
  minLat: number
  maxLat: number
  /** One or two longitude ranges — two when the box crosses the antimeridian. */
  lngRanges: Array<{ min: number; max: number }>
}

/**
 * The lat/lng box that contains every point within `radiusKm` of `centre`.
 * Used for the indexed first pass of "places near here"; the exact distance
 * is checked afterwards with haversineKm().
 */
export function boundingBox(centre: LatLng, radiusKm: number): BoundingBox {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI)
  const minLat = Math.max(-90, centre.lat - dLat)
  const maxLat = Math.min(90, centre.lat + dLat)
  // Near a pole a circle covers every longitude.
  const cosLat = Math.cos(toRad(centre.lat))
  if (minLat <= -90 || maxLat >= 90 || cosLat < 1e-6) {
    return { minLat, maxLat, lngRanges: [{ min: -180, max: 180 }] }
  }
  const dLng = dLat / cosLat
  if (dLng >= 180) return { minLat, maxLat, lngRanges: [{ min: -180, max: 180 }] }
  const min = centre.lng - dLng
  const max = centre.lng + dLng
  if (min < -180) {
    return { minLat, maxLat, lngRanges: [{ min: min + 360, max: 180 }, { min: -180, max }] }
  }
  if (max > 180) {
    return { minLat, maxLat, lngRanges: [{ min, max: 180 }, { min: -180, max: max - 360 }] }
  }
  return { minLat, maxLat, lngRanges: [{ min, max }] }
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/** Google Maps directions to a point — no API key, opens the visitor's own maps app. */
export function directionsUrl(position: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${position.lat},${position.lng}`
}

/** Round a coordinate to about 1 km, for positions that came from the visitor's device. */
export function coarsen(value: number): number {
  return Math.round(value * 100) / 100
}

/** Six decimals is about 10 cm — plenty for a pin, and keeps URLs and rows tidy. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/* ================================================================
   Slugs
   ================================================================ */

/** Path segments under /map that are pages, not places. */
export const RESERVED_PLACE_SLUGS = new Set(['suggest', 'new', 'edit'])

/** URL slug from the place name and town: "La Cabane à Légumes", "Froideville". */
export function slugifyPlace(name: string, city: string | null): string {
  const base = [name, city ?? '']
    .join(' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '')
  return base || 'place'
}

/* ================================================================
   Money — prices are whole minor units of the place's currency
   ================================================================ */

/** Currencies offered in the price-list editor (the place's default comes first). */
export const COMMON_CURRENCIES = [
  'EUR',
  'CHF',
  'GBP',
  'USD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'UAH',
  'BRL',
  'CAD',
  'AUD',
] as const

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  CH: 'CHF',
  LI: 'CHF',
  GB: 'GBP',
  US: 'USD',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  UA: 'UAH',
  BR: 'BRL',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  IS: 'ISK',
  JP: 'JPY',
  IN: 'INR',
  MX: 'MXN',
  ZA: 'ZAR',
  TR: 'TRY',
}

/** A sensible default currency for a country (the euro where we don't know better). */
export function currencyForCountry(country: string | null): string {
  return (country && CURRENCY_BY_COUNTRY[country]) || 'EUR'
}

const CURRENCY_CODE = /^[A-Z]{3}$/

/** How many decimal places the currency uses (2 for CHF, 0 for JPY). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** "3.50" or "3,50" → 350 (for CHF). Null when the text is not a price. */
export function parsePriceToMinor(text: string, currency: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(cleaned)) return null
  const decimals = currencyDecimals(currency)
  const minor = Math.round(Number(cleaned) * 10 ** decimals)
  return Number.isSafeInteger(minor) ? minor : null
}

/** 350 → "3.50" (for CHF): the plain number shown in the price input. */
export function minorToInput(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency)
  return (minor / 10 ** decimals).toFixed(decimals)
}

/** 350 → "CHF 3.50" in the reader's locale. */
export function formatPrice(minor: number, currency: string, locale: string): string {
  const decimals = currencyDecimals(currency)
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
      minor / 10 ** decimals,
    )
  } catch {
    return `${(minor / 10 ** decimals).toFixed(decimals)} ${currency}`
  }
}

/* ================================================================
   Place data — the validated shape stored in proposals and applied
   to the places table
   ================================================================ */

export interface PlaceProductData {
  name: string
  note: string | null
  priceMinor: number | null
  unit: string | null
  available: boolean
}

export interface PlaceData {
  name: string
  summary: string
  description: string | null
  language: string | null
  category: PlaceCategory
  latitude: number
  longitude: number
  locationApproximate: boolean
  address: string | null
  city: string | null
  country: string | null
  website: string | null
  contact: string | null
  practicalNote: string | null
  openingHours: OpeningHours | null
  openingNote: string | null
  operatingStatus: OperatingStatus
  statusNote: string | null
  /** YYYY-MM-DD, only meaningful while temporarily closed. */
  reopensOn: string | null
  currency: string
  products: PlaceProductData[]
}

export const PLACE_LIMITS = {
  name: 120,
  summary: 200,
  description: 4000,
  address: 300,
  city: 120,
  website: 300,
  contact: 200,
  note: 500,
  products: 60,
  productName: 80,
  productNote: 160,
  productUnit: 24,
  proposalNote: 1000,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed text, or null when empty or not a string. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function tooLong(field: string, max: number): ErrorDescriptor {
  return { key: 'places.fieldTooLong', params: { field, max } }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function normaliseWebsite(raw: string | null): string | null | undefined {
  if (!raw) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    if (!url.hostname.includes('.')) return undefined
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

/**
 * Validate and normalise untrusted place data — from the add/suggest form,
 * and again from a stored proposal at the moment it is applied.
 */
export function validatePlaceInput(
  raw: unknown,
): { ok: true; data: PlaceData } | { ok: false; error: ErrorDescriptor } {
  const fail = (error: ErrorDescriptor) => ({ ok: false as const, error })
  if (!isRecord(raw)) return fail({ key: 'places.invalid' })

  const name = text(raw.name)
  if (!name) return fail({ key: 'places.nameRequired' })
  if (name.length > PLACE_LIMITS.name) return fail(tooLong('name', PLACE_LIMITS.name))

  const summary = text(raw.summary)
  if (!summary) return fail({ key: 'places.summaryRequired' })
  if (summary.length > PLACE_LIMITS.summary) return fail(tooLong('summary', PLACE_LIMITS.summary))

  const description = text(raw.description)
  if (description && description.length > PLACE_LIMITS.description) {
    return fail(tooLong('description', PLACE_LIMITS.description))
  }

  if (!isPlaceCategory(raw.category)) return fail({ key: 'places.categoryRequired' })

  if (!isValidLatLng(raw.latitude, raw.longitude)) return fail({ key: 'places.positionRequired' })
  const latitude = roundCoordinate(raw.latitude as number)
  const longitude = roundCoordinate(raw.longitude as number)
  // 0,0 is open ocean: a pin there means the position was never set.
  if (latitude === 0 && longitude === 0) return fail({ key: 'places.positionRequired' })

  const address = text(raw.address)
  if (address && address.length > PLACE_LIMITS.address) return fail(tooLong('address', PLACE_LIMITS.address))
  const city = text(raw.city)
  if (city && city.length > PLACE_LIMITS.city) return fail(tooLong('city', PLACE_LIMITS.city))

  // The lib/locales normalisers throw on codes they don't know.
  let country: string | null = null
  const countryRaw = text(raw.country)
  if (countryRaw) {
    try {
      country = normaliseCountry(countryRaw)
    } catch {
      return fail({ key: 'places.countryInvalid' })
    }
  }

  // The language is only a hint for readers: an unknown code is dropped.
  let language: string | null = null
  const languageRaw = text(raw.language)
  if (languageRaw) {
    try {
      language = normaliseLanguage(languageRaw)
    } catch {
      language = null
    }
  }

  const website = normaliseWebsite(text(raw.website))
  if (website === undefined) return fail({ key: 'places.websiteInvalid' })
  if (website && website.length > PLACE_LIMITS.website) return fail(tooLong('website', PLACE_LIMITS.website))

  const contact = text(raw.contact)
  if (contact && contact.length > PLACE_LIMITS.contact) return fail(tooLong('contact', PLACE_LIMITS.contact))

  const practicalNote = text(raw.practicalNote)
  if (practicalNote && practicalNote.length > PLACE_LIMITS.note) return fail(tooLong('practicalNote', PLACE_LIMITS.note))
  const openingNote = text(raw.openingNote)
  if (openingNote && openingNote.length > PLACE_LIMITS.note) return fail(tooLong('openingNote', PLACE_LIMITS.note))
  const statusNote = text(raw.statusNote)
  if (statusNote && statusNote.length > PLACE_LIMITS.note) return fail(tooLong('statusNote', PLACE_LIMITS.note))

  const hours = parseOpeningHours(raw.openingHours)
  if (!hours.ok) return fail(hours.error)
  // "See the note" needs a note to see.
  if (hours.value?.mode === 'text' && !openingNote) return fail({ key: 'places.openingNoteRequired' })

  const operatingStatus = raw.operatingStatus ?? 'active'
  if (!(OPERATING_STATUSES as readonly unknown[]).includes(operatingStatus)) {
    return fail({ key: 'places.statusInvalid' })
  }

  let reopensOn: string | null = null
  if (operatingStatus === 'temporarily_closed') {
    const rawDate = text(raw.reopensOn)
    if (rawDate) {
      if (!ISO_DATE.test(rawDate) || Number.isNaN(Date.parse(`${rawDate}T00:00:00Z`))) {
        return fail({ key: 'places.reopensOnInvalid' })
      }
      reopensOn = rawDate
    }
  }

  const currencyRaw = text(raw.currency)?.toUpperCase() ?? null
  if (currencyRaw && !CURRENCY_CODE.test(currencyRaw)) return fail({ key: 'places.currencyInvalid' })
  const currency = currencyRaw ?? currencyForCountry(country)

  const productsRaw = raw.products ?? []
  if (!Array.isArray(productsRaw)) return fail({ key: 'places.invalid' })
  if (productsRaw.length > PLACE_LIMITS.products) {
    return fail({ key: 'places.tooManyProducts', params: { max: PLACE_LIMITS.products } })
  }
  const products: PlaceProductData[] = []
  for (const item of productsRaw) {
    if (!isRecord(item)) return fail({ key: 'places.invalid' })
    const productName = text(item.name)
    if (!productName) return fail({ key: 'places.productNameRequired' })
    if (productName.length > PLACE_LIMITS.productName) return fail(tooLong('productName', PLACE_LIMITS.productName))
    const note = text(item.note)
    if (note && note.length > PLACE_LIMITS.productNote) return fail(tooLong('productNote', PLACE_LIMITS.productNote))
    const unit = text(item.unit)
    if (unit && unit.length > PLACE_LIMITS.productUnit) return fail(tooLong('productUnit', PLACE_LIMITS.productUnit))
    let priceMinor: number | null = null
    if (item.priceMinor !== null && item.priceMinor !== undefined) {
      if (
        typeof item.priceMinor !== 'number' ||
        !Number.isInteger(item.priceMinor) ||
        item.priceMinor < 0 ||
        item.priceMinor > 2_000_000_000
      ) {
        return fail({ key: 'places.productPriceInvalid', params: { name: productName } })
      }
      priceMinor = item.priceMinor
    }
    products.push({ name: productName, note, priceMinor, unit, available: item.available !== false })
  }

  return {
    ok: true,
    data: {
      name,
      summary,
      description,
      language,
      category: raw.category,
      latitude,
      longitude,
      locationApproximate: raw.locationApproximate === true,
      address,
      city,
      country,
      website,
      contact,
      practicalNote,
      openingHours: hours.value,
      openingNote,
      operatingStatus: operatingStatus as OperatingStatus,
      statusNote: operatingStatus === 'active' ? null : statusNote,
      reopensOn,
      currency,
      products,
    },
  }
}

/** Validate the free-text note a member adds to a proposal. */
export function validateProposalNote(
  raw: unknown,
): { ok: true; note: string | null } | { ok: false; error: ErrorDescriptor } {
  const note = text(raw)
  if (note && note.length > PLACE_LIMITS.proposalNote) {
    return { ok: false, error: tooLong('proposalNote', PLACE_LIMITS.proposalNote) }
  }
  return { ok: true, note }
}

/* ================================================================
   Diffs — an `edit` proposal stores only the fields that changed
   ================================================================ */

export type PlaceField = keyof PlaceData

export const PLACE_FIELDS: PlaceField[] = [
  'name',
  'summary',
  'description',
  'language',
  'category',
  'latitude',
  'longitude',
  'locationApproximate',
  'address',
  'city',
  'country',
  'website',
  'contact',
  'practicalNote',
  'openingHours',
  'openingNote',
  'operatingStatus',
  'statusNote',
  'reopensOn',
  'currency',
  'products',
]

/** The fields of `next` that differ from `current` (deep comparison). */
export function diffPlaceData(current: PlaceData, next: PlaceData): Partial<PlaceData> {
  const changed: Partial<PlaceData> = {}
  for (const field of PLACE_FIELDS) {
    if (JSON.stringify(current[field]) !== JSON.stringify(next[field])) {
      Object.assign(changed, { [field]: next[field] })
    }
  }
  return changed
}

/** Keep only known place fields of a stored `edit` payload. */
export function pickPlaceFields(payload: unknown): Partial<PlaceData> {
  if (!isRecord(payload)) return {}
  const out: Partial<PlaceData> = {}
  for (const field of PLACE_FIELDS) {
    if (field in payload) Object.assign(out, { [field]: payload[field] })
  }
  return out
}

/* ================================================================
   Search text + duplicates
   ================================================================ */

/** Lower-case, accent-free text for forgiving matching ("legumes" finds "Légumes"). */
export function foldText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Could this be the same place? Very close by, or close and similarly named. */
export function looksLikeDuplicate(
  a: { name: string; lat: number; lng: number },
  b: { name: string; lat: number; lng: number },
): boolean {
  const km = haversineKm(a, b)
  if (km <= 0.05) return true
  if (km > 0.5) return false
  const nameA = foldText(a.name).replace(/[^a-z0-9]/g, '')
  const nameB = foldText(b.name).replace(/[^a-z0-9]/g, '')
  if (!nameA || !nameB) return false
  return nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA) || km <= 0.15
}

/* ================================================================
   Form values — place data before it is complete (no pin, no
   category yet)
   ================================================================ */

export type PlaceFormValues = Omit<PlaceData, 'latitude' | 'longitude' | 'category'> & {
  latitude: number | null
  longitude: number | null
  category: PlaceCategory | ''
}

/** A blank form, optionally pre-filled (a project's name, a visitor's country). */
export function emptyPlaceForm(prefill: Partial<PlaceFormValues> = {}): PlaceFormValues {
  const country = prefill.country ?? null
  return {
    name: '',
    summary: '',
    description: null,
    language: null,
    category: '',
    latitude: null,
    longitude: null,
    locationApproximate: false,
    address: null,
    city: null,
    country,
    website: null,
    contact: null,
    practicalNote: null,
    openingHours: null,
    openingNote: null,
    operatingStatus: 'active',
    statusNote: null,
    reopensOn: null,
    currency: currencyForCountry(country),
    products: [],
    ...prefill,
  }
}
