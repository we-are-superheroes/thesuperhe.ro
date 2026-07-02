import 'server-only'

/* ================================================================
   Lightweight fixed-window rate limiter for server actions.

   In-memory and per-instance: on Vercel each warm lambda keeps its
   own counters, so the effective ceiling is (limit × instances).
   That's fine for the current goal — stopping notification-spam
   loops from a single client — and costs no infrastructure. If the
   platform outgrows it, swap the Map for Upstash Redis
   (@upstash/ratelimit) behind this same function signature.
   ================================================================ */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

// Opportunistic cleanup so long-lived instances don't accumulate keys.
const SWEEP_EVERY = 500
let opsSinceSweep = 0

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the window resets — for friendly error copy. */
  retryAfterSec: number
}

/**
 * Count one hit for `key` (e.g. `${userId}:join-project`) against a fixed
 * window of `max` hits per `windowMs`.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (++opsSinceSweep >= SWEEP_EVERY) {
    opsSinceSweep = 0
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k)
    }
  }

  const current = windows.get(key)
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }

  current.count += 1
  if (current.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((current.resetAt - now) / 1000) }
  }
  return { ok: true, retryAfterSec: 0 }
}

/** Standard friendly refusal for rate-limited server actions. */
export function rateLimitError(result: RateLimitResult): string {
  return `Slow down a little — try again in ${Math.max(result.retryAfterSec, 1)}s.`
}
