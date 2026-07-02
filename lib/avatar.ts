/* ================================================================
   Shared avatar helpers — the gradient palette, the deterministic
   per-user gradient hash, and the initials rules used everywhere a
   person is rendered without a photo. Pure + client-safe.
   ================================================================ */

export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4a8b6e, #3DAF7C)',
  'linear-gradient(135deg, #F4A535, #F7BD64)',
  'linear-gradient(135deg, #4A7FD4, #7AAEE8)',
  'linear-gradient(135deg, #B86E00, #F4A535)',
  'linear-gradient(135deg, #2E5FAA, #4A7FD4)',
  'linear-gradient(135deg, #1A5C40, #3DAF7C)',
]

/** Deterministic gradient for a user id (stable across renders + views). */
export function gradientFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

/** Up-to-two-letter initials: "Maya Fernandes" → "MF", "Priya" → "P". */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/** Single-letter initial for compact avatars. */
export function initialOf(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase() || '?'
}
