import { describe, it, expect } from 'vitest'
import { parseAcceptLanguage, parseCountryCode } from '@/lib/waitlist-geo'

describe('parseCountryCode', () => {
  it('accepts a two-letter code and upper-cases it', () => {
    expect(parseCountryCode('CH')).toBe('CH')
    expect(parseCountryCode(' gb ')).toBe('GB')
  })

  it('returns null for a missing or malformed value', () => {
    expect(parseCountryCode(null)).toBeNull()
    expect(parseCountryCode(undefined)).toBeNull()
    expect(parseCountryCode('')).toBeNull()
    expect(parseCountryCode('CHE')).toBeNull()
    expect(parseCountryCode('T1')).toBeNull()
    expect(parseCountryCode("C'; DROP")).toBeNull()
  })
})

describe('parseAcceptLanguage', () => {
  it('keeps the tags in order and drops the quality values', () => {
    expect(parseAcceptLanguage('en-GB,en;q=0.9,fr;q=0.8')).toBe('en-GB,en,fr')
    expect(parseAcceptLanguage('fr-CH, fr;q=0.9')).toBe('fr-CH,fr')
  })

  it('keeps at most three tags and skips repeats', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,en;q=0.8,de;q=0.7,it;q=0.6')).toBe('en-US,en,de')
  })

  it('ignores the wildcard and anything that is not a language tag', () => {
    expect(parseAcceptLanguage('*')).toBeNull()
    expect(parseAcceptLanguage('<script>,en-GB')).toBe('en-GB')
  })

  it('returns null for a missing header', () => {
    expect(parseAcceptLanguage(null)).toBeNull()
    expect(parseAcceptLanguage('')).toBeNull()
  })
})
