import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { db } from '@/lib/db'

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

  const primaryEmail = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  )
  const email = primaryEmail?.email_address ?? ''
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || email

  if (type === 'user.created') {
    await db.user.create({
      data: {
        id: data.id,
        email,
        name,
        avatarUrl: data.image_url,
      },
    })
  }

  if (type === 'user.updated') {
    await db.user.update({
      where: { id: data.id },
      data: { email, name, avatarUrl: data.image_url },
    })
  }

  if (type === 'user.deleted') {
    await db.user.delete({ where: { id: data.id } }).catch(() => null)
  }

  return new Response('OK', { status: 200 })
}
