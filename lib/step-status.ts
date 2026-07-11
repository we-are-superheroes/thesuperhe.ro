/* ================================================================
   Step-status normalisation for the rollout window.

   The step workflow shrank from five statuses to three (open,
   in_progress, completed) with an orthogonal helpWanted flag. The
   database enums are only contracted in a follow-up migration, so
   for a short window old rows (or rows written by not-yet-replaced
   server instances) can still carry 'defining' or 'needs_help'.
   Normalise at read time; delete this module once the contract
   migration has landed.
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
