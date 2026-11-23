import 'server-only'
import { log } from '@/lib/log'
import type { Locale } from '@/lib/locale-shared'

/* ================================================================
   Pixabay stock-photo search — powers "Search photos" on the project
   cover card.

   Pixabay's API rules shape this file:
     - search results must be cached for 24 hours;
     - their image URLs may only be shown temporarily (the search
       grid) — a photo that is actually used must be copied to our own
       storage, never hotlinked;
     - wherever search results are shown we say they come from Pixabay
       (the picker does this).

   The API key stays on the server. The browser only ever sends a
   search text or a numeric photo id — never a URL — so nothing here
   can be pointed at another host.
   ================================================================ */

const API_URL = 'https://pixabay.com/api/'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_MAX_ENTRIES = 500
const RESULTS_PER_SEARCH = 24
/** Pixabay rejects search texts longer than this. */
export const PIXABAY_MAX_QUERY_LENGTH = 100
/** Same cap as an uploaded cover (lib/storage.ts). */
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000

/** Search languages Pixabay supports. Ukrainian is not one — fall back to English. */
const PIXABAY_LANG: Record<Locale, string> = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
  pt: 'pt',
  ru: 'ru',
  uk: 'en',
}

export interface StockPhoto {
  id: number
  /** Small Pixabay-hosted image for the search grid only (expires after 24 h). */
  thumbUrl: string
  /** The photographer's Pixabay user name. */
  author: string
  /** The photo's page on Pixabay. */
  pageUrl: string
}

interface PixabayHit {
  id: number
  pageURL: string
  webformatURL: string
  largeImageURL: string
  user: string
}

/** True when the feature can work in this environment. */
export function isPixabayConfigured(): boolean {
  return Boolean(process.env.PIXABAY_API_KEY)
}

function isPixabayHit(value: unknown): value is PixabayHit {
  if (typeof value !== 'object' || value === null) return false
  const hit = value as Record<string, unknown>
  return (
    typeof hit.id === 'number' &&
    typeof hit.pageURL === 'string' &&
    typeof hit.webformatURL === 'string' &&
    typeof hit.largeImageURL === 'string' &&
    typeof hit.user === 'string'
  )
}

/** Only ever follow image links that point at Pixabay itself. */
function isPixabayUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'pixabay.com' || url.hostname.endsWith('.pixabay.com'))
    )
  } catch {
    return false
  }
}

async function callApi(params: Record<string, string>): Promise<PixabayHit[]> {
  const key = process.env.PIXABAY_API_KEY
  if (!key) throw new Error('PIXABAY_API_KEY is not set')

  const url = new URL(API_URL)
  url.searchParams.set('key', key)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)

  // Our own cache below handles the 24-hour rule; keep Next's out of it.
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Pixabay responded ${response.status}`)

  const body: unknown = await response.json()
  const hits =
    typeof body === 'object' && body !== null ? (body as { hits?: unknown }).hits : undefined
  if (!Array.isArray(hits)) throw new Error('Unexpected Pixabay response')
  return hits.filter(isPixabayHit)
}

/* ---------------- Search (cached 24 h, per instance) ---------------- */

const searchCache = new Map<string, { expiresAt: number; photos: StockPhoto[] }>()

/**
 * Search landscape photos that are safe for all ages. `query` must already be
 * trimmed and non-empty. Throws on any API problem — the action maps that to
 * friendly copy.
 */
export async function searchStockPhotos(query: string, locale: Locale): Promise<StockPhoto[]> {
  const q = query.slice(0, PIXABAY_MAX_QUERY_LENGTH)
  const lang = PIXABAY_LANG[locale]
  const cacheKey = `${lang}:${q.toLowerCase()}`
  const now = Date.now()

  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.photos

  const hits = await callApi({
    q,
    lang,
    image_type: 'photo',
    orientation: 'horizontal',
    safesearch: 'true',
    // Covers are shown up to ~1200 px wide; skip photos too small to look sharp.
    min_width: '1200',
    per_page: String(RESULTS_PER_SEARCH),
  })

  const photos = hits
    .filter((hit) => isPixabayUrl(hit.webformatURL) && isPixabayUrl(hit.pageURL))
    .map((hit) => ({
      id: hit.id,
      thumbUrl: hit.webformatURL,
      author: hit.user,
      pageUrl: hit.pageURL,
    }))

  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    for (const [key, entry] of searchCache) {
      if (entry.expiresAt <= now) searchCache.delete(key)
    }
    // Still full of live entries: drop the oldest (Maps keep insertion order).
    const oldest = searchCache.keys().next()
    if (searchCache.size >= CACHE_MAX_ENTRIES && !oldest.done) searchCache.delete(oldest.value)
  }
  searchCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, photos })
  return photos
}

/* ---------------- Download one chosen photo ---------------- */

/**
 * Fetch a photo by its Pixabay id as a File, ready for uploadImage(). The id
 * is looked up through the API again so the download URL always comes from
 * Pixabay, never from the browser.
 */
export async function downloadStockPhoto(id: number): Promise<File> {
  const [hit] = await callApi({ id: String(id) })
  if (!hit || !isPixabayUrl(hit.largeImageURL)) {
    throw new Error(`Pixabay photo ${id} not found`)
  }

  const response = await fetch(hit.largeImageURL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Pixabay image responded ${response.status}`)

  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_DOWNLOAD_BYTES) throw new Error('Pixabay image is too large')

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Pixabay image is too large')

  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  log.info('pixabay.photo_downloaded', { id, bytes: bytes.byteLength, type })
  // uploadImage() validates the type and derives the extension from it.
  return new File([bytes], `pixabay-${id}`, { type })
}
