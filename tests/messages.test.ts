import { describe, it, expect } from 'vitest'
import { participantsKeyFor } from '@/lib/messages'

describe('participantsKeyFor', () => {
  it('is order-independent (sorted join)', () => {
    expect(participantsKeyFor('user_b', 'user_a')).toBe(participantsKeyFor('user_a', 'user_b'))
  })
  it('separates ids with a colon', () => {
    expect(participantsKeyFor('a', 'b')).toBe('a:b')
  })
  it('distinguishes different pairs', () => {
    expect(participantsKeyFor('a', 'b')).not.toBe(participantsKeyFor('a', 'c'))
  })
})
