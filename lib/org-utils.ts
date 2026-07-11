/* ================================================================
   Organisations — pure helpers (no DB, no server-only) so they can
   be unit-tested directly. Query logic lives in lib/orgs.ts.
   ================================================================ */

import type { OrgType, OrgRole } from '@prisma/client'

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  nonprofit: 'Non-profit',
  company: 'Company',
}

/** Admin powers: the creator keeps `owner`; promoted members get `admin`. */
export function isOrgAdminRole(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** URL slug from an org name: lowercase, ASCII, hyphen-separated. */
export function slugifyOrgName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'org'
}

/**
 * Human-shareable invite code: an org-derived prefix plus a random block,
 * e.g. "HACK-REWILD-9F2K". The random part is injected so tests can pin it.
 */
export function buildInviteCode(orgName: string, randomBlock: string): string {
  const words = orgName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const prefix = words
    .slice(0, 2)
    .map((w) => w.slice(0, 6))
    .join('-')
  return `${prefix || 'ORG'}-${randomBlock}`
}

/** Characters that are unambiguous when read aloud or retyped. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomCodeBlock(length = 4): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

export interface InviteCheck {
  revokedAt: Date | null
  expiresAt: Date | null
  maxUses: number | null
  useCount: number
  email: string | null
}

/**
 * Why an invite cannot be redeemed, or null if it can. Targeted invites
 * (email set) only work for the matching account.
 */
export function inviteProblem(
  invite: InviteCheck,
  now: Date,
  userEmail?: string,
): string | null {
  if (invite.revokedAt) return 'This invite code has been cancelled.'
  if (invite.expiresAt && invite.expiresAt < now) {
    return 'This invite code has expired.'
  }
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
    return 'This invite code has been used the maximum number of times.'
  }
  if (
    invite.email &&
    invite.email.toLowerCase() !== (userEmail ?? '').toLowerCase()
  ) {
    return 'This invite was sent to a different email address.'
  }
  return null
}
