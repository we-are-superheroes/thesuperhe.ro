import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant
  size?: Size
  href?: string
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-amber-500 text-blue-900 border-transparent hover:bg-amber-400 hover:shadow-glow-amber',
  secondary:
    'bg-bg-surface text-fg-primary border border-white/[0.08] hover:bg-bg-surface-2 hover:border-white/[0.15]',
  outline:
    'bg-transparent text-fg-primary border-[1.5px] border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15]',
  ghost:
    'bg-transparent text-neutral-300 border-transparent hover:bg-white/[0.05] hover:text-fg-primary',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-4 py-[7px] text-[13px] rounded-[10px]',
  md: 'px-[22px] py-[11px] text-sm rounded-[10px]',
  lg: 'px-7 py-3.5 text-base rounded-xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  href,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    'inline-flex items-center gap-2 font-semibold whitespace-nowrap cursor-pointer transition-all duration-fast ease-standard',
    variantStyles[variant],
    sizeStyles[size],
    className,
  )

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    )
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
