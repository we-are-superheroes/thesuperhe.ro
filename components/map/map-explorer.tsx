'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Clock, Info, Loader2, MapPin, Plus, Search, Users, X } from 'lucide-react'
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
  PLACE_CATEGORIES,
  PLACE_OPERATORS,
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
import type { MapPin as MapPinData } from '@/components/map/map-canvas'
import {
  CategoryIcon,
  CategoryThumb,
  ClosedBadge,
  OperatorBadge,
  SourceBadge,
  openStateLabel,
} from '@/components/map/place-bits'

/* ================================================================
   MapExplorer — the public /map page: search, filters, result list
   and map, kept in step with each other.

   The server sends every place within the largest search radius of
   the chosen centre. Category, source, text, distance and sorting
   are then applied here in the browser, so nothing waits on the
   network. Choosing another town reloads from the server (the centre
   lives in the URL); "use my location" loads through a server action
   and deliberately stays out of the URL.

   The list is the accessible equivalent of the map: it works without
   WebGL and for screen readers.
   ================================================================ */

export type SourceFilter = 'all' | 'hero' | 'indie'
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

const FIELD =
  'flex h-[42px] items-center gap-2 rounded-lg border border-border-default bg-bg-input px-3 transition-colors duration-fast focus-within:border-amber-500 focus-within:shadow-[0_0_0_3px_var(--focus-ring)]'
// The whole field lights up when its text box has focus (FIELD's
// focus-within styles), so the text box must not draw a ring of its own.
// `!` is needed: the site-wide `:focus-visible` outline in globals.css is
// outside Tailwind's layers and would otherwise win over `outline-none`.
const FIELD_INPUT =
  'h-full min-w-0 bg-transparent text-sm text-fg-primary outline-none! placeholder:text-fg-tertiary'
const CHIP =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-fg-secondary transition-colors duration-fast hover:border-border-strong hover:text-fg-primary aria-pressed:border-brand-accent aria-pressed:bg-brand-accent aria-pressed:font-medium aria-pressed:text-fg-on-accent'
const BTN =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-fast'
const BTN_PRIMARY = 'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover'
const BTN_SECONDARY =
  'border-border-default bg-bg-surface-2 text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'

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
    if (slug && fromMap) {
      listRef.current
        ?.querySelector(`[data-slug="${CSS.escape(slug)}"]`)
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
        className="shrink-0 border-b border-border-subtle bg-bg-base px-4 pb-3 pt-4 sm:px-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn(FIELD, 'min-w-0 flex-[1_1_260px]')}>
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

          <form onSubmit={searchWhere} className={cn(FIELD, 'min-w-0 flex-[0_1_300px]')}>
            <MapPin className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
            <label htmlFor="map-where" className="sr-only">
              {t('page.whereLabel')}
            </label>
            <input
              id="map-where"
              type="text"
              value={whereText}
              onChange={(e) => setWhereText(e.target.value)}
              placeholder={t('page.wherePlaceholder')}
              autoComplete="off"
              enterKeyHint="search"
              className={cn(FIELD_INPUT, 'w-full flex-1')}
            />
            <button
              type="submit"
              disabled={searching}
              aria-label={searching ? t('page.whereSearching') : t('page.whereSearch')}
              title={t('page.whereSearch')}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-hover-overlay-strong hover:text-fg-primary"
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </button>
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
          </form>

          <div
            role="group"
            aria-label={t('page.showLabel')}
            className="inline-flex rounded-lg border border-border-default bg-bg-surface p-[3px]"
          >
            {(['all', 'hero', 'indie'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => changeSource(value)}
                className="cursor-pointer rounded-[3px] px-3 py-1.5 text-sm text-fg-secondary transition-colors hover:text-fg-primary aria-pressed:bg-bg-surface-3 aria-pressed:font-medium aria-pressed:text-fg-primary"
              >
                {t(`page.source.${value}`)}
              </button>
            ))}
          </div>

          <span className="hidden flex-1 xl:block" />
          <Link href="/map/suggest" className={cn(BTN, BTN_SECONDARY)}>
            <Plus className="size-4" strokeWidth={2.5} aria-hidden />
            {suggestLabel}
          </Link>
        </div>

        {/* Town lookup: several matches, or none */}
        {(hits || whereError) && (
          <div className="mt-3 text-sm" role="status">
            {whereError && <p className="text-red-300">{whereError}</p>}
            {hits && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-secondary">{t('page.whereChoose')}</span>
                {hits.map((hit) => (
                  <button
                    key={`${hit.lat},${hit.lng}`}
                    type="button"
                    onClick={() => goToHit(hit)}
                    className={CHIP}
                  >
                    <span className="font-medium text-fg-primary">{hit.name}</span>
                    {hit.context && <span>{hit.context}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          role="group"
          aria-label={t('page.categoriesLabel')}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            aria-pressed={categories.length === 0}
            onClick={() => toggleCategory(null)}
            className={CHIP}
          >
            {t('page.allCategories')}
          </button>
          {PLACE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={categories.includes(category)}
              onClick={() => toggleCategory(category)}
              className={CHIP}
            >
              <CategoryIcon category={category} className="size-3.5" />
              {t(`categories.${category}.many`)}
            </button>
          ))}
        </div>

        {/* Who runs the place. The visible label doubles as the group's name. */}
        <div
          role="group"
          aria-labelledby="map-operators-label"
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <span id="map-operators-label" className="text-sm text-fg-tertiary">
            {t('page.operatorsLabel')}
          </span>
          <button
            type="button"
            aria-pressed={operators.length === 0}
            onClick={() => toggleOperator(null)}
            className={CHIP}
          >
            {t('page.allOperators')}
          </button>
          {PLACE_OPERATORS.map((operator) => (
            <button
              key={operator}
              type="button"
              aria-pressed={operators.includes(operator)}
              onClick={() => toggleOperator(operator)}
              className={CHIP}
            >
              {t(`operators.${operator}`)}
            </button>
          ))}
        </div>
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
                    const hours = hoursLine(p)
                    return (
                      <li key={p.id}>
                        <article
                          data-slug={p.slug}
                          className={cn(
                            'relative grid grid-cols-[56px_1fr] gap-4 rounded-xl border bg-bg-surface p-4 transition-colors duration-fast',
                            isSelected
                              ? 'border-amber-500 bg-bg-surface-2'
                              : 'border-border-subtle hover:border-border-strong',
                          )}
                        >
                          <CategoryThumb category={p.category} />
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <SourceBadge
                                hero={!!p.project}
                                label={p.project ? t('badges.hero') : t('badges.indie')}
                              />
                              {p.operatingStatus === 'temporarily_closed' && (
                                <ClosedBadge label={t('badges.temporarilyClosed')} />
                              )}
                              <span className="text-xs text-fg-tertiary">
                                {t(`categories.${p.category}.one`)}
                              </span>
                              {p.operator && (
                                <OperatorBadge
                                  label={t('badges.runBy', {
                                    operator: t(`operators.${p.operator}`),
                                  })}
                                />
                              )}
                            </div>
                            <h2 className="font-display text-lg leading-tight">
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => select(p.slug)}
                                className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-xl"
                              >
                                {p.name}
                              </button>
                            </h2>
                            <p className="mt-1 text-sm leading-snug text-fg-secondary">{p.summary}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-tertiary">
                              <span className="font-medium text-fg-secondary">
                                {t('card.distance', { km: km(p.distanceKm) })}
                              </span>
                              {p.city && <span>{p.city}</span>}
                              {p.project && p.project.stepsNeedingHelp > 0 ? (
                                <span className="font-semibold text-amber-500">
                                  {t('card.stepsNeedHelp', { count: p.project.stepsNeedingHelp })}
                                </span>
                              ) : (
                                (hours ?? closedLine(p)) && <span>{hours ?? closedLine(p)}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              data-open={p.slug}
                              onClick={() => openPlace(p.slug)}
                              className="relative z-[1] mt-2 cursor-pointer py-0.5 text-sm font-medium text-amber-500 hover:underline hover:underline-offset-4"
                            >
                              {p.hasProducts ? t('card.detailsAndPrices') : t('card.details')}{' '}
                              <span aria-hidden>→</span>
                            </button>
                          </div>
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
            {t('page.footnote')}
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
                className="absolute bottom-4 left-4 z-[11] max-h-[calc(100%-2rem)] w-[min(380px,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-border-strong bg-bg-surface-2 p-5 shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => select(null)}
                  aria-label={t('card.closeDetails')}
                  className="absolute right-2.5 top-2.5 flex size-[30px] cursor-pointer items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-hover-overlay-strong hover:text-fg-primary"
                >
                  <X className="size-4" strokeWidth={2.5} />
                </button>
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <SourceBadge
                    hero={!!selected.project}
                    label={selected.project ? t('badges.hero') : t('badges.indie')}
                  />
                  {selected.operatingStatus === 'temporarily_closed' && (
                    <ClosedBadge label={t('badges.temporarilyClosed')} />
                  )}
                  <span className="text-xs text-fg-tertiary">
                    {t(`categories.${selected.category}.one`)}
                  </span>
                  {selected.operator && (
                    <OperatorBadge
                      label={t('badges.runBy', { operator: t(`operators.${selected.operator}`) })}
                    />
                  )}
                </div>
                <h2 className="my-2 pr-7 font-display text-2xl leading-tight">{selected.name}</h2>
                <p className="text-sm leading-relaxed text-fg-secondary">{selected.summary}</p>

                <div className="my-4 grid gap-2 text-sm text-fg-secondary">
                  <DetailRow icon={<MapPin className="size-4" />}>
                    {[
                      selected.approximate
                        ? t('card.area', { place: selected.city ?? selected.name })
                        : [selected.address, selected.city].filter(Boolean).join(', '),
                      t('card.kmAway', { km: km(selected.distanceKm) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </DetailRow>
                  {closedLine(selected) && (
                    <DetailRow icon={<Clock className="size-4" />}>{closedLine(selected)}</DetailRow>
                  )}
                  {hoursLine(selected) && (
                    <DetailRow icon={<Clock className="size-4" />}>
                      {hoursLine(selected)}
                      {selected.openingNote && hoursLine(selected) !== selected.openingNote && (
                        <span className="block text-fg-tertiary">{selected.openingNote}</span>
                      )}
                    </DetailRow>
                  )}
                  {selected.practicalNote && (
                    <DetailRow icon={<Info className="size-4" />}>{selected.practicalNote}</DetailRow>
                  )}
                  {selected.project && (
                    <DetailRow icon={<Users className="size-4" />}>
                      {[
                        t('card.joined', { count: selected.project.joined }),
                        selected.project.stepsNeedingHelp > 0
                          ? t('card.stepsNeedHelp', { count: selected.project.stepsNeedingHelp })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </DetailRow>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* The main button always opens the details, whatever the kind of entry. */}
                  <button
                    type="button"
                    onClick={() => openPlace(selected.slug)}
                    className={cn(BTN, BTN_PRIMARY, 'cursor-pointer')}
                  >
                    {selected.hasProducts ? t('card.detailsAndPrices') : t('card.details')}
                  </button>
                  {selected.project && (
                    <Link href={`/projects/${selected.project.id}`} className={cn(BTN, BTN_SECONDARY)}>
                      {t('card.viewProject')}
                    </Link>
                  )}
                  <a
                    href={directionsUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(BTN, BTN_SECONDARY)}
                  >
                    {t('card.directions')}
                  </a>
                  {!selected.project && selected.website && (
                    <a
                      href={selected.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className={cn(BTN, BTN_SECONDARY)}
                    >
                      {t('card.website')}
                    </a>
                  )}
                </div>
                <p className="mt-3 text-xs text-fg-tertiary">
                  {selected.project ? t('card.fineHero') : t('card.fineIndie')}{' '}
                  <Link
                    href={`/map/${selected.slug}/suggest`}
                    className="text-fg-secondary underline underline-offset-2"
                  >
                    {t('card.suggestEdit')}
                  </Link>
                </p>
              </aside>
            )}
          </MapView>
        </section>
      </div>
    </div>
  )
}

function DetailRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[18px_1fr] items-start gap-3">
      <span className="mt-0.5 text-fg-tertiary" aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </div>
  )
}
