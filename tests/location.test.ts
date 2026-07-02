import { describe, it, expect } from 'vitest'
import { buildLocation, googleMapsUrl } from '@/lib/location'

describe('buildLocation', () => {
  it('joins city and country label', () => {
    expect(buildLocation('Lausanne', 'CH')).toBe('Lausanne, Switzerland')
  })
  it('falls back to whichever side is present', () => {
    expect(buildLocation('Lausanne', null)).toBe('Lausanne')
    expect(buildLocation('', 'JP')).toBe('Japan')
    expect(buildLocation('  ', null)).toBeNull()
  })
  it('ignores unknown country codes', () => {
    expect(buildLocation('Lausanne', 'ZZ')).toBe('Lausanne')
  })
})

describe('googleMapsUrl', () => {
  it('returns null with nothing to search', () => {
    expect(googleMapsUrl({ address: null, location: null })).toBeNull()
    expect(googleMapsUrl({ address: '  ', location: '' })).toBeNull()
  })

  it('combines address and location', () => {
    const url = googleMapsUrl({ address: '2 Wallis Road', location: 'Hackney, United Kingdom' })
    expect(url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        '2 Wallis Road, Hackney, United Kingdom',
      )}`,
    )
  })

  it('skips the location when the address already contains it', () => {
    const url = googleMapsUrl({
      address: 'Pl. Saint-François, 1003 Lausanne, Switzerland',
      location: 'Lausanne, Switzerland',
    })
    expect(url).toContain(encodeURIComponent('Pl. Saint-François, 1003 Lausanne, Switzerland'))
    expect(url).not.toContain(encodeURIComponent('Switzerland, Lausanne'))
  })

  it('uses the location alone when there is no address', () => {
    expect(googleMapsUrl({ address: null, location: 'Lausanne, Switzerland' })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Lausanne, Switzerland')}`,
    )
  })

  it('URL-encodes special characters', () => {
    const url = googleMapsUrl({ address: 'Rue de l’Ale 5 & 7', location: null })
    expect(url).not.toContain('&query=Rue de')
    expect(url).toContain('query=Rue%20de')
  })
})
