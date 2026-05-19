'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FolderOpen,
  CheckSquare,
  Bell,
  MessageSquare,
  Search,
  Star,
  FileText,
  User as UserIcon,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
      className={cn(
        // Base layout
        'flex w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/[0.08] bg-bg-surface px-5 py-6',
        // Mobile: fixed full-height drawer that slides in from the left.
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
        // Desktop: static, always-visible column.
        'lg:static lg:z-auto lg:translate-x-0 lg:transition-none',
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

      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 px-2 font-display text-xl tracking-tight">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 font-display text-lg font-bold text-blue-900 shadow-glow-amber">
          S
        </div>
        <span>The Superhero</span>
      </Link>

      {/* Nav groups */}
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            {group.label}
          </div>
          {group.items.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  // Note: min-h gives a comfortable touch target on mobile.
                  'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-fast',
                  isActive
                    ? 'bg-gradient-to-r from-amber-500 to-amber-400 font-semibold text-amber-900 shadow-glow-amber'
                    : 'text-fg-secondary hover:bg-bg-surface-2 hover:text-fg-primary',
                )}
              >
                <item.icon className="size-[18px] shrink-0" />
                {item.label}
                {item.badge != null && item.badge > 0 && (
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
              </Link>
            )
          })}
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* User footer */}
      <div className="flex items-center gap-3 border-t border-white/[0.08] pt-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4a8b6e] to-[#3DAF7C] text-sm font-semibold text-blue-900">
          {userInitials}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold text-fg-primary">
            {userName ?? 'Hero'}
          </span>
          <span className="text-xs text-fg-tertiary">{metaText}</span>
        </div>
      </div>
    </aside>
  )
}
