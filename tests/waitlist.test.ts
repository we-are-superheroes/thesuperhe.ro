import { describe, it, expect, vi, beforeEach } from 'vitest'

/* Service-level tests for the double-opt-in state machine. db, email and
   next-intl are mocked — we assert the branches, not the DB. */

// Hoisted so the vi.mock factories (which are hoisted above imports) can
// safely reference these spies.
const { findUnique, create, update, remove, sendEmail } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { waitlistSubscriber: { findUnique, create, update, delete: remove } },
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
  WAITLIST_RESEND_WINDOW_MS,
} from '@/lib/waitlist'

beforeEach(() => {
  findUnique.mockReset()
  create.mockReset().mockResolvedValue({ id: 'new-id' })
  update.mockReset().mockResolvedValue({})
  remove.mockReset().mockResolvedValue({})
  sendEmail.mockReset().mockResolvedValue({ ok: true, id: null })
})

const base = { email: 'a@example.com', locale: 'en', source: 'home', consentText: 'consent' }

const longAgo = () => new Date(Date.now() - WAITLIST_RESEND_WINDOW_MS - 60_000)
const justNow = () => new Date(Date.now() - 30_000)

/** The HTML of the e-mail handed to the provider in the n-th send. */
const sentHtml = (n = 0): string => sendEmail.mock.calls[n][0].html

describe('requestWaitlistConfirmation', () => {
  it('creates a pending subscriber and emails a confirmation for a new address', async () => {
    findUnique.mockResolvedValue(null)
    expect(await requestWaitlistConfirmation(base)).toBe('sent')

    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0].data
    expect(data.status).toBe('pending')
    expect(data.email).toBe('a@example.com')
    expect(data.confirmToken).toBeTruthy()
    expect(data.unsubscribeToken).toBeTruthy()
    expect(data.consentText).toBe('consent')
    expect(data.consentedAt).toBeInstanceOf(Date)
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('links to the button pages, never to a URL that acts on GET', async () => {
    findUnique.mockResolvedValue(null)
    await requestWaitlistConfirmation(base)

    const html = sentHtml()
    expect(html).toContain('/waitlist/confirm?token=')
    expect(html).toContain('/waitlist/unsubscribe?token=')
    expect(html).not.toContain('/api/waitlist/')
    // The one-click header is the only place the API endpoint appears.
    const headers = sendEmail.mock.calls[0][0].headers
    expect(headers['List-Unsubscribe']).toContain('/api/waitlist/unsubscribe?token=')
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('is a no-op for an already-confirmed address (no leak, no email)', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'confirmed', unsubscribeToken: 'u' })
    expect(await requestWaitlistConfirmation(base)).toBe('noop')

    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('throttles a pending address that was e-mailed within the window', async () => {
    findUnique.mockResolvedValue({
      id: '1',
      status: 'pending',
      confirmToken: 'tok',
      unsubscribeToken: 'u',
      consentedAt: justNow(),
    })
    expect(await requestWaitlistConfirmation(base)).toBe('throttled')

    expect(update).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('re-sends to a pending address after the window, keeping the same confirm link', async () => {
    findUnique.mockResolvedValue({
      id: '1',
      status: 'pending',
      confirmToken: 'stable-token',
      unsubscribeToken: 'keep-me',
      consentedAt: longAgo(),
    })
    expect(await requestWaitlistConfirmation(base)).toBe('sent')

    expect(update).toHaveBeenCalledOnce()
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('pending')
    // Same token → the link in the earlier e-mail still works.
    expect(data.confirmToken).toBe('stable-token')
    expect(data.unsubscribedAt).toBeNull()
    expect(sentHtml()).toContain('/waitlist/confirm?token=stable-token')
    expect(sentHtml()).toContain('/waitlist/unsubscribe?token=keep-me')
  })

  it('stores the signup country and browser languages on a new row', async () => {
    findUnique.mockResolvedValue(null)
    await requestWaitlistConfirmation({ ...base, country: 'CH', acceptLanguage: 'fr-CH,fr' })

    const data = create.mock.calls[0][0].data
    expect(data.country).toBe('CH')
    expect(data.acceptLanguage).toBe('fr-CH,fr')
  })

  it('does not wipe a known country when a later request has none', async () => {
    findUnique.mockResolvedValue({
      id: '1',
      status: 'pending',
      confirmToken: 'tok',
      unsubscribeToken: 'u',
      consentedAt: longAgo(),
    })
    await requestWaitlistConfirmation(base)

    const data = update.mock.calls[0][0].data
    expect('country' in data).toBe(false)
    expect('acceptLanguage' in data).toBe(false)
  })

  it('re-opts-in a previously unsubscribed address with a fresh token', async () => {
    findUnique.mockResolvedValue({
      id: '1',
      status: 'unsubscribed',
      confirmToken: null,
      unsubscribeToken: 'keep-me',
      consentedAt: justNow(),
    })
    expect(await requestWaitlistConfirmation(base)).toBe('sent')

    expect(update).toHaveBeenCalledOnce()
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('pending')
    expect(data.confirmToken).toBeTruthy()
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('removes a new row when the confirmation could not be sent', async () => {
    findUnique.mockResolvedValue(null)
    sendEmail.mockResolvedValue({ ok: false, error: 'provider down' })
    expect(await requestWaitlistConfirmation(base)).toBe('send_failed')

    expect(remove).toHaveBeenCalledWith({ where: { id: 'new-id' } })
  })

  it('puts the resend clock back when a re-send fails, so a retry is not throttled', async () => {
    const previous = longAgo()
    findUnique.mockResolvedValue({
      id: '1',
      status: 'pending',
      confirmToken: 'tok',
      unsubscribeToken: 'u',
      consentedAt: previous,
    })
    sendEmail.mockResolvedValue({ ok: false, error: 'provider down' })
    expect(await requestWaitlistConfirmation(base)).toBe('send_failed')

    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1][0].data).toEqual({ consentedAt: previous })
  })

  it('treats a lost create race as throttled (the other request is sending)', async () => {
    findUnique.mockResolvedValue(null)
    create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    expect(await requestWaitlistConfirmation(base)).toBe('throttled')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('confirmWaitlist', () => {
  it('returns invalid for an empty or unknown token', async () => {
    expect(await confirmWaitlist('')).toBe('invalid')
    findUnique.mockResolvedValue(null)
    expect(await confirmWaitlist('nope')).toBe('invalid')
  })

  it('confirms a pending row and keeps its token', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'pending' })
    expect(await confirmWaitlist('t')).toBe('confirmed')
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('confirmed')
    expect(data.confirmedAt).toBeInstanceOf(Date)
    // Not cleared: a second click must find the row and say "already".
    expect('confirmToken' in data).toBe(false)
  })

  it('reports already-confirmed on a second click of the same link', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'confirmed' })
    expect(await confirmWaitlist('t')).toBe('already')
    expect(update).not.toHaveBeenCalled()
  })

  it('does not confirm a row in any other state', async () => {
    findUnique.mockResolvedValue({ id: '1', status: 'unsubscribed' })
    expect(await confirmWaitlist('t')).toBe('invalid')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('unsubscribeWaitlist', () => {
  it('returns invalid for an empty or unknown token', async () => {
    expect(await unsubscribeWaitlist('')).toBe('invalid')
    findUnique.mockResolvedValue(null)
    expect(await unsubscribeWaitlist('nope')).toBe('invalid')
  })

  it('unsubscribes a known token and retires the confirm link', async () => {
    findUnique.mockResolvedValue({ id: '1' })
    expect(await unsubscribeWaitlist('t')).toBe('ok')
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('unsubscribed')
    expect(data.confirmToken).toBeNull()
  })
})
