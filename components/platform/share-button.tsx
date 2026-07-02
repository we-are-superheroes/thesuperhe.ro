'use client'

import { useEffect, useRef, useState } from 'react'
import { Share2, Check } from 'lucide-react'

/**
 * Icon button that shares the current page: native share sheet where the
 * browser supports it, clipboard copy (with a "Copied" flash) everywhere else.
 */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // Dismissed the sheet or share failed — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable — nothing sensible to do */
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      title={copied ? 'Link copied' : 'Share'}
      aria-label={copied ? 'Link copied' : 'Share this page'}
      className="hidden size-[38px] items-center justify-center rounded-lg border border-neutral-700 bg-bg-surface text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary sm:flex"
    >
      {copied ? (
        <Check className="size-4 text-green-300" strokeWidth={2.5} />
      ) : (
        <Share2 className="size-4" />
      )}
    </button>
  )
}
