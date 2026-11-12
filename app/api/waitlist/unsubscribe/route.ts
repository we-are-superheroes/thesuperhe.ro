import { NextResponse } from 'next/server'
import { unsubscribeWaitlist } from '@/lib/waitlist'

function tokenOf(req: Request): string {
  return new URL(req.url).searchParams.get('token') ?? ''
}

/* One-click unsubscribe (RFC 8058): mail clients POST here from the
   List-Unsubscribe-Post header. No body, no redirect — just a 200. */
export async function POST(req: Request) {
  await unsubscribeWaitlist(tokenOf(req))
  return new NextResponse(null, { status: 200 })
}

/* The human-clickable link in the email footer. */
export async function GET(req: Request) {
  const outcome = await unsubscribeWaitlist(tokenOf(req))
  const state = outcome === 'ok' ? 'unsubscribed' : 'invalid'
  return NextResponse.redirect(new URL(`/waitlist/status?state=${state}`, req.url))
}
