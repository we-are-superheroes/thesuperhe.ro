'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Admin-only destructive actions.

   Security model
   --------------
   - Authorization is enforced HERE, server-side, on every call via
     requireAdmin() (reads the role from the DB). The UI only hides the
     buttons; it is never the gate. A crafted request from a non-admin
     is rejected.
   - Server Actions are POST-only and same-origin protected by Next.js,
     so there's no CSRF surface for a GET.
   - Deletes rely on the schema's ON DELETE rules:
       · project  → steps / contributions / time logs cascade; forked
                    notifications keep their row with project_id nulled.
       · blueprint→ its steps cascade; forked projects and child variants
                    are detached (FK set null), not deleted.
   - Every deletion is logged for a basic audit trail.
   ================================================================ */

export async function deleteProjectAction(
  projectId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: 'Not authorised.' }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  })
  if (!project) return { success: false, error: 'Project not found.' }

  try {
    // Explicit order: contributions reference steps via a NO ACTION FK, so
    // clear them before the steps. Steps then cascade their time logs +
    // step-skills; the project delete sets project_id null on notifications.
    await db.$transaction(async (tx) => {
      await tx.contribution.deleteMany({ where: { projectId } })
      await tx.projectStep.deleteMany({ where: { projectId } })
      await tx.project.delete({ where: { id: projectId } })
    })
  } catch {
    return { success: false, error: 'Could not delete the project.' }
  }

  console.warn(
    `[admin-audit] user ${adminId} deleted project ${projectId} ("${project.title}")`,
  )

  revalidatePath('/projects')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  return { success: true, data: { deleted: true } }
}

export async function deleteBlueprintAction(
  blueprintId: string,
): Promise<ServerActionResult<{ deleted: true }>> {
  const adminId = await requireAdmin()
  if (!adminId) return { success: false, error: 'Not authorised.' }

  const blueprint = await db.blueprint.findUnique({
    where: { id: blueprintId },
    select: { id: true, title: true },
  })
  if (!blueprint) return { success: false, error: 'Blueprint not found.' }

  try {
    // Forked projects reference the blueprint via a NO ACTION FK, so detach
    // them first (they keep working as standalone projects). Child variants
    // detach automatically via the parent FK's ON DELETE SET NULL, and the
    // blueprint's steps cascade.
    await db.$transaction(async (tx) => {
      await tx.project.updateMany({
        where: { blueprintId },
        data: { blueprintId: null },
      })
      await tx.blueprint.delete({ where: { id: blueprintId } })
    })
  } catch {
    return { success: false, error: 'Could not delete the blueprint.' }
  }

  console.warn(
    `[admin-audit] user ${adminId} deleted blueprint ${blueprintId} ("${blueprint.title}")`,
  )

  revalidatePath('/blueprints')
  return { success: true, data: { deleted: true } }
}
