'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Sidebar } from './sidebar'

/**
 * The whole authenticated app layout, wrapping the sidebar + main column.
 * On lg+ the sidebar is a static 280px column. On smaller screens it
 * collapses behind a hamburger button in a sticky mobile header, and
 * slides in from the left when the user opens it.
 */
export function PlatformShell({
  children,
  userName,
  userInitials,
  projectCount,
  stepCount,
  hoursContributed,
  notificationsBadge,
}: {
  children: React.ReactNode
  userName: string | null
  userInitials: string
  projectCount: number
  stepCount: number
  hoursContributed: number
  notificationsBadge: number
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // Auto-close the drawer when the user navigates.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawerOpen])

  // Esc closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="flex h-screen flex-col overflow-hidden lg:flex-row">
      {/* Mobile-only header */}
      <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-bg-surface px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-bg-surface-2 text-fg-secondary transition-colors hover:text-fg-primary"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2 font-display text-base tracking-tight">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 font-display text-sm font-bold text-blue-900 shadow-glow-amber">
            S
          </div>
          <span>The Superhero</span>
        </Link>
        {/* Right-side spacer keeps the logo visually centred. */}
        <span className="size-10 shrink-0" />
      </header>

      {/* Backdrop (mobile only, when drawer is open) */}
      {drawerOpen && (
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-label="Close menu"
          tabIndex={-1}
        />
      )}

      {/* Sidebar (drawer on mobile, static on desktop) */}
      <Sidebar
        userName={userName}
        userInitials={userInitials}
        projectCount={projectCount}
        stepCount={stepCount}
        hoursContributed={hoursContributed}
        notificationsBadge={notificationsBadge}
        drawerOpen={drawerOpen}
        onDrawerClose={() => setDrawerOpen(false)}
      />

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
