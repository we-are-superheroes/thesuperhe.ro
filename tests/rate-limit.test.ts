import { describe, it, expect, vi, afterEach } from 'vitest'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit', () => {
  it('allows up to max hits then refuses', () => {
    const key = `t1-${Math.random()}`
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000).ok).toBe(true)
    const refused = rateLimit(key, 5, 60_000)
    expect(refused.ok).toBe(false)
    expect(refused.retryAfterSec).toBeGreaterThan(0)
  })

  it('isolates keys (per user, per action)', () => {
    const a = `ua-${Math.random()}`
    const b = `ub-${Math.random()}`
    for (let i = 0; i < 5; i++) rateLimit(a, 5, 60_000)
    expect(rateLimit(a, 5, 60_000).ok).toBe(false)
    expect(rateLimit(b, 5, 60_000).ok).toBe(true)
  })

  it('resets after the window rolls over', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    const key = `t2-${Math.random()}`
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000)
    expect(rateLimit(key, 3, 60_000).ok).toBe(false)
    vi.setSystemTime(1_700_000_000_000 + 61_000)
    expect(rateLimit(key, 3, 60_000).ok).toBe(true)
  })

  it('produces a rateLimited descriptor with a floor of 1 second', () => {
    expect(rateLimitError({ ok: false, retryAfterSec: 12 })).toEqual({
      key: 'common.rateLimited',
      params: { seconds: 12 },
    })
    expect(rateLimitError({ ok: false, retryAfterSec: 0 })).toEqual({
      key: 'common.rateLimited',
      params: { seconds: 1 },
    })
  })
})
