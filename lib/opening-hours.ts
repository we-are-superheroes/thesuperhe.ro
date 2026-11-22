import type { ErrorDescriptor } from '@/lib/validation'

/* ================================================================
   Opening times of a map place.

   Stored as one versioned JSON value on the place (places.opening_hours)
   because hours are always read, edited and proposed as a unit. Three
   modes, from structured to free:

     { v: 1, mode: 'always' }                 open 24 hours
     { v: 1, mode: 'weekly', periods: [...] } weekly hours, any number of
                                              periods a day, optionally
                                              limited to some months
     { v: 1, mode: 'text' }                   only the free-text note says
                                              when ("first Saturday of the
                                              month", "evenings after dusk")

   The free-text note (places.opening_note) can sit beside any mode.
   "Open now" is only worked out for `always` and `weekly`, in the
   place's own time zone. Pure functions — no I/O, unit-tested.
   ================================================================ */

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface OpeningPeriod {
  days: Weekday[]
  /** "HH:MM", 24-hour clock. */
  from: string
  /** "HH:MM". At or before `from` means the period runs past midnight. */
  to: string
  /** Months (1–12) the period applies in. Absent = all year. */
  months?: number[]
}

export type OpeningHours =
  | { v: 1; mode: 'always' }
  | { v: 1; mode: 'weekly'; periods: OpeningPeriod[] }
  | { v: 1; mode: 'text' }

export const MAX_OPENING_PERIODS = 28

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function uniqueSortedInts(raw: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(raw)) return null
  const out = new Set<number>()
  for (const item of raw) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < min || item > max) return null
    out.add(item)
  }
  return Array.from(out).sort((a, b) => a - b)
}

/**
 * Validate and normalise untrusted opening hours (from a form or a stored
 * proposal). `null`/`undefined` means "not given" and is valid.
 */
export function parseOpeningHours(
  raw: unknown,
): { ok: true; value: OpeningHours | null } | { ok: false; error: ErrorDescriptor } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  const invalid = { ok: false as const, error: { key: 'places.openingHoursInvalid' } }
  if (!isRecord(raw)) return invalid

  if (raw.mode === 'always') return { ok: true, value: { v: 1, mode: 'always' } }
  if (raw.mode === 'text') return { ok: true, value: { v: 1, mode: 'text' } }
  if (raw.mode !== 'weekly' || !Array.isArray(raw.periods)) return invalid
  if (raw.periods.length === 0) return { ok: false, error: { key: 'places.openingHoursEmpty' } }
  if (raw.periods.length > MAX_OPENING_PERIODS) {
    return {
      ok: false,
      error: { key: 'places.openingHoursTooMany', params: { max: MAX_OPENING_PERIODS } },
    }
  }

  const periods: OpeningPeriod[] = []
  for (const item of raw.periods) {
    if (!isRecord(item)) return invalid
    const days = uniqueSortedInts(item.days, 1, 7)
    if (!days || days.length === 0) return { ok: false, error: { key: 'places.openingDaysRequired' } }
    if (typeof item.from !== 'string' || typeof item.to !== 'string') return invalid
    if (!TIME.test(item.from) || !TIME.test(item.to)) {
      return { ok: false, error: { key: 'places.openingTimeInvalid' } }
    }
    const period: OpeningPeriod = { days: days as Weekday[], from: item.from, to: item.to }
    if (item.months !== undefined && item.months !== null) {
      const months = uniqueSortedInts(item.months, 1, 12)
      if (!months) return invalid
      // All twelve months (or none ticked) simply means "all year".
      if (months.length > 0 && months.length < 12) period.months = months
    }
    periods.push(period)
  }
  return { ok: true, value: { v: 1, mode: 'weekly', periods } }
}

/* ================================================================
   Open now
   ================================================================ */

export interface LocalMoment {
  weekday: Weekday
  /** Minutes since local midnight. */
  minutes: number
  month: number
}

const WEEKDAY_BY_NAME: Record<string, Weekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

/** The wall-clock weekday, time and month at `now` in an IANA time zone. */
export function localMoment(now: Date, timeZone: string): LocalMoment | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      month: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const weekday = WEEKDAY_BY_NAME[get('weekday')]
    const hour = Number(get('hour'))
    const minute = Number(get('minute'))
    const month = Number(get('month'))
    if (!weekday || Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(month)) return null
    return { weekday, minutes: hour * 60 + minute, month }
  } catch {
    // Unknown time zone name.
    return null
  }
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function previousDay(day: Weekday): Weekday {
  return (day === 1 ? 7 : day - 1) as Weekday
}

function nextDay(day: Weekday, offset: number): Weekday {
  return ((((day - 1 + offset) % 7) + 7) % 7 + 1) as Weekday
}

function inSeason(period: OpeningPeriod, month: number): boolean {
  return !period.months || period.months.includes(month)
}

export type OpenState =
  /** Open; `until` is the closing time ("HH:MM"), absent when open 24 hours. */
  | { state: 'open'; until?: string }
  /** Closed; the next opening is on `day` at `at`, `inDays` days from today (0 = later today). */
  | { state: 'closed'; next?: { day: Weekday; at: string; inDays: number } }
  /** Can't be worked out (text-only hours, no hours, or no time zone). */
  | { state: 'unknown' }

/**
 * Is the place open at `now`? Month limits are checked against the current
 * local month, which is exact except in the few hours where a period that
 * started on the last evening of a month runs into the next one.
 */
export function openState(
  hours: OpeningHours | null,
  timeZone: string | null,
  now: Date,
): OpenState {
  if (!hours || hours.mode === 'text') return { state: 'unknown' }
  if (hours.mode === 'always') return { state: 'open' }
  if (!timeZone) return { state: 'unknown' }
  const moment = localMoment(now, timeZone)
  if (!moment) return { state: 'unknown' }

  const { weekday, minutes, month } = moment
  const yesterday = previousDay(weekday)

  for (const period of hours.periods) {
    if (!inSeason(period, month)) continue
    const from = toMinutes(period.from)
    const to = toMinutes(period.to)
    const overnight = to <= from
    if (period.days.includes(weekday)) {
      if (!overnight && minutes >= from && minutes < to) return { state: 'open', until: period.to }
      if (overnight && minutes >= from) return { state: 'open', until: period.to }
    }
    // The tail of a period that started yesterday evening.
    if (overnight && period.days.includes(yesterday) && minutes < to) {
      return { state: 'open', until: period.to }
    }
  }

  // Closed: find the next opening within the coming week.
  for (let offset = 0; offset <= 7; offset++) {
    const day = nextDay(weekday, offset)
    let best: string | null = null
    for (const period of hours.periods) {
      if (!inSeason(period, month) || !period.days.includes(day)) continue
      if (offset === 0 && toMinutes(period.from) <= minutes) continue
      if (best === null || period.from < best) best = period.from
    }
    if (best !== null) return { state: 'closed', next: { day, at: best, inDays: offset } }
  }
  return { state: 'closed' }
}

/* ================================================================
   Display helpers
   ================================================================ */

export interface DayHours {
  day: Weekday
  slots: Array<{ from: string; to: string; months?: number[] }>
}

/** Weekly hours regrouped per day (Monday first) for the opening-times table. */
export function weeklyTable(hours: OpeningHours | null): DayHours[] {
  if (!hours || hours.mode !== 'weekly') return []
  const table: DayHours[] = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((day) => ({ day, slots: [] }))
  for (const period of hours.periods) {
    for (const day of period.days) {
      table[day - 1].slots.push({
        from: period.from,
        to: period.to,
        ...(period.months ? { months: period.months } : {}),
      })
    }
  }
  for (const row of table) row.slots.sort((a, b) => a.from.localeCompare(b.from))
  return table
}

/** A date that falls on the given ISO weekday — for `Intl` weekday names. */
export function dateForWeekday(day: Weekday): Date {
  // 1 January 2024 was a Monday.
  return new Date(Date.UTC(2024, 0, day))
}

/** A date in the given month (1–12) — for `Intl` month names. */
export function dateForMonth(month: number): Date {
  return new Date(Date.UTC(2024, month - 1, 15))
}
