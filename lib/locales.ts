/* ================================================================
   Locale lookup tables shared between server actions, the browse
   filters and the blueprint family chips. ISO 639-1 + 3166-1
   alpha-2 codes — see ISO references for the canonical list.

   Codes are stored as strings in the DB; this module is the single
   source of truth for the human label and what counts as valid.
   ================================================================ */

export interface LanguageOption {
  code: string // ISO 639-1, lower-case
  label: string
  display: string // short uppercase display chip ("EN", "DE")
}

export interface CountryOption {
  code: string // ISO 3166-1 alpha-2, upper-case
  label: string
  flag?: string // optional emoji, purely cosmetic
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', display: 'EN' },
  { code: 'de', label: 'Deutsch', display: 'DE' },
  { code: 'fr', label: 'Français', display: 'FR' },
  { code: 'it', label: 'Italiano', display: 'IT' },
  { code: 'es', label: 'Español', display: 'ES' },
  { code: 'nl', label: 'Nederlands', display: 'NL' },
  { code: 'pt', label: 'Português', display: 'PT' },
  { code: 'sv', label: 'Svenska', display: 'SV' },
  { code: 'da', label: 'Dansk', display: 'DA' },
  { code: 'no', label: 'Norsk', display: 'NO' },
  { code: 'fi', label: 'Suomi', display: 'FI' },
  { code: 'pl', label: 'Polski', display: 'PL' },
  { code: 'cs', label: 'Čeština', display: 'CS' },
]

export const COUNTRIES: CountryOption[] = [
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IE', label: 'Ireland', flag: '🇮🇪' },
  { code: 'FR', label: 'France', flag: '🇫🇷' },
  { code: 'DE', label: 'Germany', flag: '🇩🇪' },
  { code: 'NL', label: 'Netherlands', flag: '🇳🇱' },
  { code: 'BE', label: 'Belgium', flag: '🇧🇪' },
  { code: 'CH', label: 'Switzerland', flag: '🇨🇭' },
  { code: 'AT', label: 'Austria', flag: '🇦🇹' },
  { code: 'ES', label: 'Spain', flag: '🇪🇸' },
  { code: 'PT', label: 'Portugal', flag: '🇵🇹' },
  { code: 'IT', label: 'Italy', flag: '🇮🇹' },
  { code: 'SE', label: 'Sweden', flag: '🇸🇪' },
  { code: 'NO', label: 'Norway', flag: '🇳🇴' },
  { code: 'DK', label: 'Denmark', flag: '🇩🇰' },
  { code: 'FI', label: 'Finland', flag: '🇫🇮' },
  { code: 'PL', label: 'Poland', flag: '🇵🇱' },
  { code: 'CZ', label: 'Czechia', flag: '🇨🇿' },
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
]

const LANGUAGE_CODES = new Set(LANGUAGES.map((l) => l.code))
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code))

/**
 * Normalise + validate a language code. Returns the canonical lower-case
 * code, or null for empty input. Throws if the code isn't recognised.
 */
export function normaliseLanguage(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (!LANGUAGE_CODES.has(v)) {
    throw new Error('Unrecognised language code.')
  }
  return v
}

/**
 * Normalise + validate a country code. Returns the canonical upper-case
 * code, or null for empty input. Throws if the code isn't recognised.
 */
export function normaliseCountry(raw: string): string | null {
  const v = raw.trim().toUpperCase()
  if (!v) return null
  if (!COUNTRY_CODES.has(v)) {
    throw new Error('Unrecognised country code.')
  }
  return v
}

export function languageLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return LANGUAGES.find((l) => l.code === code)?.label ?? null
}

export function languageDisplay(code: string | null | undefined): string | null {
  if (!code) return null
  return LANGUAGES.find((l) => l.code === code)?.display ?? null
}

export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return COUNTRIES.find((c) => c.code === code)?.label ?? null
}

export function countryFlag(code: string | null | undefined): string | null {
  if (!code) return null
  return COUNTRIES.find((c) => c.code === code)?.flag ?? null
}
