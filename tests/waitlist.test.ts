import { describe, it, expect, vi, beforeEach } from 'vitest'

/* Service-level tests for the double-opt-in state machine. db, email and
   next-intl are mocked — we assert the branches, not the DB. */

// Hoisted so the vi.mock factories (which are hoisted above imports) can
// safely reference these spies.
const { findUnique, create, update, sendEmail } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { waitlistSubscriber: { findUnique, create, update } },
}))
vi.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock('next-intl/server', () => ({
  // Translator stub: returns the key so email composition doesn't need catalogs.
  getTranslations: async () => (key: string) => key,
}))

import {
  requestWaitlistConfirmation,
  confirmWaitlist,
  unsubscribeWaitlist,
} from '@/lib/waitlist'

beforeEach(() => {
  findUnique.mockReset()
  create.mockReset().mockResolvedValue({})
  update.mockReset().mockResolvedValue({})
  sendEmail.mockReset().mockResolvedValue({ ok: true, id: null })
})

const base = { email: 'a@example.com', locale: 'en', source: 'home', consentText: 'consent' }

describe('requestWaitlistConfirmation', () => {
  it('creates a pending subscriber and emails a confirmation for a new address', async () => {
    findUnique.mockResolvedValue(null)
    await requestWaitlistConfirmation(base)

    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0].data
    expect(data.status).toBe('pending')
    expect(data.email).toBe('a@example.com')
    expect(data.confirmToken).toBeTruthy()
    expect(data.unsubscribeToken).toBeTruthy()
    expect(data.consentedAt).toBeInstanceOf(Date)
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('is a no-op for an already-confirmed address (no leak, no email)', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'confirmed', unsubscribeToken: 'u' })
    await requestWaitlistConfirmation(base)

    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('re-sends to a pending address, reusing the stable unsubscribe token', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'pending', unsubscribeToken: 'keep-me' })
    await requestWaitlistConfirmation(base)

    expect(update).toHaveBeenCalledOnce()
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('pending')
    expect(data.confirmToken).toBeTruthy()
    expect(data.unsubscribedAt).toBeNull()
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('re-opts-in a previously unsubscribed address', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'unsubscribed', unsubscribeToken: 'keep-me' })
    await requestWaitlistConfirmation(base)

    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].data.status).toBe('pending')
    expect(sendEmail).toHaveBeenCalledOnce()
  })
})

describe('confirmWaitlist', () => {
  it('returns invalid for an empty or unknown token', async () => {
    expect(await confirmWaitlist('')).toBe('invalid')
    findUnique.mockResolvedValue(null)
    expect(await confirmWaitlist('nope')).toBe('invalid')
  })

  it('returns already when the row is confirmed', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'confirmed' })
    expect(await confirmWaitlist('t')).toBe('already')
    expect(update).not.toHaveBeenCalled()
  })

  it('confirms a pending row and clears the token', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'pending' })
    expect(await confirmWaitlist('t')).toBe('confirmed')
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('confirmed')
    expect(data.confirmToken).toBeNull()
    expect(data.confirmedAt).toBeInstanceOf(Date)
  })
})

describe('unsubscribeWaitlist', () => {
  it('returns invalid for an empty or unknown token', async () => {
    expect(await unsubscribeWaitlist('')).toBe('invalid')
    findUnique.mockResolvedValue(null)
    expect(await unsubscribeWaitlist('nope')).toBe('invalid')
  })

  it('unsubscribes a known token', async () => {
    findUnique.mockResolvedValue({ id: '1' })
    expect(await unsubscribeWaitlist('t')).toBe('ok')
    expect(update.mock.calls[0][0].data.status).toBe('unsubscribed')
  })
})
