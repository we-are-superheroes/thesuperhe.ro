import { describe, it, expect, vi, beforeEach } from 'vitest'

/* Automatic translation of map places: the pure helpers (what is
   translated, the source hash, checking the model's reply, laying a
   translation over a place) and the read path in lib/places.ts, run
   against a stubbed database. No test calls the Claude API. */

const dbStub = vi.hoisted(() => ({
  place: { findMany: vi.fn(), findFirst: vi.fn() },
  placeTranslation: { findMany: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: dbStub }))

import {
  PLACE_TEXT_FIELDS,
  buildTranslationRequest,
  hasTranslatedText,
  parseTranslationReply,
  placeSourceHash,
  placeTargetLocales,
  placeTerms,
  readStoredTranslation,
  translatePlaceTexts,
  type PlaceTexts,
  type StoredPlaceTranslation,
} from '@/lib/place-translation'
import { findPlacesNear, getPlaceDetailView } from '@/lib/places'
import { SUPPORTED_LOCALES } from '@/lib/locale-shared'

const texts: PlaceTexts = {
  summary: 'Farm stall with vegetables and eggs.',
  description: 'Open all year.\nPay in the box.',
  practicalNote: null,
  openingNote: 'Closed when it snows.',
  statusNote: null,
  products: [
    { name: 'Eggs', group: 'From the farm', note: null, unit: '6 eggs' },
    { name: 'Apple juice', group: 'From the farm', note: 'from next door', unit: '1 l' },
    { name: 'Honey', group: null, note: null, unit: '500' },
  ],
}

const french: StoredPlaceTranslation = {
  fields: {
    summary: 'Stand de ferme avec légumes et œufs.',
    description: 'Ouvert toute l’année.\nPayez dans la boîte.',
    openingNote: 'Fermé quand il neige.',
  },
  terms: {
    Eggs: 'Œufs',
    'From the farm': 'De la ferme',
    '6 eggs': '6 œufs',
    'Apple juice': 'Jus de pomme',
    'from next door': 'de la ferme voisine',
    '1 l': '1 l',
    Honey: 'Miel',
  },
}

describe('placeTerms', () => {
  it('lists each price-list text once and skips texts without letters', () => {
    expect(placeTerms(texts)).toEqual([
      'From the farm',
      'Eggs',
      '6 eggs',
      'Apple juice',
      'from next door',
      '1 l',
      'Honey',
    ])
  })
})

describe('placeSourceHash', () => {
  it('is stable, and ignores the order of the price list', () => {
    const reordered = { ...texts, products: [...texts.products].reverse() }
    expect(placeSourceHash(texts)).toBe(placeSourceHash({ ...texts }))
    expect(placeSourceHash(reordered)).toBe(placeSourceHash(texts))
  })

  it('changes when any translated text changes', () => {
    const base = placeSourceHash(texts)
    expect(placeSourceHash({ ...texts, summary: 'Farm stall.' })).not.toBe(base)
    expect(placeSourceHash({ ...texts, statusNote: 'Back in May.' })).not.toBe(base)
    expect(
      placeSourceHash({ ...texts, products: [{ name: 'Milk', group: null, note: null, unit: null }] }),
    ).not.toBe(base)
  })

  it('tells fields apart: the same words in another field are a different source', () => {
    const a = { ...texts, practicalNote: 'Cash only.', openingNote: null }
    const b = { ...texts, practicalNote: null, openingNote: 'Cash only.' }
    expect(placeSourceHash(a)).not.toBe(placeSourceHash(b))
  })
})

describe('placeTargetLocales', () => {
  it('leaves out the language the place is written in', () => {
    expect(placeTargetLocales('fr')).toEqual(SUPPORTED_LOCALES.filter((l) => l !== 'fr'))
  })

  it('targets every language when the source language is unknown or not ours', () => {
    expect(placeTargetLocales(null)).toEqual([...SUPPORTED_LOCALES])
    expect(placeTargetLocales('nl')).toEqual([...SUPPORTED_LOCALES])
  })
})

describe('buildTranslationRequest', () => {
  it('sends the filled text fields and numbered price-list texts', () => {
    const request = buildTranslationRequest(texts)
    expect(Object.keys(request)).toEqual([
      'summary',
      'description',
      'openingNote',
      'term_1',
      'term_2',
      'term_3',
      'term_4',
      'term_5',
      'term_6',
      'term_7',
    ])
    expect(request.term_1).toBe('From the farm')
  })

  it('never sends the name, address or contact of a place', () => {
    expect(PLACE_TEXT_FIELDS).not.toContain('name')
    expect(PLACE_TEXT_FIELDS).not.toContain('address')
    expect(PLACE_TEXT_FIELDS).not.toContain('contact')
  })
})

describe('parseTranslationReply', () => {
  const request = { summary: 'Farm stall.', term_1: 'Eggs' }

  it('accepts a complete reply and stores terms by their source text', () => {
    const parsed = parseTranslationReply(
      request,
      { language: 'EN', texts: { summary: ' Stand de ferme. ', term_1: 'Œufs' } },
      'fr',
    )
    expect(parsed).toEqual({
      ok: true,
      sourceLanguage: 'en',
      sameLanguage: false,
      stored: { fields: { summary: 'Stand de ferme.' }, terms: { Eggs: 'Œufs' } },
    })
  })

  it('accepts an empty reply only when the text is already in the target language', () => {
    const same = parseTranslationReply(request, { language: 'fr', texts: {} }, 'fr')
    expect(same.ok && same.sameLanguage).toBe(true)
    const lazy = parseTranslationReply(request, { language: 'en', texts: {} }, 'fr')
    expect(lazy.ok).toBe(false)
  })

  it('rejects missing, extra, empty and non-string values', () => {
    const problems = (reply: unknown) => {
      const parsed = parseTranslationReply(request, reply, 'fr')
      return parsed.ok ? [] : parsed.errors
    }
    expect(problems('nope')).toHaveLength(1)
    expect(problems({ language: 'en' })).toHaveLength(1)
    expect(problems({ language: 'en', texts: { summary: 'Stand.' } })).toEqual(['missing key "term_1"'])
    expect(problems({ language: 'en', texts: { summary: 'Stand.', term_1: 'Œufs', name: 'x' } })).toEqual([
      'unexpected key "name"',
    ])
    expect(problems({ language: 'en', texts: { summary: '  ', term_1: 7 } })).toHaveLength(2)
  })

  it('keeps going without a usable language code', () => {
    const parsed = parseTranslationReply(
      request,
      { language: 'English, I think', texts: { summary: 'Stand.', term_1: 'Œufs' } },
      'fr',
    )
    expect(parsed.ok && parsed.sourceLanguage).toBeNull()
  })
})

describe('readStoredTranslation', () => {
  it('reads the stored shape and drops unknown fields', () => {
    expect(
      readStoredTranslation({ fields: { summary: 'Stand.', name: 'x' }, terms: { Eggs: 'Œufs' } }),
    ).toEqual({ fields: { summary: 'Stand.' }, terms: { Eggs: 'Œufs' } })
  })

  it('returns null for anything else', () => {
    expect(readStoredTranslation(null)).toBeNull()
    expect(readStoredTranslation([])).toBeNull()
    expect(readStoredTranslation({ fields: {} })).toBeNull()
    expect(readStoredTranslation({ fields: { summary: 1 }, terms: {} })).toBeNull()
  })

  it('knows an empty translation (place already in this language)', () => {
    expect(hasTranslatedText({ fields: {}, terms: {} })).toBe(false)
    expect(hasTranslatedText(french)).toBe(true)
  })
})

describe('translatePlaceTexts', () => {
  it('lays the translation over the place and keeps empty fields empty', () => {
    const shown = translatePlaceTexts(texts, french)
    expect(shown.summary).toBe('Stand de ferme avec légumes et œufs.')
    expect(shown.practicalNote).toBeNull()
    expect(shown.products[0]).toEqual({ name: 'Œufs', group: 'De la ferme', note: null, unit: '6 œufs' })
    expect(shown.products[2]).toEqual({ name: 'Miel', group: null, note: null, unit: '500' })
  })

  it('leaves a text without a translation as it was written', () => {
    const shown = translatePlaceTexts(texts, { fields: {}, terms: { Eggs: 'Œufs' } })
    expect(shown.summary).toBe(texts.summary)
    expect(shown.products[1].name).toBe('Apple juice')
  })
})

/* ── The read path ───────────────────────────────────────────────────── */

const CENTRE = { lat: 46.6, lng: 6.68 }

const row = {
  id: 'place-1',
  slug: 'la-cabane-froideville',
  name: 'La Cabane à Légumes',
  ...texts,
  language: 'en',
  category: 'farm',
  latitude: 46.6012,
  longitude: 6.6816,
  locationApproximate: false,
  address: 'Chemin du Verger',
  city: 'Froideville',
  country: 'CH',
  website: null,
  contact: null,
  openingHours: null,
  timezone: 'Europe/Zurich',
  operatingStatus: 'active',
  reopensOn: null,
  currency: 'CHF',
  closedAt: null,
  lastVerifiedAt: null,
  updatedAt: new Date('2026-11-20T10:00:00Z'),
  projectId: null,
  project: null,
  products: texts.products.map((product, index) => ({
    ...product,
    id: `product-${index}`,
    priceMinor: 450,
    available: true,
    updatedAt: new Date('2026-11-20T10:00:00Z'),
  })),
}

const translationRow = (overrides: Record<string, unknown> = {}) => ({
  placeId: 'place-1',
  sourceHash: placeSourceHash(texts),
  sourceLanguage: 'en',
  texts: french,
  ...overrides,
})

beforeEach(() => {
  dbStub.place.findMany.mockReset().mockResolvedValue([row])
  dbStub.place.findFirst.mockReset().mockResolvedValue(row)
  dbStub.placeTranslation.findMany.mockReset().mockResolvedValue([translationRow()])
})

describe('findPlacesNear with a locale', () => {
  it('shows the translation and lets a search match either language', async () => {
    const [place] = await findPlacesNear(CENTRE, 25, 'fr')
    expect(place.summary).toBe('Stand de ferme avec légumes et œufs.')
    expect(place.openingNote).toBe('Fermé quand il neige.')
    expect(place.name).toBe('La Cabane à Légumes')
    expect(place.productNames).toEqual(expect.arrayContaining(['Œufs', 'Eggs']))
    expect(dbStub.placeTranslation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { placeId: { in: ['place-1'] }, locale: 'fr' } }),
    )
  })

  it('shows the original when the place changed after it was translated', async () => {
    dbStub.placeTranslation.findMany.mockResolvedValue([translationRow({ sourceHash: 'older-text' })])
    const [place] = await findPlacesNear(CENTRE, 25, 'fr')
    expect(place.summary).toBe(texts.summary)
  })

  it('does not look for translations without a locale, or for one we do not support', async () => {
    expect((await findPlacesNear(CENTRE, 25))[0].summary).toBe(texts.summary)
    expect((await findPlacesNear(CENTRE, 25, 'nl'))[0].summary).toBe(texts.summary)
    expect(dbStub.placeTranslation.findMany).not.toHaveBeenCalled()
  })

  it('still shows the map when translations cannot be read', async () => {
    dbStub.placeTranslation.findMany.mockRejectedValue(new Error('relation does not exist'))
    const [place] = await findPlacesNear(CENTRE, 25, 'fr')
    expect(place.summary).toBe(texts.summary)
  })
})

describe('getPlaceDetailView with a locale', () => {
  it('returns the translated texts together with the original', async () => {
    const detail = await getPlaceDetailView('la-cabane-froideville', 'fr')
    expect(detail?.description).toBe('Ouvert toute l’année.\nPayez dans la boîte.')
    expect(detail?.products[0]).toMatchObject({ id: 'product-0', name: 'Œufs', unit: '6 œufs', priceMinor: 450 })
    expect(detail?.translation?.from).toBe('en')
    expect(detail?.translation?.original.summary).toBe(texts.summary)
    expect(detail?.translation?.original.products[0].name).toBe('Eggs')
  })

  it('marks nothing as translated when there is no current translation', async () => {
    dbStub.placeTranslation.findMany.mockResolvedValue([])
    const detail = await getPlaceDetailView('la-cabane-froideville', 'fr')
    expect(detail?.summary).toBe(texts.summary)
    expect(detail?.translation).toBeNull()
  })

  it('treats an empty stored translation as "already in this language"', async () => {
    dbStub.placeTranslation.findMany.mockResolvedValue([
      translationRow({ texts: { fields: {}, terms: {} } }),
    ])
    const detail = await getPlaceDetailView('la-cabane-froideville', 'fr')
    expect(detail?.translation).toBeNull()
  })
})
