import { NextResponse } from 'next/server'
import { sendPendingNotificationEmails } from '@/lib/notification-emails'
import { log } from '@/lib/log'

/* Cron-driven notification-email sweep. Scheduled in vercel.json; Vercel
   sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
   Guarded so the public endpoint can't be triggered by anyone else. */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed: without a configured secret the endpoint stays inert.
    return new NextResponse('CRON_SECRET not configured', { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const summary = await sendPendingNotificationEmails()
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    log.error('cron.notification_emails_failed', {
      message: e instanceof Error ? e.message : String(e),
    })
    return new NextResponse('Sweep failed', { status: 500 })
  }
}
