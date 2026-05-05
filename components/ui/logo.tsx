import { cn } from '@/lib/utils'

export function Logo({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dims = { sm: 28, md: 34, lg: 44 }
  const radii = { sm: 7, md: 8, lg: 11 }
  const fonts = { sm: 14, md: 17, lg: 22 }
  const s = dims[size]

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: s,
          height: s,
          borderRadius: radii[size],
          background: 'linear-gradient(140deg, #2E5FAA, #1B3A6B)',
          boxShadow: '0 4px 14px rgba(46, 95, 170, 0.45)',
        }}
      >
        <svg
          width={s * 0.55}
          height={s * 0.55}
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M12 2C12 2 6 5.5 6 12.5c0 2.5 1 4.5 2.5 5.8L12 22l3.5-3.7C17 17 18 15 18 12.5 18 5.5 12 2 12 2z"
            fill="white"
            opacity="0.22"
          />
          <path
            d="M12 4.5L9.5 11H12L10 19"
            stroke="#F4A535"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span
        className="font-display tracking-tight"
        style={{ fontSize: fonts[size] }}
      >
        The <span className="text-amber-500">Superhero</span>
      </span>
    </div>
  )
}
