import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readEmailLinkPost, seeOther } from '@/lib/email-link'

/* Unsubscribe from notification emails. The link/header carry the user's
   opaque emailUnsubToken; we flip the master preference off. The in-app
   toggle on the profile page turns it back on.

   GET never changes anything (mail scanners fetch every link, and would
   otherwise switch people's e-mails off). It forwards to the page with the
   button. POST does the work: a bare 200 for a mail client's RFC 8058
   one-click request, a redirect when it came from the button on our page. */

async function unsubscribe(token: string): Promise<boolean> {
  if (!token) return false
  const user = await db.user.findUnique({
    where: { emailUnsubToken: token },
    select: { id: true },
  })
  if (!user) return false
  await db.user.update({ where: { id: user.id }, data: { emailNotifications: false } })
  return true
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  return NextResponse.redirect(
    new URL(`/email-unsubscribe?token=${encodeURIComponent(token)}`, req.url),
  )
}

export async function POST(req: Request) {
  const { token, fromPage } = await readEmailLinkPost(req)
  const ok = await unsubscribe(token)
  if (!fromPage) return new NextResponse(null, { status: 200 })
  return seeOther(req, `/email-unsubscribed?state=${ok ? 'ok' : 'invalid'}`)
}
