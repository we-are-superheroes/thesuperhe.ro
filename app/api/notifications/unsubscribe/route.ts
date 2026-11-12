import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/* One-click unsubscribe for notification emails. The link/header carry the
   user's opaque emailUnsubToken; we flip the master preference off. The
   in-app toggle on the profile page turns it back on. */

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

function tokenOf(req: Request): string {
  return new URL(req.url).searchParams.get('token') ?? ''
}

/* RFC 8058 one-click POST from the mail client. */
export async function POST(req: Request) {
  await unsubscribe(tokenOf(req))
  return new NextResponse(null, { status: 200 })
}

/* Human-clicked link in the email footer. */
export async function GET(req: Request) {
  const ok = await unsubscribe(tokenOf(req))
  const state = ok ? 'ok' : 'invalid'
  return NextResponse.redirect(new URL(`/email-unsubscribed?state=${state}`, req.url))
}
