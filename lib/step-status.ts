/* ================================================================
   Step-status helpers. The database enum is contracted to the three
   live values (open, in_progress, completed) with an orthogonal
   helpWanted flag; this module stays as the defensive cast layer
   between Prisma's string statuses and the UI's narrow unions, and
   still tolerates the retired values just in case.
   ================================================================ */

export type LiveStepStatus = 'open' | 'in_progress' | 'completed'

export function normaliseStepStatus(
  raw: string,
  hasJoiners = false,
): LiveStepStatus {
  switch (raw) {
    case 'in_progress':
    case 'completed':
    case 'open':
      return raw
    case 'defining':
      return 'open'
    case 'needs_help':
      return hasJoiners ? 'in_progress' : 'open'
    default:
      return 'open'
  }
}

/** Was this raw status asking for help under the old model? */
export function impliedHelpWanted(raw: string): boolean {
  return raw === 'needs_help'
}

/**
 * Is this step currently asking for help? Combines the flag with the
 * legacy needs_help status so rollout-window rows still surface.
 */
export function stepNeedsHelp(step: { status: string; helpWanted: boolean }): boolean {
  return (step.helpWanted || impliedHelpWanted(step.status)) && step.status !== 'completed'
}
