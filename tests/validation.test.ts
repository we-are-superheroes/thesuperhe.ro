import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_UPDATE_LENGTH,
  validateProjectFields,
  validateProjectStatus,
  validateUpdateBody,
  type ErrorDescriptor,
} from '@/lib/validation'
import { rateLimitError } from '@/lib/rate-limit'

/* NOTE (i18n phase 3): validators now return ErrorDescriptors (keys into
   messages/en/errors.json) instead of display strings — these tests
   assert keys/params, and a coupling block below keeps every producible
   key present in the catalog. */

const valid = {
  title: 'Pocket Forest',
  description: 'A dense native forest on a car park.',
  remote: 'yes',
  joinPolicy: 'open',
  address: '2 Wallis Road',
}

describe('validateProjectFields', () => {
  it('accepts a valid payload', () => {
    expect(validateProjectFields(valid, 'create')).toBeNull()
    expect(validateProjectFields(valid, 'update')).toBeNull()
  })

  it('requires title and description with mode-specific copy', () => {
    expect(validateProjectFields({ ...valid, title: '  ' }, 'create')).toEqual({
      key: 'projectForm.titleRequiredCreate',
    })
    expect(validateProjectFields({ ...valid, title: '' }, 'update')).toEqual({
      key: 'projectForm.titleRequired',
    })
    expect(validateProjectFields({ ...valid, description: '' }, 'create')).toEqual({
      key: 'projectForm.descriptionRequiredCreate',
    })
  })

  it('enforces length caps', () => {
    expect(validateProjectFields({ ...valid, title: 'x'.repeat(201) }, 'create')).toEqual({
      key: 'projectForm.titleTooLong',
    })
    expect(validateProjectFields({ ...valid, address: 'x'.repeat(501) }, 'update')).toEqual({
      key: 'projectForm.addressTooLong',
    })
    expect(validateProjectFields({ ...valid, address: 'x'.repeat(500) }, 'update')).toBeNull()
  })

  it('rejects invalid enums', () => {
    expect(validateProjectFields({ ...valid, remote: 'maybe' }, 'create')).toEqual({
      key: 'projectForm.remoteRequired',
    })
    expect(validateProjectFields({ ...valid, joinPolicy: 'invite_only' }, 'create')).toEqual({
      key: 'projectForm.joinPolicyRequired',
    })
  })
})

describe('validateProjectStatus', () => {
  it('accepts the four live statuses and nothing else', () => {
    for (const s of ['defining', 'needs_help', 'in_progress', 'completed'] as const) {
      expect(validateProjectStatus(s)).toBeNull()
    }
    // @ts-expect-error — deliberately invalid
    expect(validateProjectStatus('archived')).toEqual({ key: 'projectForm.statusRequired' })
  })
})

describe('validateUpdateBody', () => {
  it('trims and accepts normal text', () => {
    const r = validateUpdateBody('  hello world  ')
    expect(r).toEqual({ ok: true, body: 'hello world' })
  })
  it('rejects empty and over-length bodies', () => {
    const empty = validateUpdateBody('   ')
    expect(empty).toEqual({ ok: false, error: { key: 'updates.bodyRequired' } })
    const over = validateUpdateBody('x'.repeat(MAX_UPDATE_LENGTH + 1))
    expect(over).toEqual({
      ok: false,
      error: { key: 'updates.bodyTooLong', params: { max: MAX_UPDATE_LENGTH } },
    })
    expect(validateUpdateBody('x'.repeat(MAX_UPDATE_LENGTH)).ok).toBe(true)
  })
})

/* ── Coupling: every key a validator can produce exists in errors.json ── */

describe('descriptor keys exist in messages/en/errors.json', () => {
  const catalog = JSON.parse(
    readFileSync(join(__dirname, '..', 'messages', 'en', 'errors.json'), 'utf8'),
  ) as Record<string, unknown>

  const hasKey = (path: string): boolean => {
    let node: unknown = catalog
    for (const part of path.split('.')) {
      if (typeof node !== 'object' || node === null || !(part in node)) return false
      node = (node as Record<string, unknown>)[part]
    }
    return typeof node === 'string'
  }

  const producible: (ErrorDescriptor | null)[] = [
    validateProjectFields({ ...valid, title: '' }, 'create'),
    validateProjectFields({ ...valid, title: '' }, 'update'),
    validateProjectFields({ ...valid, title: 'x'.repeat(201) }, 'create'),
    validateProjectFields({ ...valid, description: '' }, 'create'),
    validateProjectFields({ ...valid, description: '' }, 'update'),
    validateProjectFields({ ...valid, remote: 'maybe' }, 'create'),
    validateProjectFields({ ...valid, joinPolicy: 'bad' }, 'create'),
    validateProjectFields({ ...valid, address: 'x'.repeat(501) }, 'create'),
    // @ts-expect-error — deliberately invalid
    validateProjectStatus('archived'),
    (() => {
      const r = validateUpdateBody('')
      return r.ok ? null : r.error
    })(),
    (() => {
      const r = validateUpdateBody('x'.repeat(MAX_UPDATE_LENGTH + 1))
      return r.ok ? null : r.error
    })(),
    rateLimitError({ ok: false, retryAfterSec: 12 }),
  ]

  it('covers every descriptor', () => {
    for (const desc of producible) {
      expect(desc, 'test setup should produce a descriptor').not.toBeNull()
      expect(hasKey(desc!.key), `missing errors.json key: ${desc!.key}`).toBe(true)
    }
  })
})
