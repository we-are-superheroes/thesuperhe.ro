import { LeavesMark } from '@/components/ui/logo'

/**
 * Shared route-loading fallback (used by loading.tsx files). Server
 * component — pure markup, no state.
 */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <LeavesMark className="size-11 animate-pulse" />
      <span className="text-sm text-fg-tertiary">{label}</span>
    </div>
  )
}
