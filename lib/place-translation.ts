import { createHash } from 'node:crypto'
import { SUPPORTED_LOCALES, type Locale } from '@/lib/locale-shared'

/* ================================================================
   Automatic translation of map places — the pure part: which texts
   are translated, how a translation is tied to the text it was made
   from, and how it is laid over a place for display. No database,
   no network; the Claude call lives in lib/place-translator.ts.

   A place keeps its texts in the language they were written in. One
   row per place and language in `place_translations` holds a machine
   translation of them, stamped with a hash of the source texts. A
   translation is only shown while that hash still matches the place,
   so an edited place falls back to its original text until the new
   translation is ready.

   Not translated: the name (a proper name), the address, the contact
   line and the category (already a key in the message catalogs).
   ================================================================ */

/** Bump to make every stored translation stale after a prompt change. */
export const PLACE_TRANSLATION_VERSION = 1

/** Free-text columns of a place that are translated. */
export const PLACE_TEXT_FIELDS = [
  'summary',
  'description',
  'practicalNote',
  'openingNote',
  'statusNote',
] as const
export type PlaceTextField = (typeof PLACE_TEXT_FIELDS)[number]

export interface PlaceProductTexts {
  name: string
  group: string | null
  note: string | null
  unit: string | null
}

/** Every translatable text of one place, in its source language. */
export interface PlaceTexts {
  summary: string
  description: string | null
  practicalNote: string | null
  openingNote: string | null
  statusNote: string | null
  products: PlaceProductTexts[]
}

/**
 * What is stored per place and language. Price-list texts are kept as a
 * dictionary from source text to translation, not per product: the price
 * list is replaced as a whole on every edit, so product ids do not last.
 */
export interface StoredPlaceTranslation {
  fields: Partial<Record<PlaceTextField, string>>
  terms: Record<string, string>
}

const HAS_LETTER = /\p{L}/u

/** The distinct price-list texts to translate. A text without letters ("12") needs no translation. */
export function placeTerms(texts: PlaceTexts): string[] {
  const seen = new Set<string>()
  for (const product of texts.products) {
    for (const value of [product.group, product.name, product.note, product.unit]) {
      if (value && HAS_LETTER.test(value)) seen.add(value)
    }
  }
  return [...seen]
}

function sourceFields(texts: PlaceTexts): Partial<Record<PlaceTextField, string>> {
  const out: Partial<Record<PlaceTextField, string>> = {}
  for (const field of PLACE_TEXT_FIELDS) {
    const value = texts[field]
    if (value && value.trim() !== '') out[field] = value
  }
  return out
}

/**
 * Identity of the texts a translation was made from. Changes when any
 * translated text changes, and not when anything else about the place
 * does (opening hours, prices, position).
 */
export function placeSourceHash(texts: PlaceTexts): string {
  const canonical = JSON.stringify({
    v: PLACE_TRANSLATION_VERSION,
    fields: PLACE_TEXT_FIELDS.map((field) => sourceFields(texts)[field] ?? null),
    terms: placeTerms(texts).sort(),
  })
  return createHash('sha1').update(canonical, 'utf8').digest('hex')
}

/**
 * Languages a place is translated into: every platform language except
 * the one it is written in. When that is unknown (or not one of ours),
 * all of them — the translator detects the language and skips its own.
 */
export function placeTargetLocales(language: string | null): Locale[] {
  return SUPPORTED_LOCALES.filter((locale) => locale !== language)
}

/* ---------------- request to and reply from the model ---------------- */

const TERM_KEY = /^term_(\d+)$/

/**
 * The flat JSON object sent for translation: one key per text field, then
 * `term_1`… for the price-list texts. Empty when there is nothing to translate.
 */
export function buildTranslationRequest(texts: PlaceTexts): Record<string, string> {
  const request: Record<string, string> = { ...sourceFields(texts) }
  placeTerms(texts).forEach((term, index) => {
    request[`term_${index + 1}`] = term
  })
  return request
}

export type ParsedTranslation =
  | { ok: true; sourceLanguage: string | null; sameLanguage: boolean; stored: StoredPlaceTranslation }
  | { ok: false; errors: string[] }

/**
 * Check the model's reply against the request and turn it into the stored
 * shape. Expected: `{ "language": "<iso>", "texts": { …same keys… } }`.
 * `texts` may be empty only when the source is already in the target language.
 */
export function parseTranslationReply(
  request: Record<string, string>,
  reply: unknown,
  target: Locale,
): ParsedTranslation {
  if (reply === null || typeof reply !== 'object' || Array.isArray(reply)) {
    return { ok: false, errors: ['reply is not a JSON object'] }
  }
  const { language, texts } = reply as { language?: unknown; texts?: unknown }
  const sourceLanguage =
    typeof language === 'string' && /^[a-z]{2,3}$/i.test(language.trim())
      ? language.trim().toLowerCase()
      : null
  if (texts === null || typeof texts !== 'object' || Array.isArray(texts)) {
    return { ok: false, errors: ['"texts" must be a JSON object'] }
  }
  const translated = texts as Record<string, unknown>

  if (sourceLanguage === target && Object.keys(translated).length === 0) {
    return { ok: true, sourceLanguage, sameLanguage: true, stored: { fields: {}, terms: {} } }
  }

  const errors: string[] = []
  for (const key of Object.keys(request)) {
    const value = translated[key]
    if (value === undefined) errors.push(`missing key "${key}"`)
    else if (typeof value !== 'string' || value.trim() === '') errors.push(`"${key}" must be a non-empty string`)
  }
  for (const key of Object.keys(translated)) {
    if (!(key in request)) errors.push(`unexpected key "${key}"`)
  }
  if (errors.length > 0) return { ok: false, errors }

  const stored: StoredPlaceTranslation = { fields: {}, terms: {} }
  for (const [key, source] of Object.entries(request)) {
    const value = (translated[key] as string).trim()
    if (TERM_KEY.test(key)) stored.terms[source] = value
    else stored.fields[key as PlaceTextField] = value
  }
  return { ok: true, sourceLanguage, sameLanguage: sourceLanguage === target, stored }
}

/* ---------------- reading a stored translation ---------------- */

/** A stored `texts` JSON value, or null when it is not the expected shape. */
export function readStoredTranslation(raw: unknown): StoredPlaceTranslation | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { fields, terms } = raw as { fields?: unknown; terms?: unknown }
  const isStringMap = (value: unknown): value is Record<string, string> =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  if (!isStringMap(fields) || !isStringMap(terms)) return null
  const known: StoredPlaceTranslation = { fields: {}, terms }
  for (const field of PLACE_TEXT_FIELDS) {
    if (fields[field]) known.fields[field] = fields[field]
  }
  return known
}

export function hasTranslatedText(stored: StoredPlaceTranslation): boolean {
  return Object.keys(stored.fields).length > 0 || Object.keys(stored.terms).length > 0
}

/** The place's texts with the translation laid over them; untranslated texts stay as they are. */
export function translatePlaceTexts(texts: PlaceTexts, stored: StoredPlaceTranslation): PlaceTexts {
  const term = (value: string | null) => (value === null ? null : (stored.terms[value] ?? value))
  return {
    summary: stored.fields.summary ?? texts.summary,
    description: texts.description === null ? null : (stored.fields.description ?? texts.description),
    practicalNote: texts.practicalNote === null ? null : (stored.fields.practicalNote ?? texts.practicalNote),
    openingNote: texts.openingNote === null ? null : (stored.fields.openingNote ?? texts.openingNote),
    statusNote: texts.statusNote === null ? null : (stored.fields.statusNote ?? texts.statusNote),
    products: texts.products.map((product) => ({
      name: stored.terms[product.name] ?? product.name,
      group: term(product.group),
      note: term(product.note),
      unit: term(product.unit),
    })),
  }
}
