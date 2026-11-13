import { NextResponse } from 'next/server'
import { confirmWaitlist } from '@/lib/waitlist'
import { readEmailLinkPost, seeOther } from '@/lib/email-link'

/* Double opt-in confirmation.

   GET never changes anything: mail scanners fetch every link in a message,
   and a GET that confirmed would let them opt people in. It only forwards to
   the page with the confirm button (this also keeps links from e-mails sent
   before that page existed working).

   POST — from the button on /waitlist/confirm — flips a pending subscriber
   to confirmed, then redirects to the status page. Idempotent. */

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  return NextResponse.redirect(
    new URL(`/waitlist/confirm?token=${encodeURIComponent(token)}`, req.url),
  )
}

export async function POST(req: Request) {
  const { token } = await readEmailLinkPost(req)
  const outcome = await confirmWaitlist(token)
  return seeOther(req, `/waitlist/status?state=${outcome}`)
}
