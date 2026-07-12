import { describe, expect, it } from 'vitest'
import { pickFromAcceptLanguage, isSupportedLocale } from '@/lib/locale'

describe('pickFromAcceptLanguage', () => {
  it('returns null for missing or empty headers', () => {
    expect(pickFromAcceptLanguage(null)).toBeNull()
    expect(pickFromAcceptLanguage('')).toBeNull()
  })

  it('matches a plain supported tag', () => {
    expect(pickFromAcceptLanguage('fr')).toBe('fr')
  })

  it('reduces regional tags to their primary subtag', () => {
    expect(pickFromAcceptLanguage('pt-BR,en;q=0.5')).toBe('pt')
    expect(pickFromAcceptLanguage('de-AT')).toBe('de')
  })

  it('respects q-value ordering', () => {
    expect(pickFromAcceptLanguage('da, fr;q=0.7, de;q=0.9')).toBe('de')
  })

  it('skips unsupported languages and q=0 entries', () => {
    expect(pickFromAcceptLanguage('ja,zh;q=0.9')).toBeNull()
    expect(pickFromAcceptLanguage('fr;q=0,it;q=0.5')).toBe('it')
  })

  it('survives malformed q parameters', () => {
    expect(pickFromAcceptLanguage('fr;q=abc,de;q=0.5')).toBe('de')
  })
})

describe('isSupportedLocale', () => {
  it('accepts the eight platform locales only', () => {
    for (const l of ['en', 'fr', 'de', 'es', 'it', 'ru', 'uk', 'pt']) {
      expect(isSupportedLocale(l)).toBe(true)
    }
    expect(isSupportedLocale('pt-BR')).toBe(false)
    expect(isSupportedLocale('EN')).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
  })
})
