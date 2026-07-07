'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { ServerActionResult } from '@/types'

/* ================================================================
   Time-log actions
     - logTimeAction:    add hours (and an optional note) to a step
                         I'm actively on.
     - deleteTimeLogAction: remove one of my own log entries.
   The Contribution.hoursContributed column is kept in sync as a
   denormalised sum so dashboards can read it without joining.
   ================================================================ */

const HOURS_MIN = 0.25 // 15 minutes — smallest meaningful chunk
const HOURS_MAX = 24    // sanity cap; multi-day logs should be split
const NOTE_MAX = 500

function roundQuarter(h: number): number {
  // Snap to 0.25h increments so the displayed totals stay tidy.
  return Math.round(h * 4) / 4
}

export async function logTimeAction(
  projectStepId: string,
  rawHours: number,
  rawNote?: string,
  rawLoggedOn?: string,
): Promise<ServerActionResult<{ logId: string; newTotal: number }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  if (!Number.isFinite(rawHours)) {
    return { success: false, error: 'Enter a valid number of hours.' }
  }
  const hours = roundQuarter(rawHours)
  if (hours < HOURS_MIN) {
    return { success: false, error: `Log at least ${HOURS_MIN}h.` }
  }
  if (hours > HOURS_MAX) {
    return { success: false, error: `That's too much — log at most ${HOURS_MAX}h per entry.` }
  }
  const note = rawNote?.trim() ?? ''
  if (note.length > NOTE_MAX) {
    return { success: false, error: `Notes max ${NOTE_MAX} characters.` }
  }

  let loggedOn = new Date()
  if (rawLoggedOn) {
    const parsed = new Date(rawLoggedOn)
    if (!Number.isNaN(parsed.getTime())) loggedOn = parsed
  }

  // The contribution row is the source of truth for who's on which step.
  const contribution = await db.contribution.findFirst({
    where: { userId, projectStepId, status: { in: ['active', 'completed'] } },
    select: { id: true, projectId: true, hoursContributed: true },
  })
  if (!contribution) {
    return { success: false, error: 'Join the step before logging time on it.' }
  }

  let logId = ''
  let newTotal = contribution.hoursContributed
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.timeLog.create({
        data: {
          userId,
          projectStepId,
          hours,
          note: note || null,
          loggedOn,
        },
        select: { id: true },
      })
      logId = created.id

      newTotal = roundQuarter(contribution.hoursContributed + hours)
      await tx.contribution.update({
        where: { id: contribution.id },
        data: { hoursContributed: newTotal },
      })
    })
  } catch {
    return { success: false, error: 'Could not log time.' }
  }

  revalidatePath('/my-steps')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${contribution.projectId}`)
  return { success: true, data: { logId, newTotal } }
}

export async function deleteTimeLogAction(
  timeLogId: string,
): Promise<ServerActionResult<{ deleted: true; newTotal: number }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const log = await db.timeLog.findUnique({
    where: { id: timeLogId },
    select: {
      id: true,
      userId: true,
      hours: true,
      projectStepId: true,
      projectStep: { select: { projectId: true } },
    },
  })
  if (!log) return { success: false, error: 'Log not found.' }
  if (log.userId !== userId) {
    return { success: false, error: 'You can only delete your own log entries.' }
  }

  let newTotal = 0
  try {
    await db.$transaction(async (tx) => {
      await tx.timeLog.delete({ where: { id: timeLogId } })

      const contribution = await tx.contribution.findFirst({
        where: { userId, projectStepId: log.projectStepId },
        select: { id: true, hoursContributed: true },
      })
      if (contribution) {
        newTotal = Math.max(0, roundQuarter(contribution.hoursContributed - log.hours))
        await tx.contribution.update({
          where: { id: contribution.id },
          data: { hoursContributed: newTotal },
        })
      }
    })
  } catch {
    return { success: false, error: 'Could not delete that log entry.' }
  }

  revalidatePath('/my-steps')
  revalidatePath('/my-projects')
  revalidatePath('/dashboard')
  if (log.projectStep?.projectId) {
    revalidatePath(`/projects/${log.projectStep.projectId}`)
  }
  return { success: true, data: { deleted: true, newTotal } }
}
