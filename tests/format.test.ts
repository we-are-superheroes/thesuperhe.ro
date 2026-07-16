import { describe, it, expect } from 'vitest'
import { fmtAgo, fmtInt, fmtMonthYear } from '@/lib/format'

const NOW = 1_700_000_000_000
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('fmtAgo', () => {
  it('handles the just-now window', () => {
    expect(fmtAgo(NOW, 'en', NOW)).toBe('now')
    expect(fmtAgo(NOW - 59_000, 'en', NOW)).toBe('now')
  })
  it('minutes and hours', () => {
    expect(fmtAgo(NOW - 5 * MIN, 'en', NOW)).toBe('5 minutes ago')
    expect(fmtAgo(NOW - 3 * HOUR, 'en', NOW)).toBe('3 hours ago')
  })
  it('days and yesterday', () => {
    expect(fmtAgo(NOW - 1 * DAY, 'en', NOW)).toBe('yesterday')
    expect(fmtAgo(NOW - 5 * DAY, 'en', NOW)).toBe('5 days ago')
  })
  it('months', () => {
    expect(fmtAgo(NOW - 31 * DAY, 'en', NOW)).toBe('last month')
    expect(fmtAgo(NOW - 92 * DAY, 'en', NOW)).toBe('3 months ago')
  })
  it('renders in the requested locale', () => {
    expect(fmtAgo(NOW - 5 * MIN, 'fr', NOW)).toBe('il y a 5 minutes')
    expect(fmtAgo(NOW - 1 * DAY, 'de', NOW)).toBe('gestern')
  })
})

describe('fmtInt', () => {
  it('groups digits per locale', () => {
    expect(fmtInt(1204, 'en')).toBe('1,204')
    expect(fmtInt(1204, 'de')).toBe('1.204')
  })
})

describe('fmtMonthYear', () => {
  it('renders month + year per locale', () => {
    const d = new Date(Date.UTC(2026, 6, 12))
    expect(fmtMonthYear(d, 'en')).toMatch(/Jul 2026/)
    expect(fmtMonthYear(d, 'fr')).toMatch(/juil\. 2026/)
  })
})
