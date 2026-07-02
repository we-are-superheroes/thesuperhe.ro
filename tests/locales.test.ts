import { describe, it, expect } from 'vitest'
import {
  COUNTRIES,
  LANGUAGES,
  countryFlag,
  countryLabel,
  languageDisplay,
  languageLabel,
  normaliseCountry,
  normaliseLanguage,
} from '@/lib/locales'

describe('COUNTRIES', () => {
  it('is a full ISO-sized list with unique upper-case codes', () => {
    expect(COUNTRIES.length).toBeGreaterThan(240)
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('is sorted by English label', () => {
    for (let i = 1; i < COUNTRIES.length; i++) {
      expect(
        COUNTRIES[i - 1].label.localeCompare(COUNTRIES[i].label, 'en'),
      ).toBeLessThanOrEqual(0)
    }
  })
})

describe('normaliseCountry', () => {
  it('canonicalises case', () => {
    expect(normaliseCountry('jp')).toBe('JP')
    expect(normaliseCountry(' ch ')).toBe('CH')
  })
  it('returns null for empty input', () => {
    expect(normaliseCountry('')).toBeNull()
    expect(normaliseCountry('   ')).toBeNull()
  })
  it('rejects unknown codes', () => {
    expect(() => normaliseCountry('ZZ')).toThrow()
    expect(() => normaliseCountry('XX')).toThrow()
  })
})

describe('normaliseLanguage', () => {
  it('canonicalises case and validates', () => {
    expect(normaliseLanguage('EN')).toBe('en')
    expect(normaliseLanguage('')).toBeNull()
    expect(() => normaliseLanguage('xx')).toThrow()
  })
})

describe('labels + flags', () => {
  it('looks up labels case-insensitively', () => {
    expect(countryLabel('GB')).toBe('United Kingdom')
    expect(countryLabel('gb')).toBe('United Kingdom')
    expect(countryLabel(null)).toBeNull()
    expect(countryLabel('ZZ')).toBeNull()
  })

  it('computes flags from regional indicator code points', () => {
    expect(countryFlag('CH')).toBe('🇨🇭')
    expect(countryFlag('jp')).toBe('🇯🇵')
    expect(countryFlag('ZZ')).toBeNull()
    expect(countryFlag(null)).toBeNull()
  })

  it('language helpers resolve known codes', () => {
    expect(languageLabel('fr')).toBe('Français')
    expect(languageDisplay('en')).toBe('EN')
    expect(LANGUAGES.every((l) => /^[a-z]{2}$/.test(l.code))).toBe(true)
  })
})
