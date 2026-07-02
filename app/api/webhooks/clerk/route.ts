import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { db } from '@/lib/db'
import { log } from '@/lib/log'

type ClerkUserEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id: string
    first_name: string | null
    last_name: string | null
    image_url: string | null
  }
}

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    return new Response('Missing CLERK_WEBHOOK_SECRET', { status: 500 })
  }

  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(webhookSecret)
  let event: ClerkUserEvent

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const { type, data } = event

  const primaryEmail = data.email_addresses?.find(
    (e) => e.id === data.primary_email_address_id
  )
  const email = primaryEmail?.email_address ?? ''
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || email

  try {
    if (type === 'user.created' || type === 'user.updated') {
      // Upsert both ways: created can race the in-app ensureUserExists
      // fallback, and updated can arrive before created was processed.
      await db.user.upsert({
        where: { id: data.id },
        update: { email, name, avatarUrl: data.image_url },
        create: { id: data.id, email, name, avatarUrl: data.image_url },
      })
    } else if (type === 'user.deleted') {
      await db.user.delete({ where: { id: data.id } }).catch(() => null)
    } else {
      // Unknown event type (future Clerk versions) — log, ack, move on.
      log.warn('clerk_webhook.unhandled_type', { type, svixId })
    }
  } catch (e) {
    // Log with the svix id and return 500 so svix retries the delivery.
    log.error('clerk_webhook.sync_failed', {
      type,
      svixId,
      userId: data.id,
      message: e instanceof Error ? e.message : String(e),
    })
    return new Response('Sync failed', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
