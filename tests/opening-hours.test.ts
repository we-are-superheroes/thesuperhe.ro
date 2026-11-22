import { describe, it, expect } from 'vitest'
import {
  MAX_OPENING_PERIODS,
  localMoment,
  openState,
  parseOpeningHours,
  weeklyTable,
  type OpeningHours,
} from '@/lib/opening-hours'

/* Opening times of map places: validation of untrusted input, and the
   "open now" logic across time zones, midnight and seasons. */

const weekly = (periods: unknown[]): OpeningHours => {
  const parsed = parseOpeningHours({ mode: 'weekly', periods })
  if (!parsed.ok || !parsed.value) throw new Error('fixture is not valid')
  return parsed.value
}

describe('parseOpeningHours', () => {
  it('treats nothing as "not given"', () => {
    expect(parseOpeningHours(null)).toEqual({ ok: true, value: null })
    expect(parseOpeningHours(undefined)).toEqual({ ok: true, value: null })
  })

  it('accepts the always and text modes and drops extra keys', () => {
    expect(parseOpeningHours({ mode: 'always', junk: 1 })).toEqual({
      ok: true,
      value: { v: 1, mode: 'always' },
    })
    expect(parseOpeningHours({ mode: 'text' })).toEqual({ ok: true, value: { v: 1, mode: 'text' } })
  })

  it('normalises weekly periods: sorted unique days, months only when partial', () => {
    const parsed = parseOpeningHours({
      mode: 'weekly',
      periods: [
        { days: [5, 2, 2], from: '08:30', to: '18:30', months: [4, 2, 3] },
        { days: [6], from: '09:00', to: '12:00', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
        { days: [7], from: '09:00', to: '12:00', months: [] },
      ],
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        v: 1,
        mode: 'weekly',
        periods: [
          { days: [2, 5], from: '08:30', to: '18:30', months: [2, 3, 4] },
          { days: [6], from: '09:00', to: '12:00' },
          { days: [7], from: '09:00', to: '12:00' },
        ],
      },
    })
  })

  it('rejects malformed input with a catalog key', () => {
    const key = (raw: unknown) => {
      const parsed = parseOpeningHours(raw)
      return parsed.ok ? null : parsed.error.key
    }
    expect(key('always')).toBe('places.openingHoursInvalid')
    expect(key({ mode: 'sometimes' })).toBe('places.openingHoursInvalid')
    expect(key({ mode: 'weekly', periods: [] })).toBe('places.openingHoursEmpty')
    expect(key({ mode: 'weekly', periods: [{ days: [], from: '08:00', to: '09:00' }] })).toBe(
      'places.openingDaysRequired',
    )
    expect(key({ mode: 'weekly', periods: [{ days: [8], from: '08:00', to: '09:00' }] })).toBe(
      'places.openingDaysRequired',
    )
    expect(key({ mode: 'weekly', periods: [{ days: [1], from: '8:00', to: '09:00' }] })).toBe(
      'places.openingTimeInvalid',
    )
    expect(key({ mode: 'weekly', periods: [{ days: [1], from: '08:00', to: '25:00' }] })).toBe(
      'places.openingTimeInvalid',
    )
    expect(
      key({ mode: 'weekly', periods: [{ days: [1], from: '08:00', to: '09:00', months: [13] }] }),
    ).toBe('places.openingHoursInvalid')
    const many = Array.from({ length: MAX_OPENING_PERIODS + 1 }, () => ({
      days: [1],
      from: '08:00',
      to: '09:00',
    }))
    expect(key({ mode: 'weekly', periods: many })).toBe('places.openingHoursTooMany')
  })
})

describe('localMoment', () => {
  it('reads the wall clock in the place’s time zone', () => {
    // Wednesday 14 Jan 2026, 23:30 UTC = Thursday 00:30 in Zurich (UTC+1).
    const now = new Date('2026-01-14T23:30:00Z')
    expect(localMoment(now, 'Europe/Zurich')).toEqual({ weekday: 4, minutes: 30, month: 1 })
    expect(localMoment(now, 'UTC')).toEqual({ weekday: 3, minutes: 23 * 60 + 30, month: 1 })
    // …and still Wednesday afternoon in Los Angeles.
    expect(localMoment(now, 'America/Los_Angeles')).toEqual({ weekday: 3, minutes: 15 * 60 + 30, month: 1 })
  })

  it('follows daylight saving time', () => {
    // 10:00 UTC is 11:00 in Zurich in winter and 12:00 in summer.
    expect(localMoment(new Date('2026-01-14T10:00:00Z'), 'Europe/Zurich')?.minutes).toBe(11 * 60)
    expect(localMoment(new Date('2026-07-15T10:00:00Z'), 'Europe/Zurich')?.minutes).toBe(12 * 60)
  })

  it('returns null for an unknown zone', () => {
    expect(localMoment(new Date(), 'Mars/Olympus')).toBeNull()
  })
})

describe('openState', () => {
  const zone = 'Europe/Zurich'
  // Tue–Sat 08:30–18:30 (the "Bio du Bourg" example from the design).
  const shop = weekly([{ days: [2, 3, 4, 5, 6], from: '08:30', to: '18:30' }])

  it('is unknown without structured hours or a time zone', () => {
    const now = new Date('2026-01-14T10:00:00Z')
    expect(openState(null, zone, now)).toEqual({ state: 'unknown' })
    expect(openState({ v: 1, mode: 'text' }, zone, now)).toEqual({ state: 'unknown' })
    expect(openState(shop, null, now)).toEqual({ state: 'unknown' })
    expect(openState(shop, 'Mars/Olympus', now)).toEqual({ state: 'unknown' })
  })

  it('is always open in the always mode, even without a zone', () => {
    expect(openState({ v: 1, mode: 'always' }, null, new Date())).toEqual({ state: 'open' })
  })

  it('reports open with the closing time', () => {
    // Wednesday 11:00 local.
    expect(openState(shop, zone, new Date('2026-01-14T10:00:00Z'))).toEqual({
      state: 'open',
      until: '18:30',
    })
  })

  it('treats the closing minute as closed and the opening minute as open', () => {
    // Wednesday 18:30 local → closed, next opening Thursday.
    expect(openState(shop, zone, new Date('2026-01-14T17:30:00Z'))).toEqual({
      state: 'closed',
      next: { day: 4, at: '08:30', inDays: 1 },
    })
    // Wednesday 08:30 local → open.
    expect(openState(shop, zone, new Date('2026-01-14T07:30:00Z')).state).toBe('open')
  })

  it('finds a later opening on the same day', () => {
    const split = weekly([
      { days: [3], from: '09:00', to: '12:00' },
      { days: [3], from: '14:00', to: '18:00' },
    ])
    // Wednesday 13:00 local.
    expect(openState(split, zone, new Date('2026-01-14T12:00:00Z'))).toEqual({
      state: 'closed',
      next: { day: 3, at: '14:00', inDays: 0 },
    })
  })

  it('skips closed days to the next opening', () => {
    // Sunday 10:00 local → Monday is closed too, next is Tuesday.
    expect(openState(shop, zone, new Date('2026-01-18T09:00:00Z'))).toEqual({
      state: 'closed',
      next: { day: 2, at: '08:30', inDays: 2 },
    })
  })

  it('wraps to the same weekday next week when that is the only opening', () => {
    const market = weekly([{ days: [6], from: '09:00', to: '12:00' }])
    // Saturday 13:00 local, after closing.
    expect(openState(market, zone, new Date('2026-01-17T12:00:00Z'))).toEqual({
      state: 'closed',
      next: { day: 6, at: '09:00', inDays: 7 },
    })
  })

  it('handles periods that run past midnight', () => {
    // Friday 20:00 to Saturday 02:00.
    const late = weekly([{ days: [5], from: '20:00', to: '02:00' }])
    // Friday 23:00 local → open.
    expect(openState(late, zone, new Date('2026-01-16T22:00:00Z'))).toEqual({
      state: 'open',
      until: '02:00',
    })
    // Saturday 01:00 local → still open (tail of Friday's period).
    expect(openState(late, zone, new Date('2026-01-17T00:00:00Z'))).toEqual({
      state: 'open',
      until: '02:00',
    })
    // Saturday 02:00 local → closed.
    expect(openState(late, zone, new Date('2026-01-17T01:00:00Z')).state).toBe('closed')
    // Friday 01:00 local → closed (Thursday has no late period).
    expect(openState(late, zone, new Date('2026-01-16T00:00:00Z')).state).toBe('closed')
  })

  it('applies month limits', () => {
    // Toad patrol: February to April, every evening.
    const patrol = weekly([{ days: [1, 2, 3, 4, 5, 6, 7], from: '18:00', to: '22:00', months: [2, 3, 4] }])
    // 11 March, 19:30 local → open.
    expect(openState(patrol, zone, new Date('2026-03-11T18:30:00Z')).state).toBe('open')
    // 15 July, 19:30 local → closed, and no opening this month.
    expect(openState(patrol, zone, new Date('2026-07-15T17:30:00Z'))).toEqual({ state: 'closed' })
  })
})

describe('weeklyTable', () => {
  it('regroups periods per day, Monday first, earliest slot first', () => {
    const hours = weekly([
      { days: [3, 6], from: '14:00', to: '18:00' },
      { days: [6], from: '09:00', to: '12:00', months: [5, 6] },
    ])
    const table = weeklyTable(hours)
    expect(table.map((row) => row.day)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(table[0].slots).toEqual([])
    expect(table[2].slots).toEqual([{ from: '14:00', to: '18:00' }])
    expect(table[5].slots).toEqual([
      { from: '09:00', to: '12:00', months: [5, 6] },
      { from: '14:00', to: '18:00' },
    ])
  })

  it('is empty for the other modes', () => {
    expect(weeklyTable(null)).toEqual([])
    expect(weeklyTable({ v: 1, mode: 'always' })).toEqual([])
  })
})
