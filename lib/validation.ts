import type { ProjectStatus } from '@prisma/client'

/* ================================================================
   Pure validators shared by the project server actions. Kept out of
   the 'use server' modules (which may only export async functions)
   so they're unit-testable.

   Validators return ErrorDescriptors — a key into the `errors`
   message namespace plus ICU params — never display strings. The
   calling server action renders them in the requester's language via
   tError() (lib/errors.ts). tests/i18n-catalogs.test.ts and the
   coupling test in tests/validation.test.ts keep keys and catalog in
   lockstep.
   ================================================================ */

/** A key into messages/<locale>/errors.json plus its ICU params. */
export interface ErrorDescriptor {
  key: string
  params?: Record<string, string | number>
}

export interface ProjectFormFields {
  title: string
  description: string
  remote: string
  joinPolicy: string
  address: string
}

/**
 * Field validation shared by create + update. `mode` only affects the
 * error copy (the create flow talks to someone starting out; the update
 * flow to someone editing).
 */
export function validateProjectFields(
  data: ProjectFormFields,
  mode: 'create' | 'update',
): ErrorDescriptor | null {
  const title = data.title.trim()
  if (!title) {
    return {
      key: mode === 'create' ? 'projectForm.titleRequiredCreate' : 'projectForm.titleRequired',
    }
  }
  if (title.length > 200) return { key: 'projectForm.titleTooLong' }
  const desc = data.description.trim()
  if (!desc) {
    return {
      key:
        mode === 'create'
          ? 'projectForm.descriptionRequiredCreate'
          : 'projectForm.descriptionRequired',
    }
  }
  if (!['yes', 'some', 'no'].includes(data.remote)) return { key: 'projectForm.remoteRequired' }
  if (!['open', 'approval_required'].includes(data.joinPolicy)) {
    return { key: 'projectForm.joinPolicyRequired' }
  }
  if (data.address.trim().length > 500) {
    return { key: 'projectForm.addressTooLong' }
  }
  return null
}

export const VALID_PROJECT_STATUSES = new Set<ProjectStatus>([
  'defining',
  'needs_help',
  'in_progress',
  'completed',
])

export function validateProjectStatus(status: ProjectStatus): ErrorDescriptor | null {
  return VALID_PROJECT_STATUSES.has(status) ? null : { key: 'projectForm.statusRequired' }
}

export const MAX_UPDATE_LENGTH = 5000

/** Body validation for project updates (post + edit). */
export function validateUpdateBody(
  raw: string,
): { ok: true; body: string } | { ok: false; error: ErrorDescriptor } {
  const body = raw.trim()
  if (!body) return { ok: false, error: { key: 'updates.bodyRequired' } }
  if (body.length > MAX_UPDATE_LENGTH) {
    return {
      ok: false,
      error: { key: 'updates.bodyTooLong', params: { max: MAX_UPDATE_LENGTH } },
    }
  }
  return { ok: true, body }
}
