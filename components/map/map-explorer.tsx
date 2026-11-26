'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  Building2,
  Clock,
  Info,
  ListFilter,
  Loader2,
  MapPin,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  geocodeAction,
  loadPlaceDetailAction,
  loadPlacesNearAction,
} from '@/app/(public)/map/actions'
import type { GeocodeHit } from '@/lib/geocode'
import type { PlaceDetailView, PlaceResult } from '@/lib/places'
import { openState } from '@/lib/opening-hours'
import {
  DEFAULT_RADIUS_KM,
  MAP_PLACE_COOKIE,
  encodeMapPlaceCookie,
  haversineKm,
  RADIUS_OPTIONS_KM,
  coarsen,
  directionsUrl,
  foldText,
  type LatLng,
  type PlaceCategory,
  type PlaceOperator,
} from '@/lib/places-shared'
import { MapView } from '@/components/map/map-loader'
import { useMapLabels } from '@/components/map/use-map-labels'
import { PlacePanel } from '@/components/map/place-panel'
import {
  CategoryOptions,
  FIELD,
  FIELD_INPUT,
  FILTER_BUTTON,
  FilterCount,
  FilterMenu,
  FilterTag,
  OperatorOptions,
  QUIET_BUTTON,
  RadiusOptions,
  SourceOptions,
  WhereFeedback,
  WhereField,
  type SourceFilter,
} from '@/components/map/map-filters'
import type { MapPin as MapPinData } from '@/components/map/map-canvas'
import {
  CATEGORY_SQUARE_CLASS,
  CategoryThumb,
  ClosedBadge,
  SourceBadge,
  openStateLabel,
} from '@/components/map/place-bits'
import { CARD_SHELL, CardFooter, CardHeader, FactList, FactRow } from '@/components/ui/card-bits'

/* ================================================================
   MapExplorer — the public /map page: search, filters, result list
   and map, kept in step with each other.

   The filter bar has two rows on wide screens: finding a place (search,
   town, distance), then three buttons that open small menus. On a phone
   the town, the distance and every filter live in one sheet that slides
   up from the bottom, so the map and the results get the screen.

   The server sends every place within the largest search radius of
   the chosen centre. Category, source, text, distance and sorting
   are then applied here in the browser, so nothing waits on the
   network. Choosing another town reloads from the server (the centre
   lives in the URL); "use my location" loads through a server action
   and deliberately stays out of the URL.

   The list is the accessible equivalent of the map: it works without
   WebGL and for screen readers.
   ================================================================ */

export type { SourceFilter }
export type SortOrder = 'near' | 'name'

export interface MapExplorerProps {
  /** The centre the server searched around (from the URL or a rough guess), or null. */
  centre: LatLng | null
  /** Name of that centre, when known. */
  centreLabel: string | null
  /** True when the centre came from the URL (a town the visitor chose). */
  centreInUrl: boolean
  places: PlaceResult[]
  initial: {
    radius: number
    q: string
    categories: PlaceCategory[]
    /** Who runs the place; empty = no filter. */
    operators: PlaceOperator[]
    source: SourceFilter
    sort: SortOrder
    selected: string | null
    /** Place whose details panel is open. */
    open: string | null
  }
  /** Details of the open place, loaded with the page so a shared link shows them at once. */
  initialDetail: PlaceDetailView | null
  /** Where the map looks before any search. */
  fallback: { centre: LatLng; zoom: number }
  /** Signed-in curators add directly; everyone else suggests. */
  canAddDirectly: boolean
  /** Signed-out visitors have a bounded page height below the public navbar. */
  signedIn: boolean
  /** Server time of this render, so "open now" matches on both sides. */
  nowMs: number
}

const SHEET_HEADING = 'mb-3 mt-5 font-display text-lg'
const BTN =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-fast'
const BTN_PRIMARY = 'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover'
const BTN_SECONDARY =
  'border-border-default bg-bg-surface-2 text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'
// The pop-up card sits on bg-surface-2, the usual secondary fill, so its
// secondary buttons take the surface below to stay visible.
const BTN_SECONDARY_ON_POPUP =
  'border-border-default bg-bg-surface text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'

export function MapExplorer({
  centre: urlCentre,
  centreLabel,
  centreInUrl,
  places: urlPlaces,
  initial,
  initialDetail,
  fallback,
  canAddDirectly,
  signedIn,
  nowMs,
}: MapExplorerProps) {
  const t = useTranslations('map')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const mapLabels = useMapLabels()

  const [radius, setRadius] = useState(initial.radius)
  const [q, setQ] = useState(initial.q)
  const [categories, setCategories] = useState<PlaceCategory[]>(initial.categories)
  const [operators, setOperators] = useState<PlaceOperator[]>(initial.operators)
  const [source, setSource] = useState<SourceFilter>(initial.source)
  const [sort, setSort] = useState<SortOrder>(initial.sort)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initial.selected ?? initial.open)

  // The details panel: which place is open, and the details loaded so far.
  const [openSlug, setOpenSlug] = useState<string | null>(initial.open)
  const [details, setDetails] = useState<Record<string, PlaceDetailView>>(() =>
    initialDetail ? { [initialDetail.slug]: initialDetail } : {},
  )
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loadingDetail, startDetail] = useTransition()

  // "Where" field and the town lookup.
  const [whereText, setWhereText] = useState(centreLabel ?? '')
  const [hits, setHits] = useState<GeocodeHit[] | null>(null)
  const [whereError, setWhereError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()

  // Results around the visitor's own position replace the URL-driven ones
  // until another town is chosen. Never written to the URL.
  const [local, setLocal] = useState<{ centre: LatLng; places: PlaceResult[] } | null>(null)
  const [locating, setLocating] = useState(false)

  // The filter menu that is open (wide screens), and the sheet (phones):
  // opened at the top from the area button, or at the filters.
  const [menu, setMenu] = useState<'source' | 'category' | 'operator' | null>(null)
  const [sheet, setSheet] = useState<'area' | 'filters' | null>(null)
  // A click anywhere outside the filter menus closes the open one.
  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-filter-menu]')) {
        setMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menu])

  // A new centre from the server (the visitor picked a town, or went back):
  // drop the local override and show the new name. Adjusted during render,
  // React's pattern for reacting to a changed prop.
  const urlKey = urlCentre ? `${urlCentre.lat},${urlCentre.lng}` : ''
  const [seenUrlKey, setSeenUrlKey] = useState(urlKey)
  if (urlKey !== seenUrlKey) {
    setSeenUrlKey(urlKey)
    setLocal(null)
    setWhereText(centreLabel ?? '')
    setHits(null)
    setWhereError(null)
  }

  const centre = local?.centre ?? urlCentre
  const places = local?.places ?? urlPlaces
  const placeName = local ? t('page.myLocation') : centreLabel

  const listRef = useRef<HTMLUListElement>(null)
  const now = useMemo(() => new Date(nowMs), [nowMs])
  const distanceFormat = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  )

  /* ── Filtering and sorting (all in the browser) ───────────────────── */
  const visible = useMemo(() => {
    const needle = foldText(q.trim())
    const out = places.filter((p) => {
      if (p.distanceKm > radius) return false
      if (source === 'hero' && !p.project) return false
      if (source === 'indie' && p.project) return false
      if (categories.length > 0 && !categories.includes(p.category)) return false
      // A place whose operator is not known matches no "run by" filter.
      if (operators.length > 0 && (!p.operator || !operators.includes(p.operator))) return false
      if (needle) {
        const haystack = foldText(
          [
            p.name,
            p.summary,
            p.city ?? '',
            t(`categories.${p.category}.one`),
            t(`categories.${p.category}.many`),
            p.operator ? t(`operators.${p.operator}`) : '',
            ...p.productNames,
          ].join(' '),
        )
        if (!haystack.includes(needle)) return false
      }
      return true
    })
    if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, locale))
    else out.sort((a, b) => a.distanceKm - b.distanceKm)
    return out
  }, [places, radius, source, categories, operators, q, sort, locale, t])

  // While the details panel is open it replaces the small card over the map.
  const selected = openSlug ? null : (visible.find((p) => p.slug === selectedSlug) ?? null)
  const openDetail = openSlug ? (details[openSlug] ?? null) : null
  const openResult = openSlug ? (places.find((p) => p.slug === openSlug) ?? null) : null

  const pins: MapPinData[] = useMemo(
    () =>
      visible.map((p) => ({
        id: p.slug,
        lat: p.lat,
        lng: p.lng,
        hero: !!p.project,
        category: p.category,
        approximate: p.approximate,
        label: p.project ? t('card.pinHero', { name: p.name }) : t('card.pinIndie', { name: p.name }),
      })),
    [visible, t],
  )

  /* ── URL: the shareable view ──────────────────────────────────────── */
  interface UrlState {
    centre: LatLng | null
    label: string | null
    radius: number
    q: string
    categories: PlaceCategory[]
    operators: PlaceOperator[]
    source: SourceFilter
    sort: SortOrder
    selected: string | null
    open: string | null
  }
  const urlState = (): UrlState => ({
    // A position from the visitor's device never goes into the URL.
    centre: local || !centreInUrl ? null : urlCentre,
    label: local || !centreInUrl ? null : centreLabel,
    radius,
    q,
    categories,
    operators,
    source,
    sort,
    selected: selectedSlug,
    open: openSlug,
  })
  const buildUrl = (state: UrlState): string => {
    const params = new URLSearchParams()
    if (state.centre) params.set('c', `${state.centre.lat},${state.centre.lng}`)
    if (state.centre && state.label) params.set('l', state.label)
    // The default radius is left out to keep shared links short.
    if (state.radius !== DEFAULT_RADIUS_KM) params.set('r', String(state.radius))
    if (state.q.trim()) params.set('q', state.q.trim())
    if (state.categories.length > 0) params.set('cat', state.categories.join(','))
    if (state.operators.length > 0) params.set('op', state.operators.join(','))
    if (state.source !== 'all') params.set('src', state.source)
    if (state.sort !== 'near') params.set('sort', state.sort)
    if (state.open) params.set('d', state.open)
    else if (state.selected) params.set('p', state.selected)
    const query = params.toString()
    return query ? `/map?${query}` : '/map'
  }
  /** Mirror a filter change into the address bar without reloading. */
  const syncUrl = (patch: Partial<UrlState>) => {
    window.history.replaceState(null, '', buildUrl({ ...urlState(), ...patch }))
  }

  /* ── Handlers ─────────────────────────────────────────────────────── */
  const changeRadius = (value: number) => {
    setRadius(value)
    syncUrl({ radius: value })
  }
  const changeQuery = (value: string) => {
    setQ(value)
    syncUrl({ q: value })
  }
  const changeSource = (value: SourceFilter) => {
    setSource(value)
    syncUrl({ source: value })
  }
  const changeSort = (value: SortOrder) => {
    setSort(value)
    syncUrl({ sort: value })
  }
  const toggleCategory = (category: PlaceCategory | null) => {
    const next =
      category === null
        ? []
        : categories.includes(category)
          ? categories.filter((c) => c !== category)
          : [...categories, category]
    setCategories(next)
    syncUrl({ categories: next })
  }
  const toggleOperator = (operator: PlaceOperator | null) => {
    const next =
      operator === null
        ? []
        : operators.includes(operator)
          ? operators.filter((o) => o !== operator)
          : [...operators, operator]
    setOperators(next)
    syncUrl({ operators: next })
  }
  const select = (slug: string | null, fromMap = false) => {
    setSelectedSlug(slug)
    syncUrl({ selected: slug })
    // Bring the place's card into view, but only where the list scrolls on
    // its own beside the map (wide screens). On a phone the list sits below
    // the map in the page, and scrolling to the card would take the map,
    // and the pop-up just opened on it, out of view.
    const list = listRef.current
    if (slug && fromMap && list && getComputedStyle(list).overflowY === 'auto') {
      list
        .querySelector(`[data-slug="${CSS.escape(slug)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }
  const openPlace = (slug: string) => {
    setSelectedSlug(slug)
    setOpenSlug(slug)
    setDetailError(null)
    syncUrl({ selected: slug, open: slug })
    if (details[slug]) return
    startDetail(async () => {
      const result = await loadPlaceDetailAction(slug)
      if (result.success) setDetails((known) => ({ ...known, [slug]: result.data }))
      else setDetailError(result.error)
    })
  }
  const closePlace = () => {
    if (!openSlug) return
    const slug = openSlug
    setOpenSlug(null)
    syncUrl({ open: null })
    // Hand focus back to the "Details" button the visitor came from.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-open="${CSS.escape(slug)}"]`)
        ?.focus()
    })
  }
  /** Take away the chosen filters; the search text and the distance stay. */
  const clearChosen = () => {
    setCategories([])
    setOperators([])
    setSource('all')
    syncUrl({ categories: [], operators: [], source: 'all' })
  }
  const clearFilters = () => {
    const widest = RADIUS_OPTIONS_KM[RADIUS_OPTIONS_KM.length - 1]
    setQ('')
    setCategories([])
    setOperators([])
    setSource('all')
    setRadius(widest)
    syncUrl({ q: '', categories: [], operators: [], source: 'all', radius: widest })
  }

  const goToHit = (hit: GeocodeHit) => {
    setHits(null)
    setWhereError(null)
    setWhereText(hit.name)
    // Remember the town on this device, so the map opens here next time.
    document.cookie = `${MAP_PLACE_COOKIE}=${encodeMapPlaceCookie(
      { lat: hit.lat, lng: hit.lng },
      hit.name,
    )}; path=/; max-age=31536000; samesite=lax`
    setOpenSlug(null)
    router.push(
      buildUrl({
        ...urlState(),
        centre: { lat: hit.lat, lng: hit.lng },
        label: hit.name,
        selected: null,
        open: null,
      }),
    )
  }

  const searchWhere = (event: React.FormEvent) => {
    event.preventDefault()
    const text = whereText.trim()
    if (text.length < 2) return
    setHits(null)
    setWhereError(null)
    startSearch(async () => {
      const result = await geocodeAction(text, centre ?? undefined)
      if (!result.success) setWhereError(result.error)
      else if (result.data.length === 0) setWhereError(t('page.whereNoMatch'))
      else if (result.data.length === 1) goToHit(result.data[0])
      else setHits(result.data)
    })
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setWhereError(t('page.locationFailed'))
      return
    }
    setLocating(true)
    setWhereError(null)
    setHits(null)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // Rounded to about 1 km before it leaves the device.
        const rounded = {
          lat: coarsen(position.coords.latitude),
          lng: coarsen(position.coords.longitude),
        }
        const result = await loadPlacesNearAction(rounded)
        setLocating(false)
        if (!result.success) {
          setWhereError(result.error)
          return
        }
        setLocal(result.data)
        setWhereText(t('page.myLocation'))
        setSelectedSlug(null)
        setOpenSlug(null)
        window.history.replaceState(
          null,
          '',
          buildUrl({ ...urlState(), centre: null, label: null, selected: null, open: null }),
        )
      },
      () => {
        setLocating(false)
        setWhereError(t('page.locationFailed'))
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }

  /* ── Small render helpers ─────────────────────────────────────────── */
  const hoursLine = (p: PlaceResult): string | null => {
    if (p.operatingStatus !== 'active') return null
    const state = openState(p.openingHours, p.timezone, now)
    // Closed with no opening in sight (out of season): the note says more
    // than "Closed now" does.
    if (state.state === 'closed' && !state.next && p.openingNote) return p.openingNote
    const label = openStateLabel(
      state,
      t as unknown as Parameters<typeof openStateLabel>[1],
      locale,
      p.openingHours?.mode === 'always',
    )
    return label ?? p.openingNote
  }
  const closedLine = (p: PlaceResult): string | null => {
    if (p.operatingStatus !== 'temporarily_closed') return null
    const parts = [p.statusNote]
    if (p.reopensOn) {
      parts.push(
        t('hours.reopens', {
          date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
            new Date(`${p.reopensOn}T00:00:00Z`),
          ),
        }),
      )
    }
    return parts.filter(Boolean).join(' · ') || null
  }
  const km = (value: number) => distanceFormat.format(value)

  const suggestLabel = canAddDirectly ? t('page.add') : t('page.suggest')

  const chosenCount = categories.length + operators.length + (source === 'all' ? 0 : 1)
  const areaLabel = `${placeName ?? t('page.whereLabel')} · ${t('page.distanceOption', { km: radius })}`

  // The chosen filters as tags, each removed with one click. Drawn beside the
  // filter buttons on wide screens and in a row that scrolls on phones.
  const tags = (
    <>
      {source !== 'all' && (
        <FilterTag label={t(`page.source.${source}`)} onRemove={() => changeSource('all')} />
      )}
      {categories.map((category) => (
        <FilterTag
          key={category}
          label={t(`categories.${category}.many`)}
          category={category}
          onRemove={() => toggleCategory(category)}
        />
      ))}
      {operators.map((operator) => (
        <FilterTag
          key={operator}
          label={t(`operators.${operator}`)}
          onRemove={() => toggleOperator(operator)}
        />
      ))}
    </>
  )

  // Town lookup: several matches, or none.
  const whereFeedback = (hits || whereError) && (
    <WhereFeedback hits={hits} error={whereError} onChoose={goToHit} />
  )

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape' && openSlug) closePlace()
      }}
      className={cn(
        'flex flex-col',
        signedIn
          ? 'min-h-0 flex-1 overflow-y-auto lg:overflow-hidden'
          : 'lg:h-[calc(100dvh-4rem)]',
      )}
    >
      <h1 className="sr-only">{t('page.heading')}</h1>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('page.searchLabel')}
        className="shrink-0 border-b border-border-subtle bg-bg-base px-4 py-3 sm:px-6 md:py-4"
      >
        {/* Row one: finding a place */}
        <div className="flex items-center gap-3">
          <div className={cn(FIELD, 'min-w-0 flex-1')}>
            <Search className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
            <label htmlFor="map-q" className="sr-only">
              {t('page.searchLabel')}
            </label>
            <input
              id="map-q"
              type="search"
              value={q}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder={t('page.searchPlaceholder')}
              autoComplete="off"
              className={cn(FIELD_INPUT, 'flex-1')}
            />
          </div>
          <WhereField
            id="map-where"
            className="min-w-0 flex-[0_1_300px] max-md:hidden"
            value={whereText}
            onChange={setWhereText}
            onSubmit={searchWhere}
            searching={searching}
          >
            <span className="h-5 w-px shrink-0 bg-border-default" aria-hidden />
            <label htmlFor="map-radius" className="sr-only">
              {t('page.distanceLabel')}
            </label>
            <select
              id="map-radius"
              value={radius}
              onChange={(e) => changeRadius(Number(e.target.value))}
              className="h-full shrink-0 cursor-pointer bg-transparent text-sm text-fg-primary outline-none"
            >
              {RADIUS_OPTIONS_KM.map((value) => (
                <option key={value} value={value} className="bg-bg-surface text-fg-primary">
                  {t('page.distanceOption', { km: value })}
                </option>
              ))}
            </select>
          </WhereField>
          <Link href="/map/suggest" className={cn(BTN, BTN_SECONDARY, 'h-[42px] max-md:hidden')}>
            <Plus className="size-4" strokeWidth={2.5} aria-hidden />
            {suggestLabel}
          </Link>
        </div>

        {/* While the sheet is open it shows the town matches itself. */}
        {!sheet && whereFeedback && <div className="mt-3">{whereFeedback}</div>}

        {/* Row two on wide screens: the filter menus and the chosen filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2 max-md:hidden">
          <FilterMenu
            label={t('page.filters.show', { source: t(`page.source.${source}`) })}
            active={source !== 'all'}
            open={menu === 'source'}
            onOpenChange={(open) => setMenu(open ? 'source' : null)}
          >
            <SourceOptions name="map-source" value={source} onChange={changeSource} size="sm" />
          </FilterMenu>
          <FilterMenu
            label={t('fields.category')}
            count={categories.length}
            open={menu === 'category'}
            onOpenChange={(open) => setMenu(open ? 'category' : null)}
            wide
            clearLabel={t('page.filters.clearCategories')}
            onClear={() => toggleCategory(null)}
          >
            <CategoryOptions
              name="map-category"
              chosen={categories}
              onToggle={toggleCategory}
              size="sm"
            />
          </FilterMenu>
          <FilterMenu
            label={t('page.operatorsLabel')}
            count={operators.length}
            open={menu === 'operator'}
            onOpenChange={(open) => setMenu(open ? 'operator' : null)}
            clearLabel={t('page.filters.clear')}
            onClear={() => toggleOperator(null)}
          >
            <OperatorOptions
              name="map-operator"
              chosen={operators}
              onToggle={toggleOperator}
              size="sm"
            />
          </FilterMenu>
          {chosenCount > 0 && (
            <>
              <span className="mx-2 h-[22px] w-px bg-border-default" aria-hidden />
              {tags}
              <button type="button" onClick={clearChosen} className={cn(QUIET_BUTTON, 'h-[30px]')}>
                {t('page.filters.clearAll')}
              </button>
            </>
          )}
        </div>

        {/* Rows two and three on phones: the area, one Filters button, the tags */}
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setSheet('area')}
            className={cn(FILTER_BUTTON, 'h-10 min-w-0 justify-start')}
          >
            <MapPin className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
            <span className="truncate">{areaLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => setSheet('filters')}
            className={cn(FILTER_BUTTON, 'h-10', chosenCount > 0 && 'border-brand-accent')}
          >
            <ListFilter className="size-3.5 text-fg-tertiary" aria-hidden />
            {t('page.filters.title')}
            <FilterCount count={chosenCount} />
          </button>
        </div>
        {chosenCount > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] md:hidden">
            {tags}
          </div>
        )}

        {/* The sheet: a modal dialog, so the browser keeps focus inside it,
            closes it on Escape and hands focus back to the button. */}
        {sheet && (
          <dialog
            ref={(el) => {
              if (!el || el.open) return
              el.showModal()
              if (sheet === 'filters') el.querySelector('[data-sheet-filters]')?.scrollIntoView()
            }}
            aria-labelledby="map-sheet-title"
            onClose={() => setSheet(null)}
            onClick={(event) => {
              // A tap on the dimmed page behind the sheet.
              if (event.target === event.currentTarget) event.currentTarget.close()
            }}
            onKeyDown={(event) => {
              // Escape closes only the sheet, not the details panel behind it.
              if (event.key === 'Escape') event.stopPropagation()
            }}
            className="fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[20px] border-t border-border-strong bg-bg-surface p-0 text-fg-primary backdrop:bg-bg-overlay"
          >
            <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
              <h2 id="map-sheet-title" className="font-display text-xl">
                {t('page.filters.title')}
              </h2>
              <button
                type="button"
                onClick={(event) => event.currentTarget.closest('dialog')?.close()}
                aria-label={t('page.filters.close')}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-bg-surface-2"
              >
                <X className="size-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            {/* "relative" keeps the hidden labels inside this scrolling part. */}
            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <h3 className={SHEET_HEADING}>{t('page.filters.area')}</h3>
              <WhereField id="map-where-sheet" className="mb-3" value={whereText} onChange={setWhereText} onSubmit={searchWhere} searching={searching} />
              {whereFeedback && <div className="mb-3">{whereFeedback}</div>}
              <RadiusOptions name="map-sheet-radius" value={radius} onChange={changeRadius} />
              <h3 data-sheet-filters className={SHEET_HEADING}>
                {t('page.showLabel')}
              </h3>
              <SourceOptions
                name="map-sheet-source"
                value={source}
                onChange={changeSource}
                size="lg"
              />
              <h3 className={SHEET_HEADING}>{t('fields.category')}</h3>
              <CategoryOptions
                name="map-sheet-category"
                chosen={categories}
                onToggle={toggleCategory}
                size="lg"
              />
              <h3 className={SHEET_HEADING}>{t('page.operatorsLabel')}</h3>
              <OperatorOptions
                name="map-sheet-operator"
                chosen={operators}
                onToggle={toggleOperator}
                size="lg"
              />
            </div>
            <div className="grid shrink-0 grid-cols-[auto_1fr] gap-3 border-t border-border-subtle px-4 pb-4 pt-3">
              <button
                type="button"
                onClick={clearChosen}
                className={cn(BTN, BTN_SECONDARY, 'h-12 cursor-pointer')}
              >
                {t('page.filters.clearAll')}
              </button>
              {/* Says how many results the choice gives before the sheet is closed. */}
              <button
                type="button"
                onClick={(event) => event.currentTarget.closest('dialog')?.close()}
                className={cn(BTN, BTN_PRIMARY, 'h-12 cursor-pointer')}
              >
                {visible.length > 0
                  ? t('page.filters.showResults', { count: visible.length })
                  : t('page.filters.noResults')}
              </button>
            </div>
          </dialog>
        )}
      </section>

      {/* ── List + map ──────────────────────────────────────────────── */}
      <div className="flex flex-col lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[440px_1fr]">
        <section
          aria-label={t('page.resultsLabel')}
          className="relative flex flex-col lg:min-h-0 lg:border-r lg:border-border-subtle"
        >
          {centre ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
                <p className="text-sm text-fg-secondary" aria-live="polite">
                  {placeName
                    ? t.rich('page.count', {
                        count: visible.length,
                        km: radius,
                        place: placeName,
                        strong: (chunks) => (
                          <strong className="font-semibold text-fg-primary">{chunks}</strong>
                        ),
                      })
                    : t.rich('page.countNearYou', {
                        count: visible.length,
                        km: radius,
                        strong: (chunks) => (
                          <strong className="font-semibold text-fg-primary">{chunks}</strong>
                        ),
                      })}
                </p>
                <label className="flex shrink-0 items-center gap-1.5 text-sm text-fg-secondary">
                  {t('page.sortLabel')}
                  <select
                    value={sort}
                    onChange={(e) => changeSort(e.target.value as SortOrder)}
                    className="cursor-pointer bg-transparent text-sm text-fg-primary outline-none"
                  >
                    <option value="near" className="bg-bg-surface">
                      {t('page.sort.near')}
                    </option>
                    <option value="name" className="bg-bg-surface">
                      {t('page.sort.name')}
                    </option>
                  </select>
                </label>
              </div>

              {visible.length > 0 ? (
                <ul
                  ref={listRef}
                  className="flex flex-col gap-3 px-4 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
                >
                  {visible.map((p) => {
                    const isSelected = p.slug === selectedSlug
                    const hours = hoursLine(p) ?? closedLine(p)
                    return (
                      <li key={p.id}>
                        <article
                          data-slug={p.slug}
                          className={cn(
                            CARD_SHELL,
                            'relative transition-colors duration-fast',
                            isSelected
                              ? 'border-amber-500 bg-bg-surface-2'
                              : 'border-border-subtle bg-bg-surface hover:border-border-strong',
                          )}
                        >
                          <CardHeader
                            squareClassName={CATEGORY_SQUARE_CLASS[p.category]}
                            label={t(`categories.${p.category}.one`)}
                            right={t('card.distance', { km: km(p.distanceKm) })}
                          />
                          <div className="grid grid-cols-[56px_1fr] gap-3.5 px-4 pt-1">
                            <CategoryThumb category={p.category} />
                            <div className="min-w-0">
                              <h2 className="font-display text-lg leading-tight">
                                <button
                                  type="button"
                                  aria-pressed={isSelected}
                                  onClick={() => select(p.slug)}
                                  className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-2xl"
                                >
                                  {p.name}
                                </button>
                              </h2>
                              <p className="mt-1 text-sm leading-snug text-fg-secondary">{p.summary}</p>
                            </div>
                          </div>
                          <FactList className="mx-4 mb-1.5 mt-2">
                            {p.city && (
                              <FactRow icon={MapPin} label={tc('facts.where')}>
                                {p.city}
                              </FactRow>
                            )}
                            {hours && (
                              <FactRow icon={Clock} label={tc('facts.openingHours')}>
                                {hours}
                              </FactRow>
                            )}
                            {p.operator && (
                              <FactRow icon={Building2} label={tc('facts.runBy')}>
                                {t(`operators.${p.operator}`)}
                              </FactRow>
                            )}
                          </FactList>
                          <CardFooter className="mt-auto flex-wrap gap-y-1.5">
                            <SourceBadge
                              hero={!!p.project}
                              label={p.project ? t('badges.hero') : t('badges.indie')}
                            />
                            {p.operatingStatus === 'temporarily_closed' && (
                              <ClosedBadge label={t('badges.temporarilyClosed')} />
                            )}
                            {p.project && p.project.stepsNeedingHelp > 0 && (
                              <span className="font-semibold text-amber-500">
                                {t('card.needsHelp')}
                              </span>
                            )}
                            <button
                              type="button"
                              data-open={p.slug}
                              onClick={() => openPlace(p.slug)}
                              className="relative z-[1] ml-auto cursor-pointer py-0.5 text-[13px] font-medium text-amber-500 hover:underline hover:underline-offset-4"
                            >
                              {p.hasProducts ? t('card.detailsAndPrices') : t('card.details')}
                            </button>
                          </CardFooter>
                        </article>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="mx-4 my-8 rounded-xl border border-dashed border-border-strong p-8 text-center sm:mx-6">
                  <h2 className="mb-2 font-display text-xl">{t('page.empty.title')}</h2>
                  <p className="mb-4 text-sm text-fg-secondary">{t('page.empty.body')}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={clearFilters} className={cn(BTN, BTN_SECONDARY)}>
                      {t('page.empty.clear')}
                    </button>
                    <Link href="/map/suggest" className={cn(BTN, BTN_SECONDARY)}>
                      <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                      {suggestLabel}
                    </Link>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mx-4 my-8 rounded-xl border border-dashed border-border-strong p-8 text-center sm:mx-6">
              <h2 className="mb-2 font-display text-xl">{t('page.start.title')}</h2>
              <p className="mb-4 text-sm text-fg-secondary">{t('page.start.body')}</p>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                className={cn(BTN, BTN_SECONDARY)}
              >
                {locating && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {locating ? t('page.locating') : t('page.useMyLocation')}
              </button>
            </div>
          )}

          <p className="mt-auto shrink-0 border-t border-border-subtle px-4 py-3 text-xs leading-relaxed text-fg-tertiary sm:px-6">
            {t('page.footnote')}{' '}
            {/* On a phone the bar above has no room for this link. */}
            <Link
              href="/map/suggest"
              className="font-medium text-fg-secondary underline underline-offset-2 md:hidden"
            >
              {suggestLabel}
            </Link>
          </p>

          {openSlug && (openDetail || openResult || loadingDetail || detailError) && (
            <PlacePanel
              key={openSlug}
              preview={
                openDetail
                  ? {
                      slug: openDetail.slug,
                      name: openDetail.name,
                      summary: openDetail.summary,
                      category: openDetail.category,
                      operator: openDetail.operator,
                      city: openDetail.city,
                      hero: !!openDetail.project,
                    }
                  : {
                      slug: openSlug,
                      name: openResult?.name ?? '',
                      summary: openResult?.summary ?? '',
                      category: openResult?.category ?? 'other',
                      operator: openResult?.operator ?? null,
                      city: openResult?.city ?? null,
                      hero: !!openResult?.project,
                    }
              }
              detail={openDetail}
              distanceKm={
                openResult
                  ? openResult.distanceKm
                  : openDetail && centre
                    ? haversineKm(centre, openDetail)
                    : null
              }
              loading={loadingDetail}
              error={detailError}
              nowMs={nowMs}
              onBack={closePlace}
            />
          )}
        </section>

        <section
          aria-label={t('page.mapLabel')}
          className="relative order-first h-[55vh] min-h-[340px] lg:order-none lg:h-auto lg:min-h-0"
        >
          <MapView
            className="absolute inset-0"
            view={centre ? { centre, radiusKm: radius } : null}
            fallback={fallback}
            pins={pins}
            // The open place stays highlighted while its details are shown.
            selectedId={openSlug ?? selected?.slug ?? null}
            // With the details panel open, clicking another pin switches the
            // panel to that place; otherwise it just selects it.
            onSelect={(slug) => (openSlug ? openPlace(slug) : select(slug, true))}
            you={local?.centre ?? null}
            onLocate={useMyLocation}
            locating={locating}
            labels={mapLabels}
            scrollSafe="narrow"
          >
            <div
              aria-label={t('page.legend.label')}
              className="absolute left-4 top-4 z-10 hidden items-center gap-4 rounded-full border border-border-default bg-bg-surface-2 px-3.5 py-2 text-xs text-fg-secondary shadow-md lg:flex"
            >
              <span className="inline-flex items-center gap-2">
                <i className="inline-block size-3 rotate-45 rounded-[3px] border-[1.5px] border-amber-900 bg-amber-500" aria-hidden />
                {t('page.legend.hero')}
              </span>
              <span className="inline-flex items-center gap-2">
                <i className="inline-block size-3 rounded-full border-[1.5px] border-[#152236] bg-[#F5F8FB]" aria-hidden />
                {t('page.legend.indie')}
              </span>
            </div>

            {selected && (
              <aside
                aria-live="polite"
                className={cn(
                  CARD_SHELL,
                  'absolute bottom-4 left-4 z-[11] max-h-[calc(100%-2rem)] w-[min(380px,calc(100%-2rem))] overflow-y-auto border-border-strong bg-bg-surface-2 shadow-lg',
                )}
              >
                <CardHeader
                  squareClassName={CATEGORY_SQUARE_CLASS[selected.category]}
                  label={t(`categories.${selected.category}.one`)}
                  right={t('card.distance', { km: km(selected.distanceKm) })}
                  className="shrink-0 pb-1.5 pt-3"
                >
                  <button
                    type="button"
                    onClick={() => select(null)}
                    aria-label={t('card.closeDetails')}
                    className="-my-1.5 -mr-2 ml-1 flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-hover-overlay-strong hover:text-fg-primary"
                  >
                    <X className="size-4" strokeWidth={2.5} />
                  </button>
                </CardHeader>
                <div className="shrink-0 px-4 pt-1">
                  <h2 className="font-display text-2xl leading-tight">{selected.name}</h2>
                  <p className="mt-2 text-sm leading-normal text-fg-secondary">{selected.summary}</p>
                </div>

                <FactList className="mx-4 mt-2.5 shrink-0">
                  <FactRow icon={MapPin} label={tc('facts.where')}>
                    {selected.approximate
                      ? t('card.area', { place: selected.city ?? selected.name })
                      : [selected.address, selected.city].filter(Boolean).join(', ')}
                  </FactRow>
                  {closedLine(selected) && (
                    <FactRow icon={Clock} label={tc('facts.openingHours')}>
                      {closedLine(selected)}
                    </FactRow>
                  )}
                  {hoursLine(selected) && (
                    <FactRow icon={Clock} label={tc('facts.openingHours')}>
                      {hoursLine(selected)}
                      {selected.openingNote && hoursLine(selected) !== selected.openingNote && (
                        <span className="block text-fg-tertiary">{selected.openingNote}</span>
                      )}
                    </FactRow>
                  )}
                  {selected.operator && (
                    <FactRow icon={Building2} label={tc('facts.runBy')}>
                      {t(`operators.${selected.operator}`)}
                    </FactRow>
                  )}
                  {selected.practicalNote && (
                    <FactRow icon={Info} label={tc('facts.goodToKnow')}>
                      {selected.practicalNote}
                    </FactRow>
                  )}
                  {selected.project && (
                    <FactRow icon={Users} label={tc('facts.people')}>
                      {t('card.joined', { count: selected.project.joined })}
                    </FactRow>
                  )}
                </FactList>

                <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3.5 pt-1.5">
                  {/* The main button always opens the details, whatever the kind of entry. */}
                  <button
                    type="button"
                    onClick={() => openPlace(selected.slug)}
                    className={cn(BTN, BTN_PRIMARY, 'cursor-pointer')}
                  >
                    {selected.hasProducts ? t('card.detailsAndPrices') : t('card.details')}
                  </button>
                  {selected.project && (
                    <Link
                      href={`/projects/${selected.project.id}`}
                      className={cn(BTN, BTN_SECONDARY_ON_POPUP)}
                    >
                      {t('card.viewProject')}
                    </Link>
                  )}
                  <a
                    href={directionsUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(BTN, BTN_SECONDARY_ON_POPUP)}
                  >
                    {t('card.directions')}
                  </a>
                  {selected.website && (
                    <a
                      href={selected.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className={cn(BTN, BTN_SECONDARY_ON_POPUP)}
                    >
                      {t('card.website')}
                    </a>
                  )}
                </div>
                <CardFooter className="shrink-0 flex-wrap gap-y-1.5">
                  <SourceBadge
                    hero={!!selected.project}
                    label={selected.project ? t('badges.hero') : t('badges.indie')}
                  />
                  {selected.operatingStatus === 'temporarily_closed' && (
                    <ClosedBadge label={t('badges.temporarilyClosed')} />
                  )}
                  {selected.project ? (
                    selected.project.stepsNeedingHelp > 0 && (
                      <span className="font-semibold text-amber-500">{t('card.needsHelp')}</span>
                    )
                  ) : (
                    <span>{t('card.fineIndieShort')}</span>
                  )}
                  <Link
                    href={`/map/${selected.slug}/suggest`}
                    className="ml-auto text-fg-secondary underline underline-offset-2"
                  >
                    {t('card.suggestEdit')}
                  </Link>
                </CardFooter>
              </aside>
            )}
          </MapView>
        </section>
      </div>
    </div>
  )
}
