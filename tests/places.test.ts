import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/* Map places: the pure helpers (validation, geometry, money, diffs) and
   the single write path applyProposal(), run against a hand-made
   transaction stub — we assert what would be written, not the DB. */

vi.mock('@/lib/db', () => ({ db: {} }))

import {
  boundingBox,
  coarsen,
  currencyForCountry,
  decodeMapPlaceCookie,
  diffPlaceData,
  encodeMapPlaceCookie,
  foldText,
  formatPrice,
  groupProducts,
  haversineKm,
  looksLikeDuplicate,
  samePlaceMatch,
  minorToInput,
  parsePriceToMinor,
  pickPlaceFields,
  placeUrl,
  slugifyPlace,
  validatePlaceInput,
  validateProposalNote,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_GROUPS,
  PLACE_LIMITS,
  PLACE_OPERATORS,
  type PlaceData,
} from '@/lib/places-shared'
import { parseResearchRecord } from '@/lib/places-import'
import { applyProposal, isCuratorRole, publicPlacesWhere } from '@/lib/places'
import { parseNominatimResponse, parsePhotonResponse } from '@/lib/geocode'

const FROIDEVILLE = { lat: 46.6012, lng: 6.6816 }
const LAUSANNE = { lat: 46.5197, lng: 6.6323 }

const valid = {
  name: ' La Cabane à Légumes ',
  summary: 'Self-service farm stall with seasonal vegetables and eggs.',
  description: '',
  category: 'farm',
  latitude: 46.60124331,
  longitude: 6.68163551,
  address: 'Chemin du Verger',
  city: 'Froideville',
  country: 'ch',
  website: 'example.org/cabane/',
  practicalNote: 'Self-service. Pay by TWINT or cash.',
  openingHours: { mode: 'weekly', periods: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '07:00', to: '20:00' }] },
  products: [
    { name: 'Eggs', group: ' From the farm ', unit: '6 eggs', priceMinor: 450 },
    { name: 'Apple juice', note: 'from the farm next door', priceMinor: null, available: false },
  ],
}

function data(overrides: Record<string, unknown> = {}): PlaceData {
  const checked = validatePlaceInput({ ...valid, ...overrides })
  if (!checked.ok) throw new Error(`fixture invalid: ${checked.error.key}`)
  return checked.data
}

const errorKey = (raw: unknown): string | null => {
  const checked = validatePlaceInput(raw)
  return checked.ok ? null : checked.error.key
}

describe('validatePlaceInput', () => {
  it('normalises a valid place', () => {
    const d = data()
    expect(d.name).toBe('La Cabane à Légumes')
    expect(d.description).toBeNull()
    expect(d.country).toBe('CH')
    expect(d.currency).toBe('CHF')
    expect(d.website).toBe('https://example.org/cabane')
    expect(d.latitude).toBe(46.601243)
    expect(d.longitude).toBe(6.681636)
    expect(d.operatingStatus).toBe('active')
    expect(d.locationApproximate).toBe(false)
    expect(d.openingHours).toEqual({
      v: 1,
      mode: 'weekly',
      periods: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '07:00', to: '20:00' }],
    })
    expect(d.products).toEqual([
      { name: 'Eggs', group: 'From the farm', note: null, priceMinor: 450, unit: '6 eggs', available: true },
      { name: 'Apple juice', group: null, note: 'from the farm next door', priceMinor: null, unit: null, available: false },
    ])
  })

  it('requires the basics', () => {
    expect(errorKey(null)).toBe('places.invalid')
    expect(errorKey({ ...valid, name: '  ' })).toBe('places.nameRequired')
    expect(errorKey({ ...valid, summary: '' })).toBe('places.summaryRequired')
    expect(errorKey({ ...valid, category: 'casino' })).toBe('places.categoryRequired')
  })

  it('requires a real position', () => {
    expect(errorKey({ ...valid, latitude: undefined })).toBe('places.positionRequired')
    expect(errorKey({ ...valid, latitude: '46.6' })).toBe('places.positionRequired')
    expect(errorKey({ ...valid, latitude: 91 })).toBe('places.positionRequired')
    expect(errorKey({ ...valid, longitude: Number.NaN })).toBe('places.positionRequired')
    // 0,0 is the "never set" position.
    expect(errorKey({ ...valid, latitude: 0, longitude: 0 })).toBe('places.positionRequired')
  })

  it('enforces length caps', () => {
    const tooLong = validatePlaceInput({ ...valid, summary: 'x'.repeat(PLACE_LIMITS.summary + 1) })
    expect(tooLong).toEqual({
      ok: false,
      error: { key: 'places.fieldTooLong', params: { field: 'summary', max: PLACE_LIMITS.summary } },
    })
    expect(errorKey({ ...valid, summary: 'x'.repeat(PLACE_LIMITS.summary) })).toBeNull()
  })

  it('rejects unknown countries, bad websites and bad currencies', () => {
    expect(errorKey({ ...valid, country: 'ZZ' })).toBe('places.countryInvalid')
    expect(errorKey({ ...valid, website: 'javascript:alert(1)' })).toBe('places.websiteInvalid')
    expect(errorKey({ ...valid, website: 'not a url' })).toBe('places.websiteInvalid')
    expect(errorKey({ ...valid, currency: 'francs' })).toBe('places.currencyInvalid')
  })

  it('keeps only the languages the site is offered in', () => {
    expect(data({ language: 'xx' }).language).toBeNull()
    expect(data({ language: 'FR' }).language).toBe('fr')
    expect(data({ language: 'uk' }).language).toBe('uk')
    // Dutch is a valid language, but not one of the site's.
    expect(data({ language: 'nl' }).language).toBeNull()
  })

  it('accepts the Services and Other categories', () => {
    expect(data({ category: 'services' }).category).toBe('services')
    expect(data({ category: 'other' }).category).toBe('other')
  })

  it('accepts the categories that "repair and reuse" was split into', () => {
    for (const category of ['secondhand', 'mending', 'repair', 'bike', 'share']) {
      expect(data({ category }).category).toBe(category)
    }
    // The full list, in the order the place form shows it.
    expect([...PLACE_CATEGORIES]).toEqual([
      'farm',
      'organic',
      'coop',
      'nature',
      'secondhand',
      'mending',
      'repair',
      'bike',
      'share',
      'garden',
      'learn',
      'services',
      'other',
    ])
  })

  it('puts every category in exactly one group of the filter menu', () => {
    const grouped = PLACE_CATEGORY_GROUPS.flatMap((group) => [...group.categories])
    expect([...grouped].sort()).toEqual([...PLACE_CATEGORIES].sort())
  })

  it('accepts who runs the place, or nothing', () => {
    for (const operator of PLACE_OPERATORS) {
      expect(data({ operator }).operator).toBe(operator)
    }
    expect([...PLACE_OPERATORS]).toEqual(['nonprofit', 'cooperative', 'public', 'business'])
    // Not known: null, an empty form field, or a payload from before the field existed.
    expect(data({ operator: null }).operator).toBeNull()
    expect(data({ operator: '' }).operator).toBeNull()
    expect(data().operator).toBeNull()
  })

  it('rejects an operator that is not on the list', () => {
    expect(errorKey({ ...valid, operator: 'charity' })).toBe('places.operatorInvalid')
    expect(errorKey({ ...valid, operator: 'Business' })).toBe('places.operatorInvalid')
    expect(errorKey({ ...valid, operator: 3 })).toBe('places.operatorInvalid')
  })

  it('needs a note for hours "described in words"', () => {
    expect(errorKey({ ...valid, openingHours: { mode: 'text' } })).toBe('places.openingNoteRequired')
    expect(
      errorKey({ ...valid, openingHours: { mode: 'text' }, openingNote: 'Evenings after dusk' }),
    ).toBeNull()
  })

  it('keeps closure details only while they apply', () => {
    const closed = data({
      operatingStatus: 'temporarily_closed',
      statusNote: 'Closed for the winter',
      reopensOn: '2027-03-01',
    })
    expect(closed.statusNote).toBe('Closed for the winter')
    expect(closed.reopensOn).toBe('2027-03-01')

    const open = data({ operatingStatus: 'active', statusNote: 'old note', reopensOn: '2027-03-01' })
    expect(open.statusNote).toBeNull()
    expect(open.reopensOn).toBeNull()

    expect(errorKey({ ...valid, operatingStatus: 'on_holiday' })).toBe('places.statusInvalid')
    expect(
      errorKey({ ...valid, operatingStatus: 'temporarily_closed', reopensOn: 'next spring' }),
    ).toBe('places.reopensOnInvalid')
  })

  it('validates the price list', () => {
    expect(errorKey({ ...valid, products: [{ name: '' }] })).toBe('places.productNameRequired')
    expect(errorKey({ ...valid, products: [{ name: 'Eggs', priceMinor: 4.5 }] })).toBe(
      'places.productPriceInvalid',
    )
    expect(errorKey({ ...valid, products: [{ name: 'Eggs', priceMinor: -1 }] })).toBe(
      'places.productPriceInvalid',
    )
    const many = Array.from({ length: PLACE_LIMITS.products + 1 }, (_, i) => ({ name: `P${i}` }))
    expect(errorKey({ ...valid, products: many })).toBe('places.tooManyProducts')
  })
})

describe('validateProposalNote', () => {
  it('trims, and caps the length', () => {
    expect(validateProposalNote('  I shop here weekly. ')).toEqual({ ok: true, note: 'I shop here weekly.' })
    expect(validateProposalNote('')).toEqual({ ok: true, note: null })
    expect(validateProposalNote('x'.repeat(PLACE_LIMITS.proposalNote + 1)).ok).toBe(false)
  })
})

describe('geometry', () => {
  it('measures great-circle distance', () => {
    // Froideville to Lausanne is a little under 10 km.
    const km = haversineKm(FROIDEVILLE, LAUSANNE)
    expect(km).toBeGreaterThan(9)
    expect(km).toBeLessThan(10.5)
    expect(haversineKm(FROIDEVILLE, FROIDEVILLE)).toBe(0)
  })

  it('builds a box that contains the whole circle', () => {
    const box = boundingBox(FROIDEVILLE, 25)
    expect(box.lngRanges).toHaveLength(1)
    const { min, max } = box.lngRanges[0]
    // Points 25 km due north, south, east and west sit just inside the box.
    const dLat = 25 / 111.2
    expect(box.minLat).toBeLessThanOrEqual(FROIDEVILLE.lat - dLat + 0.01)
    expect(box.maxLat).toBeGreaterThanOrEqual(FROIDEVILLE.lat + dLat - 0.01)
    for (const lng of [min, max]) {
      expect(haversineKm(FROIDEVILLE, { lat: FROIDEVILLE.lat, lng })).toBeGreaterThanOrEqual(24.9)
    }
    expect(LAUSANNE.lat).toBeGreaterThan(box.minLat)
    expect(LAUSANNE.lng).toBeGreaterThan(min)
    expect(LAUSANNE.lng).toBeLessThan(max)
  })

  it('splits the box across the antimeridian', () => {
    const fiji = boundingBox({ lat: -17, lng: 179.9 }, 50)
    expect(fiji.lngRanges).toHaveLength(2)
    expect(fiji.lngRanges[0].max).toBe(180)
    expect(fiji.lngRanges[1].min).toBe(-180)
  })

  it('covers every longitude near a pole', () => {
    expect(boundingBox({ lat: 89.95, lng: 10 }, 25).lngRanges).toEqual([{ min: -180, max: 180 }])
  })

  it('coarsens a device position to about 1 km', () => {
    expect(coarsen(46.60124331)).toBe(46.6)
    expect(coarsen(6.68663551)).toBe(6.69)
  })
})

describe('slugifyPlace', () => {
  it('builds an ASCII slug from name and town', () => {
    expect(slugifyPlace('La Cabane à Légumes', 'Froideville')).toBe('la-cabane-a-legumes-froideville')
    expect(slugifyPlace("Le Lait d'à Côté", null)).toBe('le-lait-d-a-cote')
  })

  it('falls back when nothing usable is left', () => {
    expect(slugifyPlace('日本', null)).toBe('place')
  })
})

describe('money', () => {
  it('picks a default currency from the country', () => {
    expect(currencyForCountry('CH')).toBe('CHF')
    expect(currencyForCountry('FR')).toBe('EUR')
    expect(currencyForCountry(null)).toBe('EUR')
  })

  it('parses typed prices into minor units', () => {
    expect(parsePriceToMinor('3.50', 'CHF')).toBe(350)
    expect(parsePriceToMinor(' 3,5 ', 'EUR')).toBe(350)
    expect(parsePriceToMinor('12', 'EUR')).toBe(1200)
    expect(parsePriceToMinor('500', 'JPY')).toBe(500)
    expect(parsePriceToMinor('abc', 'EUR')).toBeNull()
    expect(parsePriceToMinor('-2', 'EUR')).toBeNull()
    expect(parsePriceToMinor('', 'EUR')).toBeNull()
  })

  it('round-trips through the input format', () => {
    expect(minorToInput(350, 'CHF')).toBe('3.50')
    expect(minorToInput(500, 'JPY')).toBe('500')
    expect(parsePriceToMinor(minorToInput(1999, 'EUR'), 'EUR')).toBe(1999)
  })

  it('formats for display in the reader’s locale', () => {
    expect(formatPrice(350, 'CHF', 'en-GB')).toContain('3.50')
    expect(formatPrice(350, 'EUR', 'de')).toContain('3,50')
  })
})

describe('diffPlaceData / pickPlaceFields', () => {
  it('returns only the fields that changed', () => {
    const before = data()
    const after = data({ summary: 'New summary.', products: [{ name: 'Eggs', priceMinor: 480, unit: '6 eggs' }] })
    const diff = diffPlaceData(before, after)
    expect(Object.keys(diff).sort()).toEqual(['products', 'summary'])
    expect(diffPlaceData(before, data())).toEqual({})
  })

  it('treats the operator as a field of its own', () => {
    expect(diffPlaceData(data(), data({ operator: 'cooperative' }))).toEqual({ operator: 'cooperative' })
    expect(diffPlaceData(data({ operator: 'public' }), data())).toEqual({ operator: null })
    expect(pickPlaceFields({ operator: 'public', owner: 'x' })).toEqual({ operator: 'public' })
  })

  it('ignores unknown keys in a stored payload', () => {
    expect(pickPlaceFields({ summary: 'x', listingStatus: 'published', projectId: 'p1' })).toEqual({
      summary: 'x',
    })
    expect(pickPlaceFields('nonsense')).toEqual({})
  })
})

describe('groupProducts', () => {
  it('groups consecutive products under their heading, keeping the order', () => {
    const p = (name: string, group: string | null) => ({ name, group })
    expect(
      groupProducts([p('Potatoes', 'Vegetables'), p('Leeks', 'Vegetables'), p('Eggs', 'From the farm'), p('Bag', null)]),
    ).toEqual([
      { group: 'Vegetables', items: [p('Potatoes', 'Vegetables'), p('Leeks', 'Vegetables')] },
      { group: 'From the farm', items: [p('Eggs', 'From the farm')] },
      { group: null, items: [p('Bag', null)] },
    ])
    expect(groupProducts([])).toEqual([])
  })
})

describe('placeUrl', () => {
  it('opens the place on the map, centred on it', () => {
    expect(placeUrl({ slug: 'bio-du-bourg-echallens', lat: 46.641, lng: 6.633, city: 'Echallens' })).toBe(
      '/map?c=46.641%2C6.633&l=Echallens&d=bio-du-bourg-echallens',
    )
    expect(placeUrl({ slug: 'x', lat: 1, lng: 2, city: null })).toBe('/map?c=1%2C2&d=x')
  })
})

describe('map place cookie', () => {
  it('round-trips a town', () => {
    const value = encodeMapPlaceCookie({ lat: 46.601243, lng: 6.681636 }, 'Froideville')
    expect(decodeMapPlaceCookie(value)).toEqual({
      centre: { lat: 46.601243, lng: 6.681636 },
      label: 'Froideville',
    })
    expect(decodeMapPlaceCookie(encodeMapPlaceCookie({ lat: 1, lng: 2 }, 'São Paulo | centre'))?.label).toBe(
      'São Paulo | centre',
    )
  })

  it('ignores a missing or damaged cookie', () => {
    expect(decodeMapPlaceCookie(undefined)).toBeNull()
    expect(decodeMapPlaceCookie('')).toBeNull()
    expect(decodeMapPlaceCookie('nonsense')).toBeNull()
    expect(decodeMapPlaceCookie('%E0%A4%A')).toBeNull()
    expect(decodeMapPlaceCookie(encodeURIComponent('95,6|Nowhere'))).toBeNull()
    expect(decodeMapPlaceCookie(encodeURIComponent('46.6,6.6'))).toEqual({
      centre: { lat: 46.6, lng: 6.6 },
      label: null,
    })
  })
})

describe('search helpers', () => {
  it('folds accents and case', () => {
    expect(foldText('Légumes À Côté')).toBe('legumes a cote')
  })

  it('spots likely duplicates', () => {
    const cabane = { name: 'La Cabane à Légumes', lat: 46.6012, lng: 6.6816 }
    // Same spot, different name.
    expect(looksLikeDuplicate(cabane, { name: 'Farm stall', lat: 46.6012, lng: 6.6817 })).toBe(true)
    // 300 m away with a matching name.
    expect(looksLikeDuplicate(cabane, { name: 'Cabane a legumes', lat: 46.6039, lng: 6.6816 })).toBe(true)
    // 300 m away, unrelated.
    expect(looksLikeDuplicate(cabane, { name: 'Bio du Bourg', lat: 46.6039, lng: 6.6816 })).toBe(false)
    // Same name in another town.
    expect(looksLikeDuplicate(cabane, { ...cabane, ...LAUSANNE })).toBe(false)
  })

  it('treats two places as the same only when the names match', () => {
    const cabane = { name: 'La Cabane à Légumes', lat: 46.6012, lng: 6.6816 }
    // Same name, written differently, at the same spot and 300 m away.
    expect(samePlaceMatch(cabane, { ...cabane, name: 'la cabane a legumes' })).toBe('same')
    expect(samePlaceMatch(cabane, { name: 'La Cabane à Légumes', lat: 46.6039, lng: 6.6816 })).toBe('same')
    // One name inside the other: for a person to decide.
    expect(samePlaceMatch(cabane, { ...cabane, name: 'Cabane à Légumes' })).toBe('maybe')
    const meyrinroule = { name: 'Meyrinroule', lat: 46.22923, lng: 6.071387 }
    expect(
      samePlaceMatch(meyrinroule, { ...meyrinroule, name: 'La Manivelle - Point relais Meyrinroule' }),
    ).toBe('maybe')
    // Two different shops in one building share the very same point.
    expect(samePlaceMatch(cabane, { ...cabane, name: 'Atelier vélo du Verger' })).toBeNull()
    // A short name that happens to be part of a longer one.
    expect(samePlaceMatch({ ...cabane, name: 'Alna Diététique et Bio' }, { ...cabane, name: 'Bio' })).toBeNull()
    // Same name in another town, and names with nothing to compare.
    expect(samePlaceMatch(cabane, { ...cabane, ...LAUSANNE })).toBeNull()
    expect(samePlaceMatch({ ...cabane, name: '…' }, { ...cabane, name: '!' })).toBeNull()
  })
})

describe('publicPlacesWhere', () => {
  it('requires a published listing and a public project (or none)', () => {
    expect(publicPlacesWhere()).toEqual({
      listingStatus: 'published',
      OR: [{ projectId: null }, { project: { visibility: 'public' } }],
    })
  })
})

describe('isCuratorRole', () => {
  it('counts admins as curators', () => {
    expect(isCuratorRole('curator')).toBe(true)
    expect(isCuratorRole('admin')).toBe(true)
    expect(isCuratorRole('member')).toBe(false)
    expect(isCuratorRole(null)).toBe(false)
  })
})

/* ── applyProposal ───────────────────────────────────────────────────── */

function makeTx() {
  return {
    placeProposal: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    place: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'place-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    placeProduct: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

type FakeTx = ReturnType<typeof makeTx>
const apply = (tx: FakeTx, ...rest: Parameters<typeof applyProposal> extends [unknown, ...infer R] ? R : never) =>
  applyProposal(tx as unknown as Parameters<typeof applyProposal>[0], ...rest)

/** A stored place row as getEditablePlace() selects it. */
function storedRow(overrides: Record<string, unknown> = {}) {
  const d = data()
  return {
    id: 'place-1',
    slug: 'la-cabane-a-legumes-froideville',
    projectId: null,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...d,
    reopensOn: null,
    ...overrides,
  }
}

const NOW = new Date('2026-11-22T12:00:00Z')

describe('applyProposal', () => {
  let tx: FakeTx
  beforeEach(() => {
    tx = makeTx()
  })

  it('creates a place from a new proposal', async () => {
    const result = await apply(
      tx,
      { id: 'prop-1', kind: 'new', placeId: null, payload: valid },
      'curator-1',
      { createdById: 'member-1', now: NOW },
    )
    expect(result).toEqual({
      ok: true,
      placeId: 'place-1',
      slug: 'la-cabane-a-legumes-froideville',
      name: 'La Cabane à Légumes',
    })

    // Claimed with the pending guard, by this reviewer.
    expect(tx.placeProposal.updateMany).toHaveBeenCalledWith({
      where: { id: 'prop-1', status: 'pending' },
      data: { status: 'approved', reviewerId: 'curator-1', reviewedAt: NOW },
    })

    const created = tx.place.create.mock.calls[0][0].data
    expect(created.slug).toBe('la-cabane-a-legumes-froideville')
    expect(created.createdById).toBe('member-1')
    expect(created.projectId).toBeNull()
    expect(created.timezone).toBe('Europe/Zurich')
    expect(created.currency).toBe('CHF')
    // Not given in the payload, so stored as "not known".
    expect(created.operator).toBeNull()
    expect(created.closedAt).toBeNull()
    expect(created.lastVerifiedAt).toBe(NOW)
    // Moderation state is never taken from the payload.
    expect(created.listingStatus).toBeUndefined()

    const products = tx.placeProduct.createMany.mock.calls[0][0].data
    expect(products.map((p: { name: string; sortOrder: number }) => [p.name, p.sortOrder])).toEqual([
      ['Eggs', 0],
      ['Apple juice', 1],
    ])
    // The proposal now points at the place it created.
    expect(tx.placeProposal.update).toHaveBeenCalledWith({
      where: { id: 'prop-1' },
      data: { placeId: 'place-1' },
    })
  })

  it('stores the category and who runs the place', async () => {
    await apply(
      tx,
      {
        id: 'prop-1',
        kind: 'new',
        placeId: null,
        payload: { ...valid, category: 'bike', operator: 'nonprofit' },
      },
      'curator-1',
      { now: NOW },
    )
    const created = tx.place.create.mock.calls[0][0].data
    expect(created.category).toBe('bike')
    expect(created.operator).toBe('nonprofit')
  })

  it('changes and clears the operator through an edit', async () => {
    tx.place.findFirst.mockResolvedValue(storedRow({ category: 'repair', operator: 'business' }))
    await apply(
      tx,
      { id: 'prop-1', kind: 'edit', placeId: 'place-1', payload: { operator: null, category: 'mending' } },
      'curator-1',
      { now: NOW },
    )
    const updated = tx.place.update.mock.calls[0][0].data
    expect(updated.operator).toBeNull()
    expect(updated.category).toBe('mending')

    // A stored value that is no longer a known key reads as "not known".
    tx = makeTx()
    tx.place.findFirst.mockResolvedValue(storedRow({ operator: 'charity' }))
    const result = await apply(
      tx,
      { id: 'prop-2', kind: 'edit', placeId: 'place-1', payload: { summary: 'New summary.' } },
      'curator-1',
      { now: NOW },
    )
    expect(result.ok).toBe(true)
    expect(tx.place.update.mock.calls[0][0].data.operator).toBeNull()
  })

  it('links a new place to a project only through the option, never the payload', async () => {
    await apply(
      tx,
      { id: 'prop-1', kind: 'new', placeId: null, payload: { ...valid, projectId: 'sneaky' } },
      'lead-1',
      { projectId: 'project-9', now: NOW },
    )
    expect(tx.place.create.mock.calls[0][0].data.projectId).toBe('project-9')

    tx = makeTx()
    await apply(
      tx,
      { id: 'prop-2', kind: 'new', placeId: null, payload: { ...valid, projectId: 'sneaky' } },
      'curator-1',
      { now: NOW },
    )
    expect(tx.place.create.mock.calls[0][0].data.projectId).toBeNull()
  })

  it('finds a free slug when the first is taken', async () => {
    tx.place.findUnique.mockResolvedValueOnce({ id: 'other' }).mockResolvedValue(null)
    const result = await apply(tx, { id: 'prop-1', kind: 'new', placeId: null, payload: valid }, 'c')
    expect(result.ok && result.slug).toBe('la-cabane-a-legumes-froideville-2')
  })

  it('does nothing when the proposal was already decided', async () => {
    tx.placeProposal.updateMany.mockResolvedValue({ count: 0 })
    const result = await apply(tx, { id: 'prop-1', kind: 'new', placeId: null, payload: valid }, 'c')
    expect(result).toEqual({ ok: false, reason: 'already_resolved' })
    expect(tx.place.create).not.toHaveBeenCalled()
    expect(tx.place.update).not.toHaveBeenCalled()
  })

  it('refuses an invalid stored payload', async () => {
    const result = await apply(
      tx,
      { id: 'prop-1', kind: 'new', placeId: null, payload: { ...valid, name: '' } },
      'c',
    )
    expect(result).toEqual({ ok: false, reason: 'invalid', error: { key: 'places.nameRequired' } })
    expect(tx.place.create).not.toHaveBeenCalled()
  })

  it('applies an edit over the current place and leaves the price list alone', async () => {
    tx.place.findFirst.mockResolvedValue(storedRow())
    tx.place.findUnique.mockResolvedValue({ closedAt: null })
    const result = await apply(
      tx,
      { id: 'prop-2', kind: 'edit', placeId: 'place-1', payload: { summary: 'Now with honey.' } },
      'curator-1',
      { now: NOW },
    )
    expect(result.ok).toBe(true)
    const update = tx.place.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'place-1' })
    expect(update.data.summary).toBe('Now with honey.')
    expect(update.data.name).toBe('La Cabane à Légumes')
    // An edit never moves the slug, the project link or the listing status.
    expect(update.data.slug).toBeUndefined()
    expect(update.data.projectId).toBeUndefined()
    expect(update.data.listingStatus).toBeUndefined()
    expect(tx.placeProduct.deleteMany).not.toHaveBeenCalled()
    expect(tx.placeProduct.createMany).not.toHaveBeenCalled()
  })

  it('replaces the whole price list when the edit includes products', async () => {
    tx.place.findFirst.mockResolvedValue(storedRow())
    tx.place.findUnique.mockResolvedValue({ closedAt: null })
    await apply(
      tx,
      {
        id: 'prop-2',
        kind: 'edit',
        placeId: 'place-1',
        payload: { products: [{ name: 'Honey', priceMinor: 900, unit: '500 g' }] },
      },
      'curator-1',
    )
    expect(tx.placeProduct.deleteMany).toHaveBeenCalledWith({ where: { placeId: 'place-1' } })
    expect(tx.placeProduct.createMany.mock.calls[0][0].data).toEqual([
      { placeId: 'place-1', sortOrder: 0, name: 'Honey', group: null, note: null, priceMinor: 900, unit: '500 g', available: true },
    ])
  })

  it('stamps closedAt once when a place closes for good, and clears it on reopening', async () => {
    tx.place.findFirst.mockResolvedValue(storedRow())
    tx.place.findUnique.mockResolvedValue({ closedAt: null })
    await apply(
      tx,
      { id: 'p', kind: 'edit', placeId: 'place-1', payload: { operatingStatus: 'permanently_closed' } },
      'c',
      { now: NOW },
    )
    expect(tx.place.update.mock.calls[0][0].data.closedAt).toBe(NOW)

    // A later edit of a closed place keeps the original date.
    const earlier = new Date('2026-06-01T00:00:00Z')
    tx = makeTx()
    tx.place.findFirst.mockResolvedValue(storedRow({ operatingStatus: 'permanently_closed' }))
    tx.place.findUnique.mockResolvedValue({ closedAt: earlier })
    await apply(tx, { id: 'p', kind: 'edit', placeId: 'place-1', payload: { summary: 'Closed.' } }, 'c', { now: NOW })
    expect(tx.place.update.mock.calls[0][0].data.closedAt).toBe(earlier)

    tx = makeTx()
    tx.place.findFirst.mockResolvedValue(storedRow({ operatingStatus: 'permanently_closed' }))
    tx.place.findUnique.mockResolvedValue({ closedAt: earlier })
    await apply(tx, { id: 'p', kind: 'edit', placeId: 'place-1', payload: { operatingStatus: 'active' } }, 'c')
    expect(tx.place.update.mock.calls[0][0].data.closedAt).toBeNull()
  })

  it('hides a place for a remove proposal', async () => {
    tx.place.findFirst.mockResolvedValue(storedRow())
    const result = await apply(tx, { id: 'p', kind: 'remove', placeId: 'place-1', payload: {} }, 'c')
    expect(result.ok).toBe(true)
    expect(tx.place.update).toHaveBeenCalledWith({
      where: { id: 'place-1' },
      data: { listingStatus: 'hidden' },
    })
  })

  it('reports a missing place for edit and remove', async () => {
    expect(await apply(tx, { id: 'p', kind: 'edit', placeId: 'gone', payload: {} }, 'c')).toEqual({
      ok: false,
      reason: 'place_missing',
    })
    tx = makeTx()
    expect(await apply(tx, { id: 'p', kind: 'remove', placeId: null, payload: {} }, 'c')).toEqual({
      ok: false,
      reason: 'place_missing',
    })
  })
})

describe('parsePhotonResponse', () => {
  it('reads towns and addresses, and skips broken features', () => {
    const hits = parsePhotonResponse({
      features: [
        {
          geometry: { coordinates: [6.6816355, 46.6012433] },
          properties: { name: 'Froideville', osm_key: 'place', state: 'Vaud', country: 'Switzerland', countrycode: 'CH', postcode: '1055' },
        },
        {
          geometry: { coordinates: [6.63, 46.52] },
          properties: { street: 'Rue du Bourg', housenumber: '4', city: 'Lausanne', country: 'Switzerland', countrycode: 'ch' },
        },
        { geometry: { coordinates: ['x', 'y'] }, properties: { name: 'Broken' } },
        { properties: { name: 'No geometry' } },
      ],
    })
    expect(hits).toEqual([
      {
        name: 'Froideville',
        context: 'Vaud, Switzerland',
        lat: 46.601243,
        lng: 6.681636,
        country: 'CH',
        city: 'Froideville',
        postcode: '1055',
        street: null,
      },
      {
        name: 'Rue du Bourg 4',
        context: 'Lausanne, Switzerland',
        lat: 46.52,
        lng: 6.63,
        country: 'CH',
        city: 'Lausanne',
        postcode: null,
        street: 'Rue du Bourg 4',
      },
    ])
    expect(parsePhotonResponse(null)).toEqual([])
    expect(parsePhotonResponse({ features: 'no' })).toEqual([])
  })
})

describe('parseNominatimResponse', () => {
  it('reads the fallback geocoder’s answers', () => {
    expect(
      parseNominatimResponse([
        {
          lat: '46.6012433',
          lon: '6.6816355',
          name: 'Froideville',
          address: { village: 'Froideville', state: 'Vaud', postcode: '1055', country: 'Switzerland', country_code: 'ch' },
        },
        { lat: 'x', lon: 'y', name: 'Broken' },
      ]),
    ).toEqual([
      {
        name: 'Froideville',
        context: 'Vaud, Switzerland',
        lat: 46.601243,
        lng: 6.681636,
        country: 'CH',
        city: 'Froideville',
        postcode: '1055',
        street: null,
      },
    ])
    expect(parseNominatimResponse({ error: 'nope' })).toEqual([])
  })
})

/* ── Research records (npm run places:import) ────────────────────────── */

describe('parseResearchRecord', () => {
  /** A record as the map research writes it (see that repository's README). */
  const record = (place: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) => ({
    status: 'verified',
    flags: [],
    place: {
      name: 'Péclôt 13',
      summary: 'Self-repair bike workshop run by an association.',
      description: 'Members repair their own bikes with shared tools and advice.',
      language: 'en',
      category: 'bike',
      operator: 'nonprofit',
      latitude: 46.19722,
      longitude: 6.13694,
      locationApproximate: false,
      address: 'Rue des Voisins 13',
      city: 'Genève',
      country: 'CH',
      website: 'https://example.org',
      contact: null,
      practicalNote: null,
      openingHours: { v: 1, mode: 'weekly', periods: [{ days: [2, 4], from: '17:00', to: '20:00' }] },
      openingNote: null,
      operatingStatus: 'active',
      currency: 'CHF',
      products: [],
      ...place,
    },
    research: {
      city: 'Genève',
      checkedOn: '2026-11-25',
      sources: ['https://example.org', ''],
      notes: 'Own site and Google agree.',
    },
    ...rest,
  })

  const importKey = (raw: unknown): string | null => {
    const parsed = parseResearchRecord(raw)
    if (typeof parsed === 'string') return parsed
    const checked = validatePlaceInput(parsed.place)
    return checked.ok ? null : checked.error.key
  }

  it('reads the status, flags and sources', () => {
    const parsed = parseResearchRecord(record({}, { status: 'flagged', flags: ['Address differs.', 7] }))
    expect(parsed).toMatchObject({
      status: 'flagged',
      flags: ['Address differs.'],
      sources: ['https://example.org'],
      city: 'Genève',
      checkedOn: '2026-11-25',
    })
  })

  it('refuses what is not a record', () => {
    expect(parseResearchRecord([])).toBe('not a research record')
    expect(parseResearchRecord(record({}, { status: 'done' }))).toBe(
      'status must be verified, flagged or rejected',
    )
  })

  it('hands over a place with a new category and an operator that passes validation', () => {
    const parsed = parseResearchRecord(record())
    if (typeof parsed === 'string') throw new Error(parsed)
    const checked = validatePlaceInput(parsed.place)
    if (!checked.ok) throw new Error(checked.error.key)
    expect(checked.data.category).toBe('bike')
    expect(checked.data.operator).toBe('nonprofit')
    // The proposal payload is this data as JSON: the operator must survive.
    expect(JSON.parse(JSON.stringify(checked.data)).operator).toBe('nonprofit')
  })

  it('accepts every new category key and a null operator', () => {
    for (const category of ['secondhand', 'mending', 'repair', 'bike', 'share']) {
      expect(importKey(record({ category, operator: null }))).toBeNull()
    }
    // A record written before the field existed.
    const older: Record<string, unknown> = { ...record().place }
    delete older.operator
    expect(importKey({ ...record(), place: older })).toBeNull()
  })

  it('reports an unknown category or operator as a problem', () => {
    expect(importKey(record({ category: 'reuse' }))).toBe('places.categoryRequired')
    expect(importKey(record({ operator: 'association' }))).toBe('places.operatorInvalid')
  })
})

/* ── Coupling: every error key the place code can produce exists in the
      English catalog (other locales are checked by i18n-catalogs.test.ts). ── */

describe('error keys', () => {
  const catalog = JSON.parse(
    readFileSync(join(process.cwd(), 'messages', 'en', 'errors.json'), 'utf8'),
  ) as Record<string, Record<string, string>>

  it('every places.* key used in the code exists in messages/en/errors.json', () => {
    const files = [
      'lib/places-shared.ts',
      'lib/opening-hours.ts',
      'lib/places.ts',
      'app/(platform)/map/actions.ts',
      'app/(public)/map/actions.ts',
      'app/(platform)/admin/places/actions.ts',
      'app/(platform)/admin/curators/actions.ts',
    ]
    const used = new Set<string>()
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      // Only catalog lookups — `key: '…'` descriptors and `t('…')` calls — not log event names.
      for (const match of source.matchAll(/(?:key:\s*|t\()'places\.([A-Za-z]+)'/g)) used.add(match[1])
    }
    expect(used.size).toBeGreaterThan(20)
    for (const key of used) {
      expect(catalog.places[key], `errors.places.${key}`).toBeTypeOf('string')
    }
  })
})
