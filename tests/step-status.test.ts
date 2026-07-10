import { describe, it, expect } from 'vitest'
import { normaliseStepStatus, impliedHelpWanted } from '@/lib/step-status'

describe('normaliseStepStatus', () => {
  it('passes live statuses through', () => {
    expect(normaliseStepStatus('open')).toBe('open')
    expect(normaliseStepStatus('in_progress')).toBe('in_progress')
    expect(normaliseStepStatus('completed')).toBe('completed')
  })

  it('maps legacy defining to open', () => {
    expect(normaliseStepStatus('defining')).toBe('open')
    expect(normaliseStepStatus('defining', true)).toBe('open')
  })

  it('maps legacy needs_help by joiner presence', () => {
    expect(normaliseStepStatus('needs_help', true)).toBe('in_progress')
    expect(normaliseStepStatus('needs_help', false)).toBe('open')
  })

  it('falls back to open for unknown values', () => {
    expect(normaliseStepStatus('')).toBe('open')
  })
})

describe('impliedHelpWanted', () => {
  it('is true only for legacy needs_help', () => {
    expect(impliedHelpWanted('needs_help')).toBe(true)
    expect(impliedHelpWanted('open')).toBe(false)
    expect(impliedHelpWanted('completed')).toBe(false)
  })
})
