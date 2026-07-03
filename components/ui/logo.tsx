import { cn } from '@/lib/utils'

/**
 * The two-leaves brand mark (green + amber leaf forming a heart).
 * Inline SVG so it scales crisply anywhere — size it with the `size`
 * prop (px) or Tailwind size-* classes via className.
 */
export function LeavesMark({
  className,
  size,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path
        d="M50 12 C72 26 78 54 50 90 C22 54 28 26 50 12 Z"
        fill="#3DAF7C"
        transform="rotate(-24 50 88)"
      />
      <path
        d="M50 12 C72 26 78 54 50 90 C22 54 28 26 50 12 Z"
        fill="#F4A535"
        transform="rotate(24 50 88)"
      />
    </svg>
  )
}

export function Logo({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dims = { sm: 28, md: 34, lg: 44 }
  const fonts = { sm: 14, md: 17, lg: 22 }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LeavesMark size={dims[size]} />
      <span
        className="font-display tracking-tight"
        style={{ fontSize: fonts[size] }}
      >
        The <span className="text-amber-500">Superhero</span>
      </span>
    </div>
  )
}
