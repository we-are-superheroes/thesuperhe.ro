import type { ProjectStatus } from '@prisma/client'

/* ================================================================
   Pure validators shared by the project server actions. Kept out of
   the 'use server' modules (which may only export async functions)
   so they're unit-testable.
   ================================================================ */

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
): string | null {
  const title = data.title.trim()
  if (!title) {
    return mode === 'create' ? 'Give your project a title first.' : 'Title can’t be empty.'
  }
  if (title.length > 200) return 'Title is too long.'
  const desc = data.description.trim()
  if (!desc) {
    return mode === 'create'
      ? 'Add a short description so people know what they’re joining.'
      : 'Description can’t be empty.'
  }
  if (!['yes', 'some', 'no'].includes(data.remote)) return 'Pick a remote option.'
  if (!['open', 'approval_required'].includes(data.joinPolicy)) {
    return 'Pick a join policy.'
  }
  if (data.address.trim().length > 500) {
    return 'Address is too long.'
  }
  return null
}

export const VALID_PROJECT_STATUSES = new Set<ProjectStatus>([
  'defining',
  'needs_help',
  'in_progress',
  'completed',
])

export function validateProjectStatus(status: ProjectStatus): string | null {
  return VALID_PROJECT_STATUSES.has(status) ? null : 'Pick a project status.'
}

export const MAX_UPDATE_LENGTH = 5000

/** Body validation for project updates (post + edit). */
export function validateUpdateBody(
  raw: string,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = raw.trim()
  if (!body) return { ok: false, error: 'An update needs some text.' }
  if (body.length > MAX_UPDATE_LENGTH) {
    return { ok: false, error: `Updates are capped at ${MAX_UPDATE_LENGTH} characters.` }
  }
  return { ok: true, body }
}
