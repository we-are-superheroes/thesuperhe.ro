'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { geocodeAction } from '@/app/(public)/map/actions'
import {
  nearbyPlacesAction,
  removePlaceAction,
  submitPlaceAction,
} from '@/app/(platform)/map/actions'
import type { GeocodeHit } from '@/lib/geocode'
import { LOCALE_NAMES, SUPPORTED_LOCALES } from '@/lib/locale-shared'
import { dateForMonth, type OpeningHours, type Weekday } from '@/lib/opening-hours'
import {
  COMMON_CURRENCIES,
  OPERATING_STATUSES,
  PLACE_CATEGORIES,
  PLACE_LIMITS,
  currencyForCountry,
  looksLikeDuplicate,
  minorToInput,
  parsePriceToMinor,
  roundCoordinate,
  type LatLng,
  type OperatingStatus,
  type PlaceCategory,
  type PlaceFormValues,
} from '@/lib/places-shared'
import {
  Card,
  CardHead,
  CountrySelect,
  Field,
  SelectBox,
} from '@/components/platform/project-form-bits'
import { MapView } from '@/components/map/map-loader'
import { useMapLabels } from '@/components/map/use-map-labels'
import type { MapView as MapViewport } from '@/components/map/map-canvas'
import { weekdayName } from '@/components/map/place-bits'

/* ================================================================
   PlaceForm — one form for every way a place is added or changed:

     direct   curators, admins, and the lead of a Superhero project
              editing that project's place: saved and live at once
     propose  any other member: saved as a suggestion for a curator
     review   a curator correcting a member's suggestion before
              approving it

   The server decides which of these really applies (submitPlaceAction
   checks the role again); `mode` only chooses the wording.
   ================================================================ */

export type PlaceFormMode = 'direct' | 'propose' | 'review'

export interface PlaceFormProps {
  mode: PlaceFormMode
  /** Existing place being changed. */
  place?: { id: string; slug: string; name: string }
  /** New place for this Superhero project. */
  project?: { id: string; title: string }
  /** Review mode: the suggestion being decided. */
  proposalId?: string
  initial: PlaceFormValues
  /** Where the pin-picker map looks before a pin is placed. */
  startView: MapViewport
  /** Where "Cancel" goes. */
  backHref: string
}

const INPUT =
  'w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 font-sans text-sm text-fg-primary outline-none transition-all duration-fast placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]'
const TOGGLE =
  'cursor-pointer rounded-lg border border-neutral-700 bg-bg-surface-2 px-3 py-1.5 text-sm text-fg-secondary transition-colors duration-fast hover:text-fg-primary aria-pressed:border-brand-accent aria-pressed:bg-brand-accent aria-pressed:font-medium aria-pressed:text-fg-on-accent'
const BTN =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60'
const BTN_PRIMARY = 'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover'
const BTN_SECONDARY =
  'border-border-default bg-bg-surface-2 text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'
const BTN_DANGER = 'border-red-500/50 bg-transparent text-red-300 hover:bg-red-500/[0.12]'

type HoursMode = 'none' | 'always' | 'weekly' | 'text'

interface PeriodRow {
  key: string
  days: Weekday[]
  from: string
  to: string
  seasonal: boolean
  months: number[]
}

interface ProductRow {
  key: string
  name: string
  group: string
  price: string
  unit: string
  note: string
  available: boolean
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

let rowCounter = 0
const newKey = () => `row-${++rowCounter}`

function blankPeriod(): PeriodRow {
  return { key: newKey(), days: [], from: '09:00', to: '17:00', seasonal: false, months: [] }
}

function periodsFrom(hours: OpeningHours | null): PeriodRow[] {
  if (!hours || hours.mode !== 'weekly') return [blankPeriod()]
  return hours.periods.map((period) => ({
    key: newKey(),
    days: period.days,
    from: period.from,
    to: period.to,
    seasonal: !!period.months,
    months: period.months ?? [],
  }))
}

function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function PlaceForm({
  mode,
  place,
  project,
  proposalId,
  initial,
  startView,
  backHref,
}: PlaceFormProps) {
  const t = useTranslations('map')
  const locale = useLocale()
  const router = useRouter()
  const mapLabels = useMapLabels()

  /* ── Field state ──────────────────────────────────────────────────── */
  const [name, setName] = useState(initial.name)
  const [summary, setSummary] = useState(initial.summary)
  const [description, setDescription] = useState(initial.description ?? '')
  const [category, setCategory] = useState<PlaceCategory | ''>(initial.category)
  const [language, setLanguage] = useState(initial.language ?? '')

  const [position, setPosition] = useState<LatLng | null>(
    initial.latitude !== null && initial.longitude !== null
      ? { lat: initial.latitude, lng: initial.longitude }
      : null,
  )
  // The map only re-centres when an address is found — not on every click,
  // which would yank the view away while someone is fine-tuning the pin.
  const [mapViewport, setMapViewport] = useState<MapViewport>(startView)
  const [address, setAddress] = useState(initial.address ?? '')
  const [city, setCity] = useState(initial.city ?? '')
  const [country, setCountry] = useState<string | null>(initial.country)
  const [approximate, setApproximate] = useState(initial.locationApproximate)

  const [hoursMode, setHoursMode] = useState<HoursMode>(initial.openingHours?.mode ?? 'none')
  const [periods, setPeriods] = useState<PeriodRow[]>(() => periodsFrom(initial.openingHours))
  const [openingNote, setOpeningNote] = useState(initial.openingNote ?? '')

  const [status, setStatus] = useState<OperatingStatus>(initial.operatingStatus)
  const [statusNote, setStatusNote] = useState(initial.statusNote ?? '')
  const [reopensOn, setReopensOn] = useState(initial.reopensOn ?? '')

  const [practicalNote, setPracticalNote] = useState(initial.practicalNote ?? '')
  const [website, setWebsite] = useState(initial.website ?? '')
  const [contact, setContact] = useState(initial.contact ?? '')

  const [currency, setCurrency] = useState(initial.currency)
  const [products, setProducts] = useState<ProductRow[]>(() =>
    initial.products.map((product) => ({
      key: newKey(),
      name: product.name,
      group: product.group ?? '',
      price: product.priceMinor !== null ? minorToInput(product.priceMinor, initial.currency) : '',
      unit: product.unit ?? '',
      note: product.note ?? '',
      available: product.available,
    })),
  )
  const [note, setNote] = useState('')

  /* ── Address lookup + duplicates ──────────────────────────────────── */
  const [findText, setFindText] = useState('')
  const [hits, setHits] = useState<GeocodeHit[] | null>(null)
  const [finding, startFind] = useTransition()
  const [nearby, setNearby] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>([])
  const [, startNearby] = useTransition()

  const movePin = (next: LatLng) => {
    const rounded = { lat: roundCoordinate(next.lat), lng: roundCoordinate(next.lng) }
    setPosition(rounded)
    // Look for places already on the map right here (a likely duplicate).
    startNearby(async () => {
      const result = await nearbyPlacesAction(rounded)
      setNearby(result.success ? result.data.filter((p) => p.id !== place?.id) : [])
    })
  }

  const find = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const text = findText.trim()
    if (text.length < 2) return
    startFind(async () => {
      const result = await geocodeAction(text, position ?? startView.centre)
      setHits(result.success ? result.data : [])
    })
  }

  const pickHit = (hit: GeocodeHit) => {
    setHits(null)
    movePin({ lat: hit.lat, lng: hit.lng })
    setMapViewport({ centre: { lat: hit.lat, lng: hit.lng }, zoom: hit.street ? 17 : 14 })
    // Fill in what the lookup knows, without overwriting what was typed.
    if (!address && hit.street) setAddress(hit.street)
    if (!city && hit.city) setCity(hit.city)
    if (!country && hit.country) {
      setCountry(hit.country)
      if (products.length === 0) setCurrency(currencyForCountry(hit.country))
    }
  }

  const duplicate = useMemo(() => {
    if (!position) return null
    const probe = { name: name || '—', lat: position.lat, lng: position.lng }
    return nearby.find((other) => looksLikeDuplicate(probe, other)) ?? null
  }, [position, name, nearby])

  /* ── Submit ───────────────────────────────────────────────────────── */
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'pending' | null>(null)
  const [saving, startSave] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!position) {
      setError(t('form.pinMissing'))
      return
    }

    const productData = []
    for (const row of products) {
      // A fully empty row is just an unused line.
      if (!row.name.trim() && !row.price.trim() && !row.unit.trim() && !row.note.trim() && !row.group.trim()) continue
      let priceMinor: number | null = null
      if (row.price.trim()) {
        priceMinor = parsePriceToMinor(row.price, currency)
        if (priceMinor === null) {
          setError(t('form.product.priceInvalid'))
          return
        }
      }
      productData.push({
        name: row.name,
        group: row.group,
        note: row.note,
        unit: row.unit,
        priceMinor,
        available: row.available,
      })
    }

    const openingHours =
      hoursMode === 'none'
        ? null
        : hoursMode === 'weekly'
          ? {
              mode: 'weekly',
              periods: periods.map((period) => ({
                days: period.days,
                from: period.from,
                to: period.to,
                ...(period.seasonal && period.months.length > 0 ? { months: period.months } : {}),
              })),
            }
          : { mode: hoursMode }

    const data = {
      name,
      summary,
      description,
      language,
      category,
      latitude: position.lat,
      longitude: position.lng,
      locationApproximate: approximate,
      address,
      city,
      country,
      website,
      contact,
      practicalNote,
      openingHours,
      openingNote,
      operatingStatus: status,
      statusNote,
      reopensOn,
      currency,
      products: productData,
    }

    startSave(async () => {
      const result = await submitPlaceAction({
        placeId: mode === 'review' ? undefined : place?.id,
        projectId: project?.id,
        proposalId,
        data,
        note,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      if (result.data.outcome === 'pending') {
        setDone('pending')
        window.scrollTo({ top: 0 })
      } else if (result.data.outcome === 'unchanged') {
        setError(t('form.unchanged'))
      } else if (mode === 'review') {
        router.push('/admin/places')
      } else {
        router.push(`/map/${result.data.slug}`)
      }
    })
  }

  /* ── Remove ───────────────────────────────────────────────────────── */
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeReason, setRemoveReason] = useState('')
  const [removeMessage, setRemoveMessage] = useState<string | null>(null)
  const [removing, startRemove] = useTransition()

  const remove = () => {
    if (!place) return
    setError(null)
    startRemove(async () => {
      const result = await removePlaceAction(place.id, removeReason)
      if (!result.success) {
        setError(result.error)
        return
      }
      if (result.data.outcome === 'removed') {
        router.push('/map')
      } else {
        setRemoveOpen(false)
        setRemoveMessage(t('form.remove.pending'))
      }
    })
  }

  /* ── Wording ──────────────────────────────────────────────────────── */
  const heading =
    mode === 'review'
      ? t('form.titleReview')
      : project && !place
        ? t('form.titleProject', { name: project.title })
        : place
          ? mode === 'direct'
            ? t('form.titleEdit', { name: place.name })
            : t('form.titleSuggestEdit', { name: place.name })
          : mode === 'direct'
            ? t('form.titleAdd')
            : t('form.titleSuggest')
  const intro =
    mode === 'review'
      ? t('form.introReview')
      : project && !place
        ? t('form.introProject')
        : mode === 'direct'
          ? t('form.introDirect')
          : t('form.introSuggest')
  const submitLabel =
    mode === 'review'
      ? t('form.submitApprove')
      : mode === 'propose'
        ? t('form.submitSuggest')
        : place
          ? t('form.submitSave')
          : t('form.submitPublish')

  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
    [locale],
  )
  const updatePeriod = (key: string, patch: Partial<PeriodRow>) =>
    setPeriods((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const updateProduct = (key: string, patch: Partial<ProductRow>) =>
    setProducts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const currencies = (COMMON_CURRENCIES as readonly string[]).includes(currency)
    ? COMMON_CURRENCIES
    : [currency, ...COMMON_CURRENCIES]

  /* ── Thank-you state for suggestions ──────────────────────────────── */
  if (done === 'pending') {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-surface p-8 text-center">
        <h1 className="font-display text-2xl leading-tight">{t('form.pending.title')}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-fg-secondary">{t('form.pending.body')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/map" className={cn(BTN, BTN_PRIMARY)}>
            {t('form.pending.back')}
          </Link>
          {/* The page keys the form on `n`, so this always opens an empty one. */}
          <button
            type="button"
            onClick={() => router.push(`/map/suggest?n=${Date.now()}`)}
            className={cn(BTN, BTN_SECONDARY)}
          >
            {t('form.pending.another')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <header>
        <h1 className="mb-3 font-display text-[clamp(28px,4vw,44px)] font-normal leading-none tracking-tight">
          {heading}
        </h1>
        <p className="max-w-[620px] text-base leading-relaxed text-fg-secondary">{intro}</p>
      </header>

      {/* ── Basics ─────────────────────────────────────────────────── */}
      <Card>
        <CardHead
          eyebrow={t('form.sections.basics.eyebrow')}
          title={t('form.sections.basics.title')}
        />
        <div className="flex flex-col gap-5">
          <Field label={t('fields.name')} htmlFor="pl-name">
            <input
              id="pl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('form.namePlaceholder')}
              maxLength={PLACE_LIMITS.name}
              required
              className={INPUT}
            />
          </Field>
          <Field label={t('fields.summary')} htmlFor="pl-summary" help={t('form.summaryHelp')}>
            <textarea
              id="pl-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={PLACE_LIMITS.summary}
              rows={2}
              required
              className={INPUT}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label={t('fields.category')} htmlFor="pl-category">
              <SelectBox
                id="pl-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PlaceCategory | '')}
                required
              >
                <option value="" disabled>
                  {t('form.categoryPlaceholder')}
                </option>
                {PLACE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`categories.${value}.one`)}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Field label={t('fields.language')} htmlFor="pl-language">
              <SelectBox id="pl-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="">{t('form.languageAny')}</option>
                {/* The languages the site itself is offered in. */}
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_NAMES[code]}
                  </option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <Field
            label={t('fields.description')}
            htmlFor="pl-description"
            help={t('form.descriptionHelp')}
          >
            <textarea
              id="pl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={PLACE_LIMITS.description}
              rows={5}
              className={INPUT}
            />
          </Field>
        </div>
      </Card>

      {/* ── Where ──────────────────────────────────────────────────── */}
      <Card>
        <CardHead
          eyebrow={t('form.sections.where.eyebrow')}
          title={t('form.sections.where.title')}
          desc={t('form.sections.where.desc')}
        />
        <div className="flex flex-col gap-5">
          <Field label={t('form.findAddressLabel')} htmlFor="pl-find">
            {/* Not a nested <form>: Enter is handled on the input instead. */}
            <div className="flex gap-2">
              <input
                id="pl-find"
                type="text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') find(e)
                }}
                placeholder={t('form.findAddressPlaceholder')}
                enterKeyHint="search"
                autoComplete="off"
                className={INPUT}
              />
              <button type="button" onClick={find} disabled={finding} className={cn(BTN, BTN_SECONDARY)}>
                {finding ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="size-4" aria-hidden />
                )}
                {finding ? t('form.finding') : t('form.find')}
              </button>
            </div>
          </Field>
          {hits && (
            <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
              {hits.length === 0 ? (
                <p className="text-fg-secondary">{t('form.findNoMatch')}</p>
              ) : (
                hits.map((hit) => (
                  <button
                    key={`${hit.lat},${hit.lng}`}
                    type="button"
                    onClick={() => pickHit(hit)}
                    className={cn(TOGGLE, 'text-left')}
                  >
                    <span className="font-medium text-fg-primary">{hit.name}</span>
                    {hit.context && <span className="ml-1.5">{hit.context}</span>}
                  </button>
                ))
              )}
            </div>
          )}

          <div>
            <div className="relative h-[340px] overflow-hidden rounded-xl border border-neutral-700">
              <MapView
                className="absolute inset-0"
                view={mapViewport}
                picker={{ value: position, onChange: movePin }}
                labels={{ ...mapLabels, locate: undefined, unavailable: t('form.mapUnavailable') }}
                scrollSafe="always"
              />
            </div>
            <p className="mt-2 text-xs text-fg-tertiary" aria-live="polite">
              {position
                ? t('form.pinPlaced', {
                    lat: position.lat.toFixed(5),
                    lng: position.lng.toFixed(5),
                  })
                : t('form.pinHint')}
            </p>
            {duplicate && (
              <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-sm text-fg-primary">
                {t('form.duplicateWarning', { name: duplicate.name })}
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={approximate}
              onChange={(e) => setApproximate(e.target.checked)}
              className="mt-0.5 size-4 accent-amber-500"
            />
            <span>
              <span className="font-medium text-fg-primary">{t('form.approximateLabel')}</span>
              <span className="block text-xs text-fg-tertiary">{t('form.approximateHelp')}</span>
            </span>
          </label>

          {!approximate && (
            <Field label={t('fields.address')} htmlFor="pl-address" help={t('form.addressHelp')}>
              <input
                id="pl-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={PLACE_LIMITS.address}
                className={INPUT}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label={t('fields.city')} htmlFor="pl-city">
              <input
                id="pl-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={PLACE_LIMITS.city}
                className={INPUT}
              />
            </Field>
            <Field label={t('fields.country')} htmlFor="pl-country">
              <CountrySelect id="pl-country" value={country} onChange={setCountry} />
            </Field>
          </div>
        </div>
      </Card>

      {/* ── Opening times ──────────────────────────────────────────── */}
      <Card>
        <CardHead
          eyebrow={t('form.sections.hours.eyebrow')}
          title={t('form.sections.hours.title')}
        />
        <div className="flex flex-col gap-5">
          <div role="group" aria-label={t('fields.openingHours')} className="flex flex-wrap gap-2">
            {(['none', 'always', 'weekly', 'text'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={hoursMode === value}
                onClick={() => setHoursMode(value)}
                className={TOGGLE}
              >
                {t(`form.hoursMode.${value}`)}
              </button>
            ))}
          </div>

          {hoursMode === 'weekly' && (
            <div className="flex flex-col gap-4">
              {periods.map((period, index) => {
                const overnight = period.to <= period.from
                return (
                  <fieldset
                    key={period.key}
                    className="rounded-xl border border-neutral-700 bg-bg-surface-2/50 p-4"
                  >
                    <legend className="sr-only">{t('form.periodLabel', { number: index + 1 })}</legend>
                    <div
                      role="group"
                      aria-label={t('form.daysLabel')}
                      className="flex flex-wrap gap-1.5"
                    >
                      {WEEKDAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={period.days.includes(day)}
                          aria-label={weekdayName(day, locale)}
                          onClick={() =>
                            updatePeriod(period.key, {
                              days: toggled(period.days, day).sort((a, b) => a - b),
                            })
                          }
                          className={cn(TOGGLE, 'min-w-12 px-2 text-center')}
                        >
                          {weekdayName(day, locale, 'short')}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs font-medium text-fg-secondary">
                        {t('form.fromLabel')}
                        <input
                          type="time"
                          value={period.from}
                          onChange={(e) => updatePeriod(period.key, { from: e.target.value })}
                          className={cn(INPUT, 'w-32')}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium text-fg-secondary">
                        {t('form.toLabel')}
                        <input
                          type="time"
                          value={period.to}
                          onChange={(e) => updatePeriod(period.key, { to: e.target.value })}
                          className={cn(INPUT, 'w-32')}
                        />
                      </label>
                      {overnight && period.from && period.to && (
                        <span className="pb-3 text-xs text-fg-tertiary">{t('form.overnightHint')}</span>
                      )}
                      <span className="flex-1" />
                      {periods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPeriods((rows) => rows.filter((row) => row.key !== period.key))}
                          aria-label={t('form.removePeriod')}
                          title={t('form.removePeriod')}
                          className="mb-1 flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-hover-overlay-strong hover:text-red-300"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-fg-secondary">
                      <input
                        type="checkbox"
                        checked={period.seasonal}
                        onChange={(e) => updatePeriod(period.key, { seasonal: e.target.checked })}
                        className="size-4 accent-amber-500"
                      />
                      {t('form.seasonalLabel')}
                    </label>
                    {period.seasonal && (
                      <div
                        role="group"
                        aria-label={t('form.monthsLabel')}
                        className="mt-2 flex flex-wrap gap-1.5"
                      >
                        {MONTHS.map((month) => (
                          <button
                            key={month}
                            type="button"
                            aria-pressed={period.months.includes(month)}
                            onClick={() =>
                              updatePeriod(period.key, {
                                months: toggled(period.months, month).sort((a, b) => a - b),
                              })
                            }
                            className={cn(TOGGLE, 'min-w-12 px-2 text-center')}
                          >
                            {monthFormat.format(dateForMonth(month))}
                          </button>
                        ))}
                      </div>
                    )}
                  </fieldset>
                )
              })}
              <button
                type="button"
                onClick={() => setPeriods((rows) => [...rows, blankPeriod()])}
                className={cn(BTN, BTN_SECONDARY, 'self-start')}
              >
                <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                {t('form.addPeriod')}
              </button>
            </div>
          )}

          <Field
            label={t('fields.openingNote')}
            htmlFor="pl-opening-note"
            help={
              hoursMode === 'text' ? t('form.openingNoteRequiredHelp') : t('form.openingNoteHelp')
            }
          >
            <textarea
              id="pl-opening-note"
              value={openingNote}
              onChange={(e) => setOpeningNote(e.target.value)}
              maxLength={PLACE_LIMITS.note}
              rows={2}
              className={INPUT}
            />
          </Field>
        </div>
      </Card>

      {/* ── Open status — only meaningful once a place exists ──────── */}
      {(place || mode === 'review') && (
        <Card>
          <CardHead
            eyebrow={t('form.sections.status.eyebrow')}
            title={t('form.sections.status.title')}
          />
          <div className="flex flex-col gap-5">
            <div role="group" aria-label={t('fields.operatingStatus')} className="flex flex-wrap gap-2">
              {OPERATING_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                  className={TOGGLE}
                >
                  {t(`status.${value}`)}
                </button>
              ))}
            </div>
            {status !== 'active' && (
              <Field label={t('fields.statusNote')} htmlFor="pl-status-note" help={t('form.statusNoteHelp')}>
                <input
                  id="pl-status-note"
                  type="text"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  maxLength={PLACE_LIMITS.note}
                  className={INPUT}
                />
              </Field>
            )}
            {status === 'temporarily_closed' && (
              <Field label={t('fields.reopensOn')} htmlFor="pl-reopens" help={t('form.reopensOnHelp')}>
                <input
                  id="pl-reopens"
                  type="date"
                  value={reopensOn}
                  onChange={(e) => setReopensOn(e.target.value)}
                  className={cn(INPUT, 'w-48')}
                />
              </Field>
            )}
          </div>
        </Card>
      )}

      {/* ── Details ────────────────────────────────────────────────── */}
      <Card>
        <CardHead
          eyebrow={t('form.sections.practical.eyebrow')}
          title={t('form.sections.practical.title')}
        />
        <div className="flex flex-col gap-5">
          <Field label={t('fields.practicalNote')} htmlFor="pl-practical">
            <textarea
              id="pl-practical"
              value={practicalNote}
              onChange={(e) => setPracticalNote(e.target.value)}
              placeholder={t('form.practicalNotePlaceholder')}
              maxLength={PLACE_LIMITS.note}
              rows={2}
              className={INPUT}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label={t('fields.website')} htmlFor="pl-website">
              <input
                id="pl-website"
                type="url"
                inputMode="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t('form.websitePlaceholder')}
                maxLength={PLACE_LIMITS.website}
                className={INPUT}
              />
            </Field>
            <Field label={t('fields.contact')} htmlFor="pl-contact" help={t('form.contactHelp')}>
              <input
                id="pl-contact"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={PLACE_LIMITS.contact}
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* ── Price list ─────────────────────────────────────────────── */}
      <Card>
        <CardHead
          eyebrow={t('form.sections.prices.eyebrow')}
          title={t('form.sections.prices.title')}
          desc={t('form.sections.prices.desc')}
        />
        <div className="flex flex-col gap-4">
          {products.length > 0 && (
            <div className="max-w-56">
              <Field label={t('fields.currency')} htmlFor="pl-currency" help={t('form.currencyHelp')}>
                <SelectBox id="pl-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </SelectBox>
              </Field>
            </div>
          )}
          {products.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-700 bg-bg-surface-2/50 p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
            >
              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-fg-secondary md:col-span-1">
                {t('form.product.name')}
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateProduct(row.key, { name: e.target.value })}
                  maxLength={PLACE_LIMITS.productName}
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-fg-secondary">
                {t('form.product.price')} ({currency})
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.price}
                  onChange={(e) => updateProduct(row.key, { price: e.target.value })}
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-fg-secondary">
                {t('form.product.unit')}
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => updateProduct(row.key, { unit: e.target.value })}
                  placeholder={t('form.product.unitPlaceholder')}
                  maxLength={PLACE_LIMITS.productUnit}
                  className={INPUT}
                />
              </label>
              <button
                type="button"
                onClick={() => setProducts((rows) => rows.filter((item) => item.key !== row.key))}
                aria-label={
                  row.name.trim()
                    ? t('form.product.remove', { name: row.name.trim() })
                    : t('form.product.removeUnnamed')
                }
                className="col-span-2 flex size-9 cursor-pointer items-center justify-center self-end justify-self-end rounded-lg text-fg-tertiary transition-colors hover:bg-hover-overlay-strong hover:text-red-300 md:col-span-1 md:mb-1"
              >
                <Trash2 className="size-4" />
              </button>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-fg-secondary md:col-span-2">
                {t('form.product.note')}
                <input
                  type="text"
                  value={row.note}
                  onChange={(e) => updateProduct(row.key, { note: e.target.value })}
                  maxLength={PLACE_LIMITS.productNote}
                  className={INPUT}
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-fg-secondary md:col-span-2">
                {t('form.product.group')}
                <input
                  type="text"
                  value={row.group}
                  onChange={(e) => updateProduct(row.key, { group: e.target.value })}
                  placeholder={t('form.product.groupPlaceholder')}
                  maxLength={PLACE_LIMITS.productGroup}
                  title={t('form.product.groupHelp')}
                  className={INPUT}
                />
              </label>
              <label className="col-span-2 flex cursor-pointer items-center gap-2.5 text-sm text-fg-secondary md:col-span-4">
                <input
                  type="checkbox"
                  checked={row.available}
                  onChange={(e) => updateProduct(row.key, { available: e.target.checked })}
                  className="size-4 accent-amber-500"
                />
                {t('form.product.available')}
              </label>
            </div>
          ))}
          {products.length < PLACE_LIMITS.products && (
            <button
              type="button"
              onClick={() =>
                setProducts((rows) => [
                  ...rows,
                  // A new row continues under the heading of the one above it.
                  {
                    key: newKey(),
                    name: '',
                    group: rows[rows.length - 1]?.group ?? '',
                    price: '',
                    unit: '',
                    note: '',
                    available: true,
                  },
                ])
              }
              className={cn(BTN, BTN_SECONDARY, 'self-start')}
            >
              <Plus className="size-4" strokeWidth={2.5} aria-hidden />
              {t('form.product.add')}
            </button>
          )}
        </div>
      </Card>

      {/* ── Note for the curator (suggestions only) ────────────────── */}
      {mode === 'propose' && (
        <Card>
          <CardHead
            eyebrow={t('form.sections.note.eyebrow')}
            title={t('form.sections.note.title')}
          />
          <Field
            label={t('form.noteLabel')}
            htmlFor="pl-note"
            help={place ? t('form.noteHelpEdit') : t('form.noteHelpNew')}
          >
            <textarea
              id="pl-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={PLACE_LIMITS.proposalNote}
              rows={3}
              className={INPUT}
            />
          </Field>
        </Card>
      )}

      {/* ── Save bar ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {removeMessage && (
          <p role="status" className="rounded-lg border border-border-default bg-bg-surface-2 px-4 py-3 text-sm text-fg-primary">
            {removeMessage}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={cn(BTN, BTN_PRIMARY)}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {saving ? t('form.submitting') : submitLabel}
          </button>
          <Link href={backHref} className={cn(BTN, BTN_SECONDARY)}>
            {t('form.cancel')}
          </Link>
          {place && mode !== 'review' && !removeOpen && !removeMessage && (
            <>
              <span className="flex-1" />
              <button type="button" onClick={() => setRemoveOpen(true)} className={cn(BTN, BTN_DANGER)}>
                {mode === 'direct' ? t('form.remove.open') : t('form.remove.openSuggest')}
              </button>
            </>
          )}
        </div>

        {removeOpen && place && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.06] p-5">
            <h2 className="font-display text-xl">
              {mode === 'direct' ? t('form.remove.title') : t('form.remove.titleSuggest')}
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">{t('form.remove.body')}</p>
            <div className="mt-4">
              <Field label={t('form.remove.reasonLabel')} htmlFor="pl-remove-reason">
                <textarea
                  id="pl-remove-reason"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  maxLength={PLACE_LIMITS.proposalNote}
                  rows={2}
                  className={INPUT}
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={remove} disabled={removing} className={cn(BTN, BTN_DANGER)}>
                {removing && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {mode === 'direct' ? t('form.remove.confirm') : t('form.remove.confirmSuggest')}
              </button>
              <button type="button" onClick={() => setRemoveOpen(false)} className={cn(BTN, BTN_SECONDARY)}>
                {t('form.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
