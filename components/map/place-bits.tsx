import { cn } from '@/lib/utils'
import type { PlaceCategory } from '@/lib/places-shared'
import { dateForWeekday, type OpenState, type Weekday } from '@/lib/opening-hours'

/* ================================================================
   Small shared pieces of the map UI: category icons and colours,
   the Superhero / independent badge, and the "open now" wording.
   No hooks and no browser APIs, so server and client components can
   both use them.
   ================================================================ */

/**
 * One stroked path per category (24 × 24, the icons of the Map design).
 * Kept as path data rather than components because the map pins are
 * plain DOM nodes drawn outside React.
 */
export const CATEGORY_ICON_PATHS: Record<PlaceCategory, string> = {
  farm: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
  organic: 'M11 20A7 7 0 0 1 4 13C4 7 9 4 20 4c0 9-3 16-9 16zM4 20c2-5 5-8 10-10',
  coop: 'M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0',
  nature: 'M12 22V12M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 15c0-3 2-5 7-5 0 4-3 5-7 5z',
  repair:
    'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  garden:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  learn: 'M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14',
  // A service bell.
  services: 'M3 18h18M5 18a7 7 0 0 1 14 0M12 11V8M10 8h4M4 21h16',
  // Three dots in a circle.
  other: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12h.01M12 12h.01M16 12h.01',
}

/** The two-leaves mark drawn on Superhero pins (100 × 100 viewBox). */
export const LEAF_PATH = 'M50 12 C72 26 78 54 50 90 C22 54 28 26 50 12 Z'

export function CategoryIcon({
  category,
  className,
}: {
  category: PlaceCategory
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={CATEGORY_ICON_PATHS[category]} />
    </svg>
  )
}

/** Category colours for the list thumbnails — fixed, the same in every theme. */
export const THUMB_CLASS: Record<PlaceCategory, string> = {
  farm: 'from-[#5C3600] to-[#B86E00]',
  organic: 'from-[#1A5C40] to-[#2f8f65]',
  coop: 'from-[#1B3A6B] to-[#2E5FAA]',
  nature: 'from-[#1a3d2c] to-[#3d7a5c]',
  repair: 'from-[#7A1A1A] to-[#b94444]',
  garden: 'from-[#3b5a1a] to-[#5f8a2a]',
  learn: 'from-[#2A3A52] to-[#3D5170]',
  services: 'from-[#44296B] to-[#7650A8]',
  other: 'from-[#3A4352] to-[#667284]',
}

export function CategoryThumb({
  category,
  className,
}: {
  category: PlaceCategory
  className?: string
}) {
  return (
    <div
      className={cn(
        'on-imagery flex size-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white',
        THUMB_CLASS[category],
        className,
      )}
    >
      <CategoryIcon category={category} className="size-6" />
    </div>
  )
}

const BADGE_BASE =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide'

/** "Superhero project" (filled) or "Independent" (outline). */
export function SourceBadge({ hero, label }: { hero: boolean; label: string }) {
  return (
    <span
      className={cn(
        BADGE_BASE,
        hero ? 'bg-brand-accent text-fg-on-accent' : 'border border-border-strong text-fg-secondary',
      )}
    >
      {label}
    </span>
  )
}

/** "Temporarily closed" / "Permanently closed". */
export function ClosedBadge({ label }: { label: string }) {
  return <span className={cn(BADGE_BASE, 'bg-red-500/[0.16] text-red-300')}>{label}</span>
}

/* ================================================================
   "Open now" wording
   ================================================================ */

/** The subset of the `map` translator this module needs. */
type HoursTranslator = (
  key:
    | 'hours.always'
    | 'hours.openNow'
    | 'hours.openUntil'
    | 'hours.closedNow'
    | 'hours.opensToday'
    | 'hours.opensTomorrow'
    | 'hours.opensDay',
  values?: Record<string, string>,
) => string

/** Weekday name in the reader's language ("Tuesday", "mardi"). */
export function weekdayName(day: Weekday, locale: string, width: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(
    dateForWeekday(day),
  )
}

/**
 * One line for a card: "Open now · closes at 18:30", "Closed · opens
 * Tuesday at 08:30". Null when the state can't be worked out (the caller
 * then shows the free-text note instead). Times stay in the 24-hour
 * "HH:MM" form they are stored in, so server and browser always agree.
 */
export function openStateLabel(
  state: OpenState,
  t: HoursTranslator,
  locale: string,
  alwaysOpen: boolean,
): string | null {
  if (state.state === 'unknown') return null
  if (state.state === 'open') {
    if (alwaysOpen) return t('hours.always')
    return state.until ? t('hours.openUntil', { time: state.until }) : t('hours.openNow')
  }
  if (!state.next) return t('hours.closedNow')
  if (state.next.inDays === 0) return t('hours.opensToday', { time: state.next.at })
  if (state.next.inDays === 1) return t('hours.opensTomorrow', { time: state.next.at })
  return t('hours.opensDay', { day: weekdayName(state.next.day, locale), time: state.next.at })
}
