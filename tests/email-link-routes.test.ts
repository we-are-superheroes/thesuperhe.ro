import { describe, it, expect, vi, beforeEach } from 'vitest'

/* The handlers behind e-mail links. The rule under test: a GET must never
   change anything (mail scanners fetch every link in a message); only a POST
   confirms or unsubscribes. */

const { confirmWaitlist, unsubscribeWaitlist } = vi.hoisted(() => ({
  confirmWaitlist: vi.fn(),
  unsubscribeWaitlist: vi.fn(),
}))

vi.mock('@/lib/waitlist', () => ({ confirmWaitlist, unsubscribeWaitlist }))

import * as confirmRoute from '@/app/api/waitlist/confirm/route'
import * as unsubscribeRoute from '@/app/api/waitlist/unsubscribe/route'

const ORIGIN = 'https://staging.example'

function formPost(path: string, fields: Record<string, string>): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })
}

beforeEach(() => {
  confirmWaitlist.mockReset().mockResolvedValue('confirmed')
  unsubscribeWaitlist.mockReset().mockResolvedValue('ok')
})

describe('GET (what a mail scanner does)', () => {
  it('does not confirm — it forwards to the page with the button', async () => {
    const res = await confirmRoute.GET(new Request(`${ORIGIN}/api/waitlist/confirm?token=abc`))
    expect(confirmWaitlist).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/waitlist/confirm?token=abc`)
  })

  it('does not unsubscribe — it forwards to the page with the button', async () => {
    const res = await unsubscribeRoute.GET(
      new Request(`${ORIGIN}/api/waitlist/unsubscribe?token=abc`),
    )
    expect(unsubscribeWaitlist).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe(`${ORIGIN}/waitlist/unsubscribe?token=abc`)
  })
})

describe('POST', () => {
  it('confirms from the page button and redirects to the status page', async () => {
    const res = await confirmRoute.POST(
      formPost('/api/waitlist/confirm', { token: 'abc', via: 'page' }),
    )
    expect(confirmWaitlist).toHaveBeenCalledWith('abc')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/waitlist/status?state=confirmed`)
  })

  it('unsubscribes from the page button and redirects to the status page', async () => {
    const res = await unsubscribeRoute.POST(
      formPost('/api/waitlist/unsubscribe', { token: 'abc', via: 'page' }),
    )
    expect(unsubscribeWaitlist).toHaveBeenCalledWith('abc')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/waitlist/status?state=unsubscribed`)
  })

  it('answers a mail client one-click POST with a bare 200', async () => {
    const res = await unsubscribeRoute.POST(
      formPost('/api/waitlist/unsubscribe?token=abc', { 'List-Unsubscribe': 'One-Click' }),
    )
    expect(unsubscribeWaitlist).toHaveBeenCalledWith('abc')
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('sends an unknown unsubscribe token to its own status', async () => {
    unsubscribeWaitlist.mockResolvedValue('invalid')
    const res = await unsubscribeRoute.POST(
      formPost('/api/waitlist/unsubscribe', { token: 'nope', via: 'page' }),
    )
    expect(res.headers.get('location')).toBe(
      `${ORIGIN}/waitlist/status?state=unsubscribeInvalid`,
    )
  })
})
