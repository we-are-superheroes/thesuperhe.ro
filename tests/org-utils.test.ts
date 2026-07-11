import { describe, it, expect } from 'vitest'
import {
  slugifyOrgName,
  buildInviteCode,
  randomCodeBlock,
  inviteProblem,
  isOrgAdminRole,
  ORG_TYPE_LABEL,
  type InviteCheck,
} from '@/lib/org-utils'

describe('slugifyOrgName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyOrgName('Hackney Rewilders')).toBe('hackney-rewilders')
  })

  it('strips diacritics and punctuation', () => {
    expect(slugifyOrgName('Café Réparation — Genève!')).toBe('cafe-reparation-geneve')
  })

  it('trims leading/trailing separators', () => {
    expect(slugifyOrgName('  ***Birchwald AG***  ')).toBe('birchwald-ag')
  })

  it('falls back for unusable names', () => {
    expect(slugifyOrgName('!!!')).toBe('org')
  })

  it('caps length at 60 without a trailing hyphen', () => {
    const slug = slugifyOrgName('a'.repeat(59) + ' b')
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('buildInviteCode', () => {
  it('prefixes with the first two words, capped at 6 letters each', () => {
    expect(buildInviteCode('Hackney Rewilders', '9F2K')).toBe('HACKNE-REWILD-9F2K')
  })

  it('handles single-word names', () => {
    expect(buildInviteCode('Birchwald', 'K4TN')).toBe('BIRCHW-K4TN')
  })

  it('falls back to ORG for unusable names', () => {
    expect(buildInviteCode('***', 'AAAA')).toBe('ORG-AAAA')
  })
})

describe('randomCodeBlock', () => {
  it('produces the requested length from the safe alphabet', () => {
    const block = randomCodeBlock(6)
    expect(block).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('inviteProblem', () => {
  const now = new Date('2026-07-08T12:00:00Z')
  const base: InviteCheck = {
    revokedAt: null,
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    email: null,
  }

  it('accepts a plain open code', () => {
    expect(inviteProblem(base, now)).toBeNull()
  })

  it('rejects revoked codes', () => {
    expect(inviteProblem({ ...base, revokedAt: new Date() }, now)).toMatch(/cancelled/)
  })

  it('rejects expired codes but accepts unexpired ones', () => {
    expect(
      inviteProblem({ ...base, expiresAt: new Date('2026-07-01') }, now),
    ).toMatch(/expired/)
    expect(
      inviteProblem({ ...base, expiresAt: new Date('2026-08-01') }, now),
    ).toBeNull()
  })

  it('rejects exhausted codes at exactly maxUses', () => {
    expect(inviteProblem({ ...base, maxUses: 5, useCount: 5 }, now)).toMatch(/maximum/)
    expect(inviteProblem({ ...base, maxUses: 5, useCount: 4 }, now)).toBeNull()
  })

  it('matches targeted invites case-insensitively', () => {
    const targeted = { ...base, email: 'Nadine@Birchwald.ch' }
    expect(inviteProblem(targeted, now, 'nadine@birchwald.ch')).toBeNull()
    expect(inviteProblem(targeted, now, 'other@birchwald.ch')).toMatch(/different email/)
    expect(inviteProblem(targeted, now, undefined)).toMatch(/different email/)
  })

  it('reports revocation before expiry when both apply', () => {
    expect(
      inviteProblem(
        { ...base, revokedAt: new Date(), expiresAt: new Date('2026-01-01') },
        now,
      ),
    ).toMatch(/cancelled/)
  })
})

describe('role helpers', () => {
  it('treats owner and admin as admins, member as not', () => {
    expect(isOrgAdminRole('owner')).toBe(true)
    expect(isOrgAdminRole('admin')).toBe(true)
    expect(isOrgAdminRole('member')).toBe(false)
  })

  it('labels both org types', () => {
    expect(ORG_TYPE_LABEL.nonprofit).toBe('Non-profit')
    expect(ORG_TYPE_LABEL.company).toBe('Company')
  })
})
