import { describe, it, expect } from 'vitest'
import { fmtAgo } from '@/lib/format'

const NOW = 1_700_000_000_000
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('fmtAgo', () => {
  it('handles the just-now window', () => {
    expect(fmtAgo(NOW, NOW)).toBe('just now')
    expect(fmtAgo(NOW - 59_000, NOW)).toBe('just now')
  })
  it('minutes and hours', () => {
    expect(fmtAgo(NOW - 5 * MIN, NOW)).toBe('5 min ago')
    expect(fmtAgo(NOW - 3 * HOUR, NOW)).toBe('3 h ago')
  })
  it('days and yesterday', () => {
    expect(fmtAgo(NOW - 1 * DAY, NOW)).toBe('yesterday')
    expect(fmtAgo(NOW - 5 * DAY, NOW)).toBe('5 days ago')
  })
  it('months', () => {
    expect(fmtAgo(NOW - 31 * DAY, NOW)).toBe('1 month ago')
    expect(fmtAgo(NOW - 92 * DAY, NOW)).toBe('3 months ago')
  })
})
