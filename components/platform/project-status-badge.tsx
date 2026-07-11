import { cn } from '@/lib/utils'

/* ================================================================
   Compact project-status pill, shared by every project card (browse,
   dashboard, skill matches, org pages, my projects). The project
   page's hero keeps its own larger pill with the glyphs.
   ================================================================ */

const STYLES: Record<string, { label: string; className: string }> = {
  defining: {
    label: 'Being defined',
    className: 'border-blue-400/40 bg-blue-500/[0.14] text-blue-200',
  },
  needs_help: {
    label: 'Needs help',
    className: 'border-amber-500/50 bg-amber-500/[0.16] text-amber-400',
  },
  in_progress: {
    label: 'In progress',
    className: 'border-green-500/40 bg-green-500/[0.14] text-green-300',
  },
  completed: {
    label: 'Completed',
    className: 'border-green-500/30 bg-green-500/[0.10] text-green-300',
  },
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const s = STYLES[status]
  if (!s) return null
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  )
}
