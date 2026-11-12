import { NextResponse } from 'next/server'
import { confirmWaitlist } from '@/lib/waitlist'

/* Double opt-in confirmation link target. Flips a pending subscriber to
   confirmed, then redirects to a friendly status page. Idempotent. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const outcome = await confirmWaitlist(token)
  return NextResponse.redirect(new URL(`/waitlist/status?state=${outcome}`, req.url))
}
