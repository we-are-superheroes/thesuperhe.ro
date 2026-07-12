'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@clerk/nextjs'
import {
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  Bell,
  MessageSquare,
  Search,
  Star,
  FileText,
  Building2,
  User as UserIcon,
  LogOut,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeavesMark } from '@/components/ui/logo'
import { LocaleSwitcher } from '@/components/ui/locale-switcher'

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  badge?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

/** Desktop sidebar sizing (px). The mobile drawer is always 280. */
const DEFAULT_W = 280
const MIN_W = 220
const MAX_W = 400
const RAIL_W = 72
const WIDTH_KEY = 'superhero-sidebar-width'
const COLLAPSED_KEY = 'superhero-sidebar-collapsed'

function clampWidth(w: number): number {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(w)))
}

export function Sidebar({
  userName,
  userInitials,
  projectCount,
  stepCount,
  hoursContributed,
  notificationsBadge = 0,
  messagesBadge = 0,
  drawerOpen = false,
  onDrawerClose,
}: {
  userName: string | null
  userInitials: string
  projectCount: number
  stepCount: number
  hoursContributed: number
  notificationsBadge?: number
  messagesBadge?: number
  drawerOpen?: boolean
  onDrawerClose?: () => void
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Desktop-only: collapsible to an icon rail + drag-resizable width, both
  // remembered per browser. SSR renders the defaults; the stored values are
  // restored in a frame callback (the usual hydration-safe pattern here).
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_W)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true)
        const stored = Number(localStorage.getItem(WIDTH_KEY))
        if (Number.isFinite(stored)) setWidth(clampWidth(stored))
      } catch {
        /* private browsing — defaults are fine */
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX
    const startW = width
    let lastW = startW
    const onMove = (ev: PointerEvent) => {
      lastW = clampWidth(startW + ev.clientX - startX)
      setWidth(lastW)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setDragging(false)
      try {
        localStorage.setItem(WIDTH_KEY, String(lastW))
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const resetWidth = () => {
    setWidth(DEFAULT_W)
    try {
      localStorage.setItem(WIDTH_KEY, String(DEFAULT_W))
    } catch {
      /* ignore */
    }
  }

  // The icon rail only exists on desktop — the mobile drawer (drawerOpen)
  // always shows the full sidebar.
  const rail = collapsed && !drawerOpen

  // Close the account menu whenever the user navigates. Adjusting state
  // during render (rather than in an effect) is React's recommended pattern
  // for reacting to a changed value without an extra render pass.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  // Close the account menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { label: 'My dashboard', icon: LayoutDashboard, href: '/dashboard' },
        { label: 'My projects', icon: FolderOpen, href: '/my-projects', badge: projectCount || undefined },
        { label: 'My steps', icon: CheckSquare, href: '/my-steps', badge: stepCount || undefined },
        {
          label: 'Messages',
          icon: MessageSquare,
          href: '/messages',
          badge: messagesBadge || undefined,
        },
        {
          label: 'Notifications',
          icon: Bell,
          href: '/notifications',
          badge: notificationsBadge || undefined,
        },
      ],
    },
    {
      label: 'Discover',
      items: [
        { label: 'Browse projects', icon: Search, href: '/projects' },
        { label: 'Skill matches', icon: Star, href: '/skill-matches' },
        { label: 'Blueprints', icon: FileText, href: '/blueprints' },
        { label: 'Organisations', icon: Building2, href: '/organisations' },
      ],
    },
    {
      label: 'Account',
      items: [{ label: 'Profile', icon: UserIcon, href: '/profile' }],
    },
  ]

  const metaText = projectCount > 0
    ? `${projectCount} project${projectCount !== 1 ? 's' : ''} · ${hoursContributed}h`
    : `New here · 0h`

  return (
    <aside
      style={{ '--sb-w': `${rail ? RAIL_W : width}px` } as React.CSSProperties}
      className={cn(
        // Base layout. Width is fixed on mobile (drawer) and driven by the
        // resizable/collapsible state on desktop via the CSS variable.
        'relative flex w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/[0.08] bg-bg-surface py-6 lg:w-[var(--sb-w)]',
        rail ? 'px-3' : 'px-5',
        !dragging && 'lg:transition-[width] lg:duration-150',
        // Mobile: fixed full-height drawer that slides in from the left.
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
        // Desktop: static, always-visible column.
        'lg:static lg:z-auto lg:translate-x-0',
        drawerOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:translate-x-0',
      )}
      aria-label="Primary navigation"
    >
      {/* Mobile close button */}
      {onDrawerClose && (
        <button
          type="button"
          onClick={onDrawerClose}
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-bg-surface-2 text-fg-secondary transition-colors hover:text-fg-primary lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-4" />
        </button>
      )}

      {/* Logo + collapse toggle */}
      <div className={cn('flex items-center gap-3', rail ? 'flex-col px-0' : 'px-2')}>
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 font-display text-xl tracking-tight"
        >
          <LeavesMark className="size-8 shrink-0" />
          {!rail && <span className="truncate">The Superhero</span>}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
          aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
          className={cn(
            'hidden size-8 shrink-0 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary lg:flex',
            !rail && 'ml-auto',
          )}
        >
          {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Nav groups */}
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {rail ? (
            <div className="mx-2 mb-2 h-px bg-white/[0.08]" aria-hidden />
          ) : (
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
              {group.label}
            </div>
          )}
          {group.items.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={rail ? item.label : undefined}
                className={cn(
                  // Note: min-h gives a comfortable touch target on mobile.
                  'relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-fast',
                  rail && 'justify-center px-0',
                  isActive
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 font-semibold text-amber-900 shadow-glow-amber'
                    : 'text-fg-secondary hover:bg-bg-surface-2 hover:text-fg-primary',
                )}
              >
                <item.icon className="size-[18px] shrink-0" />
                {!rail && item.label}
                {!rail && item.badge != null && item.badge > 0 && (
                  <span
                    className={cn(
                      'ml-auto rounded-full px-[7px] py-[2px] text-[11px] font-semibold',
                      isActive
                        ? 'bg-amber-900/20 text-amber-900'
                        : 'bg-bg-surface-3 text-fg-secondary',
                    )}
                  >
                    {item.badge}
                  </span>
                )}
                {rail && item.badge != null && item.badge > 0 && (
                  <span
                    className={cn(
                      'absolute right-1.5 top-1.5 min-w-[16px] rounded-full px-1 text-center text-[9px] font-semibold leading-4',
                      isActive
                        ? 'bg-amber-900/25 text-amber-900'
                        : 'bg-bg-surface-3 text-fg-secondary',
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* User footer with account menu */}
      <div ref={menuRef} className="relative border-t border-white/[0.08] pt-4">
        {/* Pop-up menu (opens upward, above the trigger) */}
        {menuOpen && (
          <div
            role="menu"
            aria-label="Account menu"
            className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-lg border border-white/[0.08] bg-bg-surface-2 py-1 shadow-xl"
          >
            <SignOutButton>
              <button
                type="button"
                role="menuitem"
                title={rail ? 'Sign out' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-3 hover:text-fg-primary',
                  rail && 'justify-center px-0',
                )}
              >
                <LogOut className="size-[18px] shrink-0" />
                {!rail && 'Sign out'}
              </button>
            </SignOutButton>
          </div>
        )}

        {/* Trigger: the user's avatar + name */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={rail ? (userName ?? 'Account') : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-bg-surface-2',
            rail && 'justify-center',
          )}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4a8b6e] to-[#3DAF7C] text-sm font-semibold text-blue-900">
            {userInitials}
          </div>
          {!rail && (
            <>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold text-fg-primary">
                  {userName ?? 'Hero'}
                </span>
                <span className="text-xs text-fg-tertiary">{metaText}</span>
              </div>
              <ChevronUp
                className={cn(
                  'ml-auto size-4 shrink-0 text-fg-tertiary transition-transform duration-fast',
                  menuOpen ? 'rotate-0' : 'rotate-180',
                )}
              />
            </>
          )}
        </button>

        {/* Small footer links below the user card */}
        {!rail && (
          <div className="mt-3 flex items-center gap-1.5 px-1 text-xs text-fg-tertiary">
            <Link href="/home" className="transition-colors hover:text-fg-secondary">
              Home
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="transition-colors hover:text-fg-secondary">
              Privacy
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="transition-colors hover:text-fg-secondary">
              Terms
            </Link>
            <LocaleSwitcher className="ml-auto" />
          </div>
        )}
      </div>

      {/* Resize handle (desktop, expanded only). Double-click resets. */}
      {!rail && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the sidebar"
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
          className={cn(
            'absolute inset-y-0 right-0 hidden w-1.5 cursor-col-resize touch-none lg:block',
            'transition-colors hover:bg-amber-500/40',
            dragging && 'bg-amber-500/60',
          )}
        />
      )}
    </aside>
  )
}
