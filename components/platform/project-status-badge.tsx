import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/* ================================================================
   Compact project-status pill, shared by every project card (browse,
   dashboard, skill matches, org pages, my projects). The project
   page's hero keeps its own larger pill with the glyphs.
   ================================================================ */

type KnownStatus = 'defining' | 'needs_help' | 'in_progress' | 'completed'

const STYLES: Record<string, { key: KnownStatus; className: string }> = {
  defining: {
    key: 'defining',
    className: 'border-blue-400/40 bg-blue-500/[0.14] text-blue-200',
  },
  needs_help: {
    key: 'needs_help',
    className: 'border-amber-500/50 bg-amber-500/[0.16] text-amber-400',
  },
  in_progress: {
    key: 'in_progress',
    className: 'border-green-500/40 bg-green-500/[0.14] text-green-300',
  },
  completed: {
    key: 'completed',
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
  const t = useTranslations('project')
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
      {t(`status.${s.key}`)}
    </span>
  )
}
