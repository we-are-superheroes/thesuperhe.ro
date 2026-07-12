import 'server-only'

import { getTranslations } from 'next-intl/server'
import type { ErrorDescriptor } from '@/lib/validation'

/**
 * Render an ErrorDescriptor in the requester's language. Server
 * actions use this for errors produced by shared validators
 * (lib/validation.ts, lib/rate-limit.ts); their own error literals
 * call getTranslations('errors') directly with fully typed keys.
 */
export async function tError(desc: ErrorDescriptor): Promise<string> {
  const t = await getTranslations('errors')
  // Descriptor keys are dynamic strings, so the typed key union can't
  // apply here — the coupling test in tests/validation.test.ts checks
  // every producible key exists in messages/en/errors.json instead.
  const format = t as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string
  return format(desc.key, desc.params)
}
