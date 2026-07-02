import { describe, it, expect } from 'vitest'
import {
  MAX_UPDATE_LENGTH,
  validateProjectFields,
  validateProjectStatus,
  validateUpdateBody,
} from '@/lib/validation'

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
    expect(validateProjectFields({ ...valid, title: '  ' }, 'create')).toMatch(/title/i)
    expect(validateProjectFields({ ...valid, title: '' }, 'update')).toBe('Title can’t be empty.')
    expect(validateProjectFields({ ...valid, description: '' }, 'create')).toMatch(/description/i)
  })

  it('enforces length caps', () => {
    expect(validateProjectFields({ ...valid, title: 'x'.repeat(201) }, 'create')).toBe(
      'Title is too long.',
    )
    expect(validateProjectFields({ ...valid, address: 'x'.repeat(501) }, 'update')).toBe(
      'Address is too long.',
    )
    expect(validateProjectFields({ ...valid, address: 'x'.repeat(500) }, 'update')).toBeNull()
  })

  it('rejects invalid enums', () => {
    expect(validateProjectFields({ ...valid, remote: 'maybe' }, 'create')).toBe(
      'Pick a remote option.',
    )
    expect(validateProjectFields({ ...valid, joinPolicy: 'invite_only' }, 'create')).toBe(
      'Pick a join policy.',
    )
  })
})

describe('validateProjectStatus', () => {
  it('accepts the four live statuses and nothing else', () => {
    for (const s of ['defining', 'needs_help', 'in_progress', 'completed'] as const) {
      expect(validateProjectStatus(s)).toBeNull()
    }
    // @ts-expect-error — deliberately invalid
    expect(validateProjectStatus('archived')).toBe('Pick a project status.')
  })
})

describe('validateUpdateBody', () => {
  it('trims and accepts normal text', () => {
    const r = validateUpdateBody('  hello world  ')
    expect(r).toEqual({ ok: true, body: 'hello world' })
  })
  it('rejects empty and over-length bodies', () => {
    expect(validateUpdateBody('   ').ok).toBe(false)
    expect(validateUpdateBody('x'.repeat(MAX_UPDATE_LENGTH + 1)).ok).toBe(false)
    expect(validateUpdateBody('x'.repeat(MAX_UPDATE_LENGTH)).ok).toBe(true)
  })
})
