/**
 * Shared route-loading fallback (used by loading.tsx files). Server
 * component — pure markup, no state.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="flex size-11 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 font-display text-xl font-bold text-blue-900 shadow-glow-amber">
        S
      </div>
      <span className="text-sm text-fg-tertiary">{label}</span>
    </div>
  )
}
