'use client'

import { useEffect } from 'react'
import { LeavesMark } from '@/components/ui/logo'

/**
 * Route-level error boundary — catches render/data errors anywhere below
 * the root layout and offers a retry instead of a blank screen.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaces in the browser console + Vercel logs; digest links the two.
    console.error('[error-boundary]', error.digest ?? '', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <LeavesMark className="size-12" />
      <h1 className="font-display text-3xl tracking-tight">Something broke.</h1>
      <p className="max-w-[420px] text-sm leading-relaxed text-fg-secondary">
        The problem is on our side, not yours. It&rsquo;s been logged
        {error.digest ? ` (ref ${error.digest})` : ''} — trying again usually works.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
      >
        Try again
      </button>
    </div>
  )
}
