import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { auth } from '@clerk/nextjs/server'
import { ArrowLeft, Clock, ExternalLink, Info, MapPin, Navigation, Pencil, Phone } from 'lucide-react'
import { db } from '@/lib/db'
import { languageLabel } from '@/lib/locales'
import {
  dateForMonth,
  openState,
  parseOpeningHours,
  weeklyTable,
} from '@/lib/opening-hours'
import { getPlaceBySlug, placeEditMode } from '@/lib/places'
import { directionsUrl, formatPrice, isPlaceCategory } from '@/lib/places-shared'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'
import {
  CategoryThumb,
  ClosedBadge,
  SourceBadge,
  openStateLabel,
  weekdayName,
} from '@/components/map/place-bits'
import { PlaceMiniMap } from '@/components/map/place-mini-map'

/* ================================================================
   /map/[slug] — everything we know about one place: description,
   opening times, open status, price list, where it is.

   Public. getPlaceBySlug() reads through publicPlacesWhere(), so a
   hidden place, or one whose Superhero project is no longer public,
   is a 404 here like anywhere else. A permanently closed place keeps
   its page (old links still explain themselves) but is not indexed.
   ================================================================ */

interface PlacePageParams {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PlacePageParams): Promise<Metadata> {
  const { slug } = await params
  const [t, place] = await Promise.all([getTranslations('meta'), getPlaceBySlug(slug)])
  if (!place) return { title: t('place.notFound') }
  return {
    title: t('place.title', { name: place.name }),
    description: place.summary.slice(0, 160),
    openGraph: { title: place.name, description: place.summary.slice(0, 160) },
    ...(place.operatingStatus === 'permanently_closed' ? { robots: { index: false } } : {}),
  }
}

const CARD = 'rounded-2xl border border-border-subtle bg-bg-surface p-5 sm:p-6'
const BTN =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-fast'
const BTN_PRIMARY = 'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover'
const BTN_SECONDARY =
  'border-border-default bg-bg-surface-2 text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'

export default async function PlacePage({ params }: PlacePageParams) {
  const { slug } = await params
  const place = await getPlaceBySlug(slug)
  if (!place) notFound()

  const [t, locale, { userId }] = await Promise.all([
    getTranslations('map'),
    getLocale(),
    auth(),
  ])

  // Signed-in viewers who may change this place directly get "Edit";
  // everyone else is offered "Suggest an edit" (sign-in happens on the way).
  let canEdit = false
  if (userId) {
    const viewer = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    })
    canEdit = !!viewer && (await placeEditMode(viewer, place.projectId)) === 'direct'
  }

  const category = isPlaceCategory(place.category) ? place.category : 'nature'
  const parsedHours = parseOpeningHours(place.openingHours)
  const hours = parsedHours.ok ? parsedHours.value : null
  const table = weeklyTable(hours)
  const closedForGood = place.operatingStatus === 'permanently_closed'
  const closedForNow = place.operatingStatus === 'temporarily_closed'
  const openLabel =
    place.operatingStatus === 'active'
      ? openStateLabel(
          openState(hours, place.timezone, new Date()),
          t as unknown as Parameters<typeof openStateLabel>[1],
          locale,
          hours?.mode === 'always',
        )
      : null

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' })
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const months = (list: number[]) => list.map((m) => monthFormat.format(dateForMonth(m))).join(', ')

  const pricesUpdated = place.products.reduce<Date | null>(
    (latest, product) => (!latest || product.updatedAt > latest ? product.updatedAt : latest),
    null,
  )
  const currency = place.currency ?? 'EUR'
  const addressLine = place.locationApproximate
    ? null
    : [place.address, place.city].filter(Boolean).join(', ') || null
  const backHref = `/map?c=${place.latitude},${place.longitude}${
    place.city ? `&l=${encodeURIComponent(place.city)}` : ''
  }&p=${encodeURIComponent(place.slug)}`

  // Structured data for search engines. `<` is escaped so user-written text
  // can never close the script element.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: place.name,
    description: place.summary,
    url: `${SITE_URL}/map/${place.slug}`,
    geo: { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude },
    ...(addressLine || place.country
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(place.locationApproximate || !place.address ? {} : { streetAddress: place.address }),
            ...(place.city ? { addressLocality: place.city } : {}),
            ...(place.country ? { addressCountry: place.country } : {}),
          },
        }
      : {}),
  }).replace(/</g, '\\u003c')

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href={closedForGood ? '/map' : backHref}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {closedForGood ? t('place.back') : t('place.showOnMap')}
        </Link>

        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="mb-6 flex gap-4">
          <CategoryThumb category={category} className="hidden sm:flex" />
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SourceBadge
                hero={!!place.project}
                label={place.project ? t('badges.hero') : t('badges.indie')}
              />
              {closedForNow && <ClosedBadge label={t('badges.temporarilyClosed')} />}
              {closedForGood && <ClosedBadge label={t('badges.permanentlyClosed')} />}
              <span className="text-xs text-fg-tertiary">{t(`categories.${category}.one`)}</span>
            </div>
            <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
              {place.name}
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-fg-secondary">
              {place.summary}
            </p>
          </div>
        </header>

        {/* ── Closed notices ───────────────────────────────────────── */}
        {closedForGood && (
          <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/[0.08] p-5">
            <h2 className="font-display text-xl">{t('place.closedPermanentlyTitle')}</h2>
            <p className="mt-1 text-sm text-fg-secondary">{t('place.closedPermanentlyBody')}</p>
            {place.statusNote && <p className="mt-2 text-sm text-fg-primary">{place.statusNote}</p>}
          </div>
        )}
        {closedForNow && (
          <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/[0.08] p-5">
            <h2 className="font-display text-xl">{t('place.closedTemporarilyTitle')}</h2>
            {place.statusNote && <p className="mt-1 text-sm text-fg-primary">{place.statusNote}</p>}
            {place.reopensOn && (
              <p className="mt-1 text-sm text-fg-secondary">
                {t('hours.reopens', { date: dateFormat.format(place.reopensOn) })}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* ── Main column ────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-6">
            {(place.description || place.practicalNote) && (
              <section className={CARD}>
                {place.description && (
                  <>
                    <h2 className="mb-3 font-display text-xl">{t('place.aboutTitle')}</h2>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-fg-secondary">
                      {place.description}
                    </p>
                    {place.language && place.language !== locale && languageLabel(place.language) && (
                      <p className="mt-3 text-xs text-fg-tertiary">
                        {t('place.writtenIn', { language: languageLabel(place.language) ?? '' })}
                      </p>
                    )}
                  </>
                )}
                {place.practicalNote && (
                  <div className={cn('flex gap-3 text-sm text-fg-secondary', place.description && 'mt-5')}>
                    <Info className="mt-0.5 size-4 shrink-0 text-fg-tertiary" aria-hidden />
                    <div>
                      <h2 className="font-medium text-fg-primary">{t('place.practicalTitle')}</h2>
                      <p className="mt-0.5 whitespace-pre-line">{place.practicalNote}</p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Opening times */}
            {!closedForGood && (hours || place.openingNote) && (
              <section className={CARD}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl">{t('hours.title')}</h2>
                  {openLabel && (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-fg-primary">
                      <Clock className="size-4 text-fg-tertiary" aria-hidden />
                      {openLabel}
                    </p>
                  )}
                </div>
                {table.length > 0 && (
                  <>
                    <table className="w-full text-sm">
                      <tbody>
                        {table.map((row) => (
                          <tr key={row.day} className="border-t border-border-subtle first:border-t-0">
                            <th scope="row" className="w-36 py-2 pr-4 text-left font-medium text-fg-primary">
                              {weekdayName(row.day, locale)}
                            </th>
                            <td className="py-2 text-fg-secondary">
                              {row.slots.length === 0 ? (
                                <span className="text-fg-tertiary">{t('hours.closedDay')}</span>
                              ) : (
                                row.slots.map((slot, index) => (
                                  <span key={index} className="block">
                                    {t('hours.range', { from: slot.from, to: slot.to })}
                                    {slot.months && (
                                      <span className="text-fg-tertiary">
                                        {' '}
                                        ({t('hours.onlyMonths', { months: months(slot.months) })})
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
                {place.openingNote && (
                  <p className={cn('whitespace-pre-line text-sm text-fg-secondary', table.length > 0 && 'mt-3')}>
                    {place.openingNote}
                  </p>
                )}
              </section>
            )}

            {/* Price list */}
            {place.products.length > 0 && (
              <section className={CARD}>
                <h2 className="mb-3 font-display text-xl">{t('place.priceListTitle')}</h2>
                <table className="w-full text-sm">
                  <tbody>
                    {place.products.map((product) => (
                      <tr
                        key={product.id}
                        className={cn(
                          'border-t border-border-subtle first:border-t-0',
                          !product.available && 'text-fg-tertiary',
                        )}
                      >
                        <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                          <span className={cn('font-medium', product.available && 'text-fg-primary')}>
                            {product.name}
                          </span>
                          {product.note && (
                            <span className="block text-xs text-fg-tertiary">{product.note}</span>
                          )}
                          {!product.available && (
                            <span className="block text-xs">{t('place.unavailable')}</span>
                          )}
                        </th>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-fg-secondary">{product.unit}</td>
                        <td className="whitespace-nowrap py-2.5 text-right font-medium tabular-nums">
                          {product.priceMinor !== null
                            ? formatPrice(product.priceMinor, currency, locale)
                            : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-fg-tertiary">
                  {pricesUpdated && t('place.priceListUpdated', { date: dateFormat.format(pricesUpdated) })}{' '}
                  {t('place.priceListHint')}
                </p>
              </section>
            )}
          </div>

          {/* ── Side column ────────────────────────────────────────── */}
          <aside className="flex flex-col gap-6">
            <section className={cn(CARD, 'overflow-hidden p-0 sm:p-0')}>
              <div className="relative h-56">
                <PlaceMiniMap
                  lat={place.latitude}
                  lng={place.longitude}
                  hero={!!place.project}
                  category={category}
                  approximate={place.locationApproximate}
                  label={
                    place.project
                      ? t('card.pinHero', { name: place.name })
                      : t('card.pinIndie', { name: place.name })
                  }
                />
              </div>
              <div className="flex flex-col gap-3 p-5">
                <h2 className="sr-only">{t('place.addressTitle')}</h2>
                <p className="flex gap-3 text-sm text-fg-secondary">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-fg-tertiary" aria-hidden />
                  <span>
                    {addressLine ?? place.city ?? t('badges.approximate')}
                    {place.locationApproximate && (
                      <span className="mt-1 block text-xs text-fg-tertiary">
                        {t('place.approximateNote')}
                      </span>
                    )}
                  </span>
                </p>
                {place.contact && (
                  <p className="flex gap-3 text-sm text-fg-secondary">
                    <Phone className="mt-0.5 size-4 shrink-0 text-fg-tertiary" aria-hidden />
                    <span className="break-words">{place.contact}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={directionsUrl({ lat: place.latitude, lng: place.longitude })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(BTN, BTN_PRIMARY)}
                  >
                    <Navigation className="size-4" aria-hidden />
                    {t('card.directions')}
                  </a>
                  {place.website && (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className={cn(BTN, BTN_SECONDARY)}
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      {t('card.website')}
                    </a>
                  )}
                </div>
              </div>
            </section>

            {place.project ? (
              <section className={CARD}>
                <h2 className="font-display text-xl">{t('place.projectTitle')}</h2>
                <p className="mt-1 text-sm text-fg-secondary">{t('place.projectBody')}</p>
                <p className="mt-3 text-sm text-fg-secondary">
                  {[
                    t('card.joined', { count: place.project._count.contributions }),
                    place.project._count.steps > 0
                      ? t('card.stepsNeedHelp', { count: place.project._count.steps })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <Link href={`/projects/${place.project.id}`} className={cn(BTN, BTN_PRIMARY, 'mt-4')}>
                  {t('card.viewProject')}
                </Link>
              </section>
            ) : (
              <p className="px-1 text-xs leading-relaxed text-fg-tertiary">{t('place.indieNote')}</p>
            )}

            <div className="flex flex-col gap-2 px-1 text-xs text-fg-tertiary">
              {place.lastVerifiedAt && (
                <p>{t('place.lastChecked', { date: dateFormat.format(place.lastVerifiedAt) })}</p>
              )}
              <Link
                href={`/map/${place.slug}/suggest`}
                className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-secondary underline underline-offset-2 hover:text-fg-primary"
              >
                <Pencil className="size-3.5" aria-hidden />
                {canEdit ? t('place.edit') : t('place.suggestEdit')}
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
