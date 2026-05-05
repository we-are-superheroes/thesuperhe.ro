import { cn } from '@/lib/utils'

interface BadgeProps {
  label: string
  color?: string
  bg?: string
  border?: string
  dot?: boolean
  className?: string
}

export function Badge({
  label,
  color = '#4A7FD4',
  bg = 'rgba(74, 127, 212, 0.15)',
  border = 'rgba(74, 127, 212, 0.3)',
  dot,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide',
        className,
      )}
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {dot && (
        <span
          className="size-[5px] shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  )
}

export function StatusBadge({
  status,
  className,
}: {
  status: 'Open' | 'Full' | string
  className?: string
}) {
  const isOpen = status === 'Open'
  return (
    <Badge
      label={status}
      dot
      color={isOpen ? '#3DAF7C' : '#F4A535'}
      bg={isOpen ? 'rgba(61, 175, 124, 0.12)' : 'rgba(244, 165, 53, 0.12)'}
      border={
        isOpen ? 'rgba(61, 175, 124, 0.25)' : 'rgba(244, 165, 53, 0.25)'
      }
      className={className}
    />
  )
}
