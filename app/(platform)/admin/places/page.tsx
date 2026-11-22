import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { isCurrentUserCurator } from '@/lib/auth'
import { db } from '@/lib/db'
import { countryLabel, languageLabel } from '@/lib/locales'
import { parseOpeningHours, weeklyTable } from '@/lib/opening-hours'
import { getEditablePlace } from '@/lib/places'
import {
  PLACE_FIELDS,
  formatPrice,
  isPlaceCategory,
  pickPlaceFields,
  type PlaceData,
  type PlaceField,
  type PlaceProductData,
} from '@/lib/places-shared'
import { weekdayName } from '@/components/map/place-bits'
import { ProposalCard, type ProposalRow, type ProposalView } from '@/components/map/proposal-card'

/* ================================================================
   /admin/places — the review queue for map suggestions.

   Curators and admins only; the page 404s for anyone else (no hint
   that it exists). Authorisation is enforced again inside the
   approve / reject actions — this gate only decides what renders.

   The stored payloads are turned into plain display rows here, on
   the server, so the client component stays small.
   ================================================================ */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('reviewPlaces.title') }
}

/** Oldest first, a page at a time — the queue is meant to be worked down. */
const PAGE_SIZE = 30

export default async function ReviewPlacesPage() {
  if (!(await isCurrentUserCurator())) notFound()

  const [t, locale, total, proposals] = await Promise.all([
    getTranslations('map'),
    getLocale(),
    db.placeProposal.count({ where: { status: 'pending' } }),
    db.placeProposal.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        kind: true,
        placeId: true,
        payload: true,
        note: true,
        baseUpdatedAt: true,
        createdAt: true,
        proposer: { select: { name: true } },
      },
    }),
  ])

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
  const empty = t('review.empty_value')

  /* ── Turning one field's value into display lines ─────────────────── */
  const hoursLines = (value: unknown): string[] => {
    const parsed = parseOpeningHours(value)
    const hours = parsed.ok ? parsed.value : null
    if (!hours) return [t('form.hoursMode.none')]
    if (hours.mode !== 'weekly') return [t(`form.hoursMode.${hours.mode}`)]
    return weeklyTable(hours)
      .filter((row) => row.slots.length > 0)
      .map(
        (row) =>
          `${weekdayName(row.day, locale, 'short')}: ${row.slots
            .map((slot) => {
              const range = t('hours.range', { from: slot.from, to: slot.to })
              return slot.months
                ? `${range} (${t('hours.onlyMonths', { months: slot.months.join(', ') })})`
                : range
            })
            .join(', ')}`,
      )
  }

  const productLines = (value: unknown, currency: string): string[] => {
    if (!Array.isArray(value) || value.length === 0) return [t('review.products', { count: 0 })]
    return (value as PlaceProductData[]).map((product) =>
      [
        product.name,
        typeof product.priceMinor === 'number' ? formatPrice(product.priceMinor, currency, locale) : null,
        product.unit,
        product.note,
        product.available === false ? t('place.unavailable') : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }

  const lines = (field: PlaceField, value: unknown, currency: string): string[] => {
    if (field === 'openingHours') return hoursLines(value)
    if (field === 'products') return productLines(value, currency)
    if (field === 'locationApproximate') return [value === true ? t('review.yes') : t('review.no')]
    if (value === null || value === undefined || value === '') return [empty]
    if (field === 'category') return [isPlaceCategory(value) ? t(`categories.${value}.one`) : String(value)]
    if (field === 'operatingStatus') {
      return [
        value === 'active' || value === 'temporarily_closed' || value === 'permanently_closed'
          ? t(`status.${value}`)
          : String(value),
      ]
    }
    if (field === 'country') return [countryLabel(String(value)) ?? String(value)]
    if (field === 'language') return [languageLabel(String(value)) ?? String(value)]
    return [String(value)]
  }

  /** Rows for the given fields; latitude + longitude are shown as one "position" row. */
  const buildRows = (
    suggested: Partial<PlaceData>,
    current: PlaceData | null,
    onlyFilled: boolean,
  ): ProposalRow[] => {
    const rows: ProposalRow[] = []
    const currency = String(suggested.currency ?? current?.currency ?? 'EUR')
    const position = (data: Partial<PlaceData> | null) =>
      typeof data?.latitude === 'number' && typeof data?.longitude === 'number'
        ? [`${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`]
        : [empty]

    if ('latitude' in suggested || 'longitude' in suggested) {
      rows.push({
        label: t('fields.position'),
        ...(current ? { now: position(current) } : {}),
        suggested: position({ ...current, ...suggested }),
      })
    }
    for (const field of PLACE_FIELDS) {
      if (field === 'latitude' || field === 'longitude' || !(field in suggested)) continue
      const value = suggested[field]
      if (onlyFilled) {
        const blank =
          value === null ||
          value === undefined ||
          value === '' ||
          value === false ||
          (Array.isArray(value) && value.length === 0) ||
          (field === 'operatingStatus' && value === 'active')
        if (blank) continue
      }
      rows.push({
        label: t(`fields.${field}`),
        ...(current ? { now: lines(field, current[field], current.currency) } : {}),
        suggested: lines(field, value, currency),
      })
    }
    return rows
  }

  const views: ProposalView[] = []
  for (const proposal of proposals) {
    const byline = proposal.proposer
      ? t('review.by', { name: proposal.proposer.name, date: dateFormat.format(proposal.createdAt) })
      : t('review.byUnknown', { date: dateFormat.format(proposal.createdAt) })
    const base = { id: proposal.id, byline, note: proposal.note }

    if (proposal.kind === 'new') {
      const payload = pickPlaceFields(proposal.payload)
      views.push({
        ...base,
        kind: 'new',
        title: t('review.kindNew'),
        conflict: false,
        placeHref: null,
        rows: buildRows(payload, null, true),
      })
      continue
    }

    // Edits and removals refer to a place that may have been hidden or
    // deleted since — curators still see hidden ones.
    const current = proposal.placeId
      ? await getEditablePlace(db, { id: proposal.placeId }, { includeHidden: true })
      : null
    const name = current?.data.name ?? t('review.placeGone')
    const conflict =
      !!current &&
      !!proposal.baseUpdatedAt &&
      current.updatedAt.getTime() > proposal.baseUpdatedAt.getTime()

    views.push({
      ...base,
      kind: proposal.kind,
      title:
        proposal.kind === 'edit' ? t('review.kindEdit', { name }) : t('review.kindRemove', { name }),
      conflict,
      placeHref: current ? `/map/${current.slug}` : null,
      rows:
        proposal.kind === 'edit' && current
          ? buildRows(pickPlaceFields(proposal.payload), current.data, false)
          : [],
    })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:p-6 lg:p-10">
        <header>
          <h1 className="mb-3 font-display text-[clamp(28px,4vw,44px)] font-normal leading-none tracking-tight">
            {t('review.title')}
          </h1>
          <p className="max-w-[620px] text-base leading-relaxed text-fg-secondary">
            {t('review.subtitle')}
          </p>
          <p className="mt-3 text-sm font-medium text-fg-primary">{t('review.waiting', { count: total })}</p>
        </header>

        {views.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-fg-secondary">
            {t('review.empty')}
          </p>
        ) : (
          views.map((view) => <ProposalCard key={view.id} proposal={view} />)
        )}
      </div>
    </div>
  )
}
