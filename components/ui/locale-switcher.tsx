'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setLocaleAction } from '@/app/actions/locale'
import { LOCALE_NAMES, SUPPORTED_LOCALES, isSupportedLocale } from '@/lib/locale-shared'

/**
 * Language picker shown in every shell footer/navbar. A native
 * <select> styled to sit quietly in footers — options carry native
 * language names, so it stays understandable whatever language the
 * page is currently in.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const change = (next: string) => {
    if (!isSupportedLocale(next) || next === locale) return
    startTransition(async () => {
      await setLocaleAction(next)
      router.refresh()
    })
  }

  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-tertiary transition-colors hover:text-fg-secondary',
        pending && 'opacity-60',
        className,
      )}
    >
      <Globe className="size-3.5 shrink-0" aria-hidden />
      <select
        value={locale}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        aria-label="Language"
        className="cursor-pointer appearance-none bg-transparent pr-1 text-xs text-inherit outline-none [&>option]:bg-bg-surface-2 [&>option]:text-fg-primary"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
