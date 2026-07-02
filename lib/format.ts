/* Shared formatting helpers (client-safe, pure). */

/** Relative "time ago" for feed rows, time logs, message lists. */
export function fmtAgo(ms: number, now = Date.now()): string {
  const diff = now - ms
  const sec = diff / 1000
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`
  const d = Math.round(sec / 86400)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  const mo = Math.round(d / 30)
  return mo === 1 ? '1 month ago' : `${mo} months ago`
}
