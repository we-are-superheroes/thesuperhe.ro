/* ================================================================
   Rough location of a waitlist signup, read from the request headers.

   Used only to send launch e-mails to the countries a project is
   relevant for. We keep a country code and the browser's language
   tags — never the IP address. Pure functions, so they are unit-tested
   without a request.
   ================================================================ */

/** Header the hosting platform (Vercel) sets to the visitor's ISO country. */
export const COUNTRY_HEADER = 'x-vercel-ip-country'

const COUNTRY_CODE = /^[A-Z]{2}$/
/** A BCP 47 language tag, loosely: "en", "en-GB", "zh-Hant-TW". */
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
/** How many of the browser's languages we keep (they come in preference order). */
const MAX_LANGUAGE_TAGS = 3

/** An ISO 3166-1 alpha-2 code in upper case, or null when absent or malformed. */
export function parseCountryCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? ''
  return COUNTRY_CODE.test(code) ? code : null
}

/**
 * The first few language tags of an Accept-Language header, in the browser's
 * order and without the quality values: "en-GB,en;q=0.9,fr;q=0.8" → "en-GB,en,fr".
 * Null when the header is absent or holds nothing usable.
 */
export function parseAcceptLanguage(value: string | null | undefined): string | null {
  if (!value) return null
  const tags: string[] = []
  for (const part of value.split(',')) {
    const tag = part.split(';')[0].trim()
    if (!LANGUAGE_TAG.test(tag) || tags.includes(tag)) continue
    tags.push(tag)
    if (tags.length === MAX_LANGUAGE_TAGS) break
  }
  return tags.length > 0 ? tags.join(',') : null
}
