'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, Clock, Info, Loader2, MapPin, Phone, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlaceDetailView } from '@/lib/places'
import { LOCALE_NAMES, isSupportedLocale } from '@/lib/locale-shared'
import { dateForMonth, openState, weeklyTable } from '@/lib/opening-hours'
import {
  directionsUrl,
  formatPrice,
  groupProducts,
  placeUrl,
  type PlaceCategory,
  type PlaceOperator,
} from '@/lib/places-shared'
import {
  CategoryIcon,
  ClosedBadge,
  OperatorBadge,
  SourceBadge,
  THUMB_CLASS,
  openStateLabel,
  weekdayName,
} from '@/components/map/place-bits'

/* ================================================================
   PlacePanel — full details of one place or project. It opens over
   the result list, so the map stays in view (on small screens it
   covers the page).

   The header is drawn at once from what the list already knows
   (`preview`); the rest — long description, opening-times table,
   price list, the project's open steps — arrives from the server a
   moment later as `detail`.
   ================================================================ */

export interface PlacePanelPreview {
  slug: string
  name: string
  summary: string
  category: PlaceCategory
  operator: PlaceOperator | null
  city: string | null
  hero: boolean
}

const BTN =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-fast'
const BTN_PRIMARY =
  'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover'
const BTN_SECONDARY =
  'border-border-default bg-bg-surface-2 text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'
const BTN_GHOST = 'border-border-default bg-transparent text-fg-primary hover:border-border-strong'
const SECTION_TITLE = 'mb-2 mt-6 border-t border-border-subtle pt-5 font-display text-xl'
const CELL = 'border-b border-border-subtle py-2'

/** "French" for "fr", in the visitor's language; null when the code is not known. */
function languageName(code: string, locale: string): string | null {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code)
    return name && name !== code ? name : null
  } catch {
    return null
  }
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[18px_1fr] items-start gap-3">
      <span className="mt-0.5 text-fg-tertiary" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

export function PlacePanel({
  preview,
  detail,
  distanceKm,
  loading,
  error,
  nowMs,
  onBack,
}: {
  preview: PlacePanelPreview
  detail: PlaceDetailView | null
  /** Distance from the search centre, when there is one. */
  distanceKm: number | null
  loading: boolean
  error: string | null
  nowMs: number
  onBack: () => void
}) {
  const t = useTranslations('map')
  const locale = useLocale()
  const [copied, setCopied] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  // An automatic translation is shown by default; the visitor can switch
  // to the texts as they were written.
  const translation = detail?.translation ?? null
  const original = translation && showOriginal ? translation.original : null
  const summary = original?.summary ?? detail?.summary ?? preview.summary
  const description = original ? original.description : (detail?.description ?? null)
  const practicalNote = original ? original.practicalNote : (detail?.practicalNote ?? null)
  const openingNote = original ? original.openingNote : (detail?.openingNote ?? null)
  const statusNote = original ? original.statusNote : (detail?.statusNote ?? null)
  const products = (detail?.products ?? []).map((product, index) => ({
    ...product,
    ...(original?.products[index] ?? {}),
  }))
  const fromLanguage = translation?.from ? languageName(translation.from, locale) : null

  const hero = detail ? !!detail.project : preview.hero
  const closedForGood = detail?.operatingStatus === 'permanently_closed'
  const closedForNow = detail?.operatingStatus === 'temporarily_closed'

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' })
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const kmText =
    distanceKm === null
      ? null
      : t('card.kmAway', {
          km: new Intl.NumberFormat(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(distanceKm),
        })

  const share = async () => {
    if (!detail) return
    const url = new URL(placeUrl(detail), window.location.origin).toString()
    try {
      if (navigator.share) {
        await navigator.share({ title: detail.name, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
      }
    } catch {
      // The visitor closed the share sheet, or the clipboard is blocked: nothing to do.
    }
  }

  const table = detail ? weeklyTable(detail.openingHours) : []
  const openLabel =
    detail && detail.operatingStatus === 'active'
      ? openStateLabel(
          openState(detail.openingHours, detail.timezone, new Date(nowMs)),
          t as unknown as Parameters<typeof openStateLabel>[1],
          locale,
          detail.openingHours?.mode === 'always',
        )
      : null
  const addressLine = detail
    ? detail.approximate
      ? t('card.area', { place: detail.city ?? detail.name })
      : [detail.address, detail.city].filter(Boolean).join(', ')
    : null

  return (
    <section
      aria-label={t('panel.label')}
      className="fixed inset-0 z-[60] overflow-y-auto bg-bg-base px-4 pb-8 pt-4 sm:px-6 lg:absolute lg:z-[3]"
    >
      <button
        type="button"
        onClick={onBack}
        // Opening the panel moves focus here, so Back is one key press away.
        autoFocus
        className="mb-3 inline-flex cursor-pointer items-center gap-2 py-1.5 text-sm text-fg-secondary hover:text-fg-primary"
      >
        <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
        {t('panel.back')}
      </button>

      <div
        className={cn(
          'on-imagery mb-4 flex h-[120px] items-center justify-center rounded-xl bg-gradient-to-br text-white',
          THUMB_CLASS[preview.category],
        )}
      >
        <CategoryIcon category={preview.category} className="size-11 opacity-90" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge hero={hero} label={hero ? t('badges.hero') : t('badges.indie')} />
        {closedForNow && <ClosedBadge label={t('badges.temporarilyClosed')} />}
        {closedForGood && <ClosedBadge label={t('badges.permanentlyClosed')} />}
        <span className="text-xs text-fg-tertiary">{t(`categories.${preview.category}.one`)}</span>
        {preview.operator && (
          <OperatorBadge label={t('badges.runBy', { operator: t(`operators.${preview.operator}`) })} />
        )}
      </div>
      <h2 className="mt-2 font-display text-3xl leading-tight">{preview.name}</h2>
      <p className="mt-1 text-sm text-fg-tertiary">
        {[preview.city, kmText].filter(Boolean).join(' · ')}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-fg-secondary">{summary}</p>
      {description && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-secondary">
          {description}
        </p>
      )}
      {translation && (
        <p className="mt-2 text-xs text-fg-tertiary">
          {fromLanguage
            ? t('place.translatedFrom', { language: fromLanguage })
            : t('place.translated')}{' '}
          <button
            type="button"
            onClick={() => setShowOriginal((value) => !value)}
            aria-pressed={showOriginal}
            className="cursor-pointer text-fg-secondary underline underline-offset-2 hover:text-fg-primary"
          >
            {showOriginal ? t('place.showTranslation') : t('place.showOriginal')}
          </button>
        </p>
      )}
      {!translation &&
        detail?.description &&
        isSupportedLocale(detail.language) &&
        detail.language !== locale && (
          <p className="mt-2 text-xs text-fg-tertiary">
            {t('place.writtenIn', { language: LOCALE_NAMES[detail.language] })}
          </p>
        )}

      {loading && !detail && (
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-fg-secondary">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('panel.loading')}
        </p>
      )}
      {error && !detail && (
        <p role="alert" className="mt-6 text-sm text-red-300">
          {error}
        </p>
      )}

      {detail && (
        <>
          {closedForGood && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/[0.08] p-4">
              <h3 className="font-medium text-fg-primary">{t('place.closedPermanentlyTitle')}</h3>
              {statusNote && <p className="mt-1 text-sm text-fg-secondary">{statusNote}</p>}
            </div>
          )}
          {closedForNow && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-4">
              <h3 className="font-medium text-fg-primary">{t('place.closedTemporarilyTitle')}</h3>
              {statusNote && <p className="mt-1 text-sm text-fg-primary">{statusNote}</p>}
              {detail.reopensOn && (
                <p className="mt-1 text-sm text-fg-secondary">
                  {t('hours.reopens', {
                    date: dateFormat.format(new Date(`${detail.reopensOn}T00:00:00Z`)),
                  })}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {detail.project && (
              <Link href={`/projects/${detail.project.id}`} className={cn(BTN, BTN_PRIMARY)}>
                {t('card.viewProject')}
              </Link>
            )}
            <a
              href={directionsUrl(detail)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(BTN, detail.project ? BTN_SECONDARY : BTN_PRIMARY)}
            >
              {t('card.directions')}
            </a>
            {detail.website && (
              <a
                href={detail.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={cn(BTN, BTN_SECONDARY)}
              >
                {t('card.website')}
              </a>
            )}
            <button type="button" onClick={share} className={cn(BTN, BTN_GHOST)}>
              <Share2 className="size-4" aria-hidden />
              {copied ? t('panel.shareCopied') : t('panel.share')}
            </button>
          </div>

          {/* ── Practical information ─────────────────────────────── */}
          <h3 className={SECTION_TITLE}>{t('panel.practicalTitle')}</h3>
          <div className="grid gap-2 text-sm text-fg-secondary">
            {addressLine && <Row icon={<MapPin className="size-4" />}>{addressLine}</Row>}
            {!closedForGood && (openLabel || openingNote) && (
              <Row icon={<Clock className="size-4" />}>
                {openLabel ?? openingNote}
                {openLabel && openingNote && (
                  <span className="block text-fg-tertiary">{openingNote}</span>
                )}
              </Row>
            )}
            {practicalNote && (
              <Row icon={<Info className="size-4" />}>
                <span className="whitespace-pre-line">{practicalNote}</span>
              </Row>
            )}
            {detail.contact && <Row icon={<Phone className="size-4" />}>{detail.contact}</Row>}
          </div>

          {/* ── Opening times ─────────────────────────────────────── */}
          {!closedForGood && table.length > 0 && (
            <>
              <h3 className={SECTION_TITLE}>{t('hours.title')}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {table.map((row) => (
                    <tr key={row.day}>
                      <th scope="row" className={cn(CELL, 'w-32 pr-3 text-left font-normal text-fg-primary')}>
                        {weekdayName(row.day, locale)}
                      </th>
                      <td className={cn(CELL, 'text-fg-secondary')}>
                        {row.slots.length === 0 ? (
                          <span className="text-fg-tertiary">{t('hours.closedDay')}</span>
                        ) : (
                          row.slots.map((slot, index) => (
                            <span key={index} className="block">
                              {t('hours.range', { from: slot.from, to: slot.to })}
                              {slot.months && (
                                <span className="text-fg-tertiary">
                                  {' '}
                                  (
                                  {t('hours.onlyMonths', {
                                    months: slot.months
                                      .map((m) => monthFormat.format(dateForMonth(m)))
                                      .join(', '),
                                  })}
                                  )
                                </span>
                              )}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-fg-tertiary">{t('hours.localTime')}</p>
            </>
          )}

          {/* ── Price list ────────────────────────────────────────── */}
          {products.length > 0 && (
            <>
              <h3 className={SECTION_TITLE}>{t('place.priceListTitle')}</h3>
              {groupProducts(products).map((group, index) => (
                <div key={`${group.group ?? ''}-${index}`}>
                  {group.group && (
                    <h4 className="mb-0.5 mt-4 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
                      {group.group}
                    </h4>
                  )}
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">{t('panel.productColumn')}</th>
                        <th scope="col">{t('panel.amountColumn')}</th>
                        <th scope="col">{t('panel.priceColumn', { currency: detail.currency })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((product) => (
                        <tr key={product.id} className={cn(!product.available && 'text-fg-tertiary')}>
                          <th scope="row" className={cn(CELL, 'text-left font-normal', product.available && 'text-fg-primary')}>
                            {product.name}
                            {product.note && (
                              <span className="block text-xs text-fg-tertiary">{product.note}</span>
                            )}
                            {!product.available && (
                              <span className="block text-xs">{t('place.unavailable')}</span>
                            )}
                          </th>
                          <td className={cn(CELL, 'whitespace-nowrap pl-3 text-fg-tertiary')}>
                            {product.unit}
                          </td>
                          <td className={cn(CELL, 'whitespace-nowrap pl-3 text-right font-medium tabular-nums')}>
                            {product.priceMinor !== null
                              ? formatPrice(product.priceMinor, detail.currency, locale)
                              : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <p className="mt-3 text-xs leading-relaxed text-fg-tertiary">
                {detail.pricesUpdatedAt &&
                  t('panel.pricesNote', {
                    currency: detail.currency,
                    date: dateFormat.format(new Date(detail.pricesUpdatedAt)),
                  })}{' '}
                <Link
                  href={`/map/${detail.slug}/suggest`}
                  className="text-fg-secondary underline underline-offset-2"
                >
                  {t('panel.reportPrice')}
                </Link>
              </p>
            </>
          )}

          {/* ── Superhero project: steps that need help ───────────── */}
          {detail.project && detail.project.helpSteps.length > 0 && (
            <>
              <h3 className={SECTION_TITLE}>{t('panel.stepsTitle')}</h3>
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t('panel.stepColumn')}</th>
                    <th scope="col">{t('panel.timeColumn')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.project.helpSteps.map((step, index) => (
                    <tr key={index}>
                      <th scope="row" className={cn(CELL, 'text-left font-normal text-fg-primary')}>
                        {step.title}
                      </th>
                      <td className={cn(CELL, 'whitespace-nowrap pl-3 text-right font-medium tabular-nums')}>
                        {step.estimatedHrs !== null
                          ? t('panel.stepHours', { hours: step.estimatedHrs })
                          : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {detail.project && (
            <p className="mt-3 text-xs leading-relaxed text-fg-tertiary">
              {t('panel.stepsNote', { count: detail.project.joined })}
            </p>
          )}

          <p className="mt-6 text-xs leading-relaxed text-fg-tertiary">
            {detail.project ? t('card.fineHero') : t('card.fineIndie')}{' '}
            <Link
              href={`/map/${detail.slug}/suggest`}
              className="text-fg-secondary underline underline-offset-2"
            >
              {t('card.suggestEdit')}
            </Link>
          </p>
          {detail.lastVerifiedAt && (
            <p className="mt-1 text-xs text-fg-tertiary">
              {t('place.lastChecked', { date: dateFormat.format(new Date(detail.lastVerifiedAt)) })}
            </p>
          )}
        </>
      )}
    </section>
  )
}
