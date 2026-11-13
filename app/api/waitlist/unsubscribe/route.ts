import { NextResponse } from 'next/server'
import { unsubscribeWaitlist } from '@/lib/waitlist'
import { readEmailLinkPost, seeOther } from '@/lib/email-link'

/* Waitlist unsubscribe.

   GET never changes anything (mail scanners fetch every link, and would
   otherwise unsubscribe people). It forwards to the page with the button.

   POST does the work, for two callers:
     - a mail client's RFC 8058 one-click request, triggered by the
       List-Unsubscribe-Post header → bare 200, no redirect;
     - the button on /waitlist/unsubscribe → redirect to the status page. */

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  return NextResponse.redirect(
    new URL(`/waitlist/unsubscribe?token=${encodeURIComponent(token)}`, req.url),
  )
}

export async function POST(req: Request) {
  const { token, fromPage } = await readEmailLinkPost(req)
  const outcome = await unsubscribeWaitlist(token)
  if (!fromPage) return new NextResponse(null, { status: 200 })
  return seeOther(
    req,
    `/waitlist/status?state=${outcome === 'ok' ? 'unsubscribed' : 'unsubscribeInvalid'}`,
  )
}
