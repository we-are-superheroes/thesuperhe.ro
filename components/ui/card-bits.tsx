import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ================================================================
   The bands every card shares (project card, place card, map
   pop-up): a header row, icon fact rows and a footer. The identity
   band in between (cover, thumbnail, title) is each card's own.
   No hooks and no browser APIs, so server and client components can
   both use them.
   ================================================================ */

/** The shell around the bands. Each band carries its own padding. */
export const CARD_SHELL = 'flex flex-col overflow-hidden rounded-2xl border'

/**
 * Band 1: a colour square, the type or category name, and a right-hand
 * slot (a count, a distance). A long name is cut short rather than
 * pushing the right-hand side out of the row.
 */
export function CardHeader({
  squareClassName,
  label,
  right,
  children,
  className,
}: {
  /** Background of the colour square, for example `bg-[#4A7FD4]`. */
  squareClassName: string
  label: string
  right?: React.ReactNode
  /** Extra controls after the right-hand slot (the pop-up's close button). */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold leading-snug',
        className,
      )}
    >
      <span className={cn('size-2.5 shrink-0 rounded-[2px]', squareClassName)} aria-hidden />
      <span className="min-w-0 truncate text-fg-primary">{label}</span>
      {right != null && (
        <span className="ml-auto shrink-0 whitespace-nowrap font-normal text-fg-tertiary">
          {right}
        </span>
      )}
      {children}
    </div>
  )
}

/** Band 3: the list of fact rows. Draws nothing when every row is skipped. */
export function FactList({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <dl className={className}>{children}</dl>
}

/**
 * One fact: an icon and a value. The icon stands in for the label on
 * screen; the label itself is read out by screen readers.
 */
export function FactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[16px_1fr] items-start gap-3 border-b border-white/[0.08] py-[7px] text-[13px] leading-snug last:border-b-0">
      <dt className="mt-px text-fg-tertiary">
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 text-fg-secondary">{children}</dd>
    </div>
  )
}

/** Band 4: status on the left, an action or progress on the right. */
export function CardFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-white/[0.08] px-4 py-2.5 text-xs text-fg-tertiary',
        className,
      )}
    >
      {children}
    </div>
  )
}
