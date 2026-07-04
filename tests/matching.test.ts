import { describe, it, expect } from 'vitest'
import {
  analyseMatch,
  cityOf,
  LANGUAGE_SKILL_TO_ISO,
  type MatchMe,
} from '@/lib/matching'

const ME: MatchMe = {
  skillNames: new Set(['Graphic design', 'Writing', 'Grant writing']),
  categories: new Set(['Creative', 'Communication', 'Finance']),
  city: 'london',
  languages: new Set(['en', 'es']),
}

const skill = (name: string, category: string) => ({ name, category })

describe('cityOf', () => {
  it('takes the first comma segment, lower-cased', () => {
    expect(cityOf('Lausanne, Switzerland')).toBe('lausanne')
    expect(cityOf('London')).toBe('london')
    expect(cityOf(null)).toBeNull()
    expect(cityOf('  , UK')).toBeNull()
  })
})

describe('analyseMatch', () => {
  it('returns null when nothing overlaps', () => {
    const r = analyseMatch(
      { skills: [skill('Carpentry', 'Trades')], remote: false, location: 'London', language: 'en' },
      ME,
    )
    expect(r).toBeNull()
  })

  it('scores direct skills at 34 and city bonus at 18', () => {
    const r = analyseMatch(
      {
        skills: [skill('Graphic design', 'Creative')],
        remote: false,
        location: 'London, United Kingdom',
        language: 'en',
      },
      ME,
    )
    expect(r).not.toBeNull()
    expect(r!.direct).toEqual(['Graphic design'])
    expect(r!.score).toBe(34 + 18)
    expect(r!.locNote).toEqual({ kind: 'near', city: 'London' })
  })

  it('scores related (same-category) skills at 14 with distance penalty', () => {
    const r = analyseMatch(
      {
        skills: [skill('Illustration', 'Creative')],
        remote: false,
        location: 'Glasgow, United Kingdom',
        language: 'en',
      },
      ME,
    )
    expect(r!.direct).toEqual([])
    expect(r!.related).toEqual(['Illustration'])
    expect(r!.score).toBe(14 - 6)
    expect(r!.locNote.kind).toBe('far')
  })

  it('remote + shared language beats remote + foreign language', () => {
    const base = { skills: [skill('Writing', 'Communication')], remote: true, location: null }
    const shared = analyseMatch({ ...base, language: 'es' }, ME)!
    const foreign = analyseMatch({ ...base, language: 'pl' }, ME)!
    expect(shared.score).toBe(34 + 18)
    expect(shared.locNote).toEqual({ kind: 'remote-lang', language: 'es' })
    expect(foreign.score).toBe(Math.max(0, 34 - 24))
    expect(foreign.locNote).toEqual({ kind: 'remote-nolang', language: 'pl' })
  })

  it('remote with unknown language is neutral', () => {
    const r = analyseMatch(
      { skills: [skill('Writing', 'Communication')], remote: true, location: null, language: null },
      ME,
    )!
    expect(r.score).toBe(34)
    expect(r.locNote).toEqual({ kind: 'remote-unknown' })
  })

  it('clamps to 0–98', () => {
    const many = ['Graphic design', 'Writing', 'Grant writing'].map((n) =>
      skill(n, 'whatever'),
    )
    const high = analyseMatch(
      { skills: many, remote: false, location: 'London', language: 'en' },
      ME,
    )!
    expect(high.score).toBe(98) // 3×34 + 18 = 120 → clamped

    const low = analyseMatch(
      {
        skills: [skill('Illustration', 'Creative')],
        remote: true,
        location: null,
        language: 'pl',
      },
      ME,
    )!
    expect(low.score).toBe(0) // 14 − 24 → clamped
  })

  it('no user city means no proximity bonus', () => {
    const noCity: MatchMe = { ...ME, city: null }
    const r = analyseMatch(
      {
        skills: [skill('Writing', 'Communication')],
        remote: false,
        location: 'London, United Kingdom',
        language: 'en',
      },
      noCity,
    )!
    expect(r.score).toBe(34 - 6)
    expect(r.locNote.kind).toBe('far')
  })
})

describe('LANGUAGE_SKILL_TO_ISO', () => {
  it('covers all 13 language skills with valid ISO codes', () => {
    expect(Object.keys(LANGUAGE_SKILL_TO_ISO)).toHaveLength(13)
    for (const code of Object.values(LANGUAGE_SKILL_TO_ISO)) {
      expect(code).toMatch(/^[a-z]{2}$/)
    }
  })
})
