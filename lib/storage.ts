import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { log } from '@/lib/log'

/* ================================================================
   Supabase Storage helper — used by avatar + project cover uploads.

   Single public bucket "public-images" with two key prefixes:
     avatars/<uuid>.<ext>
     covers/<uuid>.<ext>

   The bucket is created lazily on first upload (idempotent) so no
   manual dashboard step is required. The service-role key is only
   used server-side; never exported to the client.
   ================================================================ */

const BUCKET = 'public-images'

export const STORAGE_LIMITS = {
  avatar: { maxBytes: 4 * 1024 * 1024, prefix: 'avatars' },
  cover: { maxBytes: 8 * 1024 * 1024, prefix: 'covers' },
  orgLogo: { maxBytes: 4 * 1024 * 1024, prefix: 'org-logos' },
  orgBanner: { maxBytes: 8 * 1024 * 1024, prefix: 'org-banners' },
} as const

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

let cachedClient: SupabaseClient | null = null
let bucketReady = false

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase storage is not configured: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.',
    )
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedClient
}

/**
 * Make sure the bucket exists. Cheap to call repeatedly thanks to a
 * module-level flag, and the underlying API is idempotent — re-creating
 * an existing bucket returns an "already exists" response that we ignore.
 */
async function ensureBucket(): Promise<void> {
  if (bucketReady) return
  const client = getClient()
  const { data, error: getError } = await client.storage.getBucket(BUCKET)
  if (getError && /signature|jwt|invalid.*key|unauthorized/i.test(getError.message)) {
    // Don't fall through to createBucket — the credentials are the problem.
    // Classic cause: SUPABASE_SERVICE_ROLE_KEY belongs to a different
    // Supabase project than NEXT_PUBLIC_SUPABASE_URL (or was rotated).
    log.error('storage.credentials_rejected', {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      message: getError.message,
    })
    throw new Error(
      'Storage credentials were rejected by Supabase. Check that SUPABASE_SERVICE_ROLE_KEY ' +
        'belongs to the same Supabase project as NEXT_PUBLIC_SUPABASE_URL in this environment.',
    )
  }
  if (!data) {
    const { error } = await client.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024, // outer cap; per-prefix limits enforced in the action
    })
    if (error && !/already exists/i.test(error.message)) {
      log.error('storage.bucket_create_failed', { message: error.message })
      throw new Error(`Could not create storage bucket: ${error.message}`)
    }
  }
  bucketReady = true
}

/**
 * Upload a File from a server action. Returns the public URL (CDN-ready).
 *  - kind: chooses the prefix + size cap
 *  - validates mime type and size before sending bytes
 *  - file key is a uuid so client filenames are never trusted
 */
export async function uploadImage(
  file: File,
  kind: keyof typeof STORAGE_LIMITS,
): Promise<{ url: string; key: string }> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Unsupported image type. Use PNG, JPEG, WebP or GIF.')
  }
  const limits = STORAGE_LIMITS[kind]
  if (file.size > limits.maxBytes) {
    const mb = Math.round(limits.maxBytes / (1024 * 1024))
    throw new Error(`File is too large. Max ${mb} MB.`)
  }

  await ensureBucket()
  const client = getClient()

  const ext = EXT_BY_MIME[file.type] ?? 'png'
  const key = `${limits.prefix}/${randomUUID()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await client.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(key)
  return { url: data.publicUrl, key }
}

/**
 * Best-effort deletion. Returns true on success or if the URL doesn't point
 * to our bucket (nothing to do); never throws — the caller usually doesn't
 * want a stale orphan to break the rest of an action.
 */
export async function deleteImageByUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return true
  const key = parseStorageKey(url)
  if (!key) return true
  try {
    const client = getClient()
    const { error } = await client.storage.from(BUCKET).remove([key])
    if (error) {
      console.warn('[storage] delete failed for', key, error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[storage] delete threw for', url, e)
    return false
  }
}

/**
 * Pull the storage key out of a Supabase public URL. Returns null if the
 * URL doesn't look like one of ours (e.g. an old Clerk-hosted avatar).
 */
function parseStorageKey(url: string): string | null {
  try {
    const u = new URL(url)
    // path looks like /storage/v1/object/public/<bucket>/<key…>
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const idx = u.pathname.indexOf(marker)
    if (idx === -1) return null
    return u.pathname.slice(idx + marker.length)
  } catch {
    return null
  }
}
