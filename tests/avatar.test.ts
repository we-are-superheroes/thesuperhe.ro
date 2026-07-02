import { describe, it, expect } from 'vitest'
import { AVATAR_GRADIENTS, gradientFor, initialOf, initialsOf } from '@/lib/avatar'

describe('gradientFor', () => {
  it('is deterministic and stays within the palette', () => {
    const g = gradientFor('user_abc123')
    expect(gradientFor('user_abc123')).toBe(g)
    expect(AVATAR_GRADIENTS).toContain(g)
  })
  it('spreads across the palette', () => {
    const distinct = new Set(
      Array.from({ length: 40 }, (_, i) => gradientFor(`user-${i}`)),
    )
    expect(distinct.size).toBeGreaterThan(1)
  })
})

describe('initials helpers', () => {
  it('initialsOf takes up to two words', () => {
    expect(initialsOf('Maya Fernandes')).toBe('MF')
    expect(initialsOf('Priya')).toBe('P')
    expect(initialsOf('Jean  Pierre   Dupont')).toBe('JP')
  })
  it('handles empty input', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf(null)).toBe('?')
    expect(initialOf(undefined)).toBe('?')
    expect(initialOf('   ')).toBe('?')
  })
  it('initialOf takes the first letter, upper-cased', () => {
    expect(initialOf('maya')).toBe('M')
  })
})
