'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import {
  Compass,
  LayoutDashboard,
  FolderOpen,
  BarChart2,
  Users,
  Bookmark,
  Settings,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'projects', label: 'Discover', icon: Compass, href: '/projects' },
  { id: 'my-projects', label: 'My projects', icon: FolderOpen, href: '/my-projects' },
  { id: 'impact', label: 'Impact', icon: BarChart2, href: '/impact' },
  { id: 'community', label: 'Community', icon: Users, href: '/community' },
  { id: 'saved', label: 'Saved', icon: Bookmark, href: '/saved' },
]

export function Sidebar({
  userName,
  userInitials,
}: {
  userName: string | null
  userInitials: string
}) {
  const pathname = usePathname()

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/[0.08] bg-bg-surface px-3 py-5">
      <div className="mb-5 px-1">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13px] font-medium transition-all duration-fast',
                isActive
                  ? 'border border-blue-400/25 bg-blue-500/20 text-blue-300'
                  : 'border border-transparent text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200',
              )}
            >
              <item.icon className={cn('size-4', isActive ? 'text-blue-300' : 'text-neutral-400')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      <div className="mt-2 border-t border-white/[0.08] pt-3">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13px] font-medium text-neutral-500 transition-all duration-fast hover:bg-white/[0.04] hover:text-neutral-300"
        >
          <Settings className="size-4" />
          Settings
        </Link>

        <div className="mt-1 flex items-center gap-2.5 rounded-[9px] border border-white/[0.08] bg-bg-surface-2 px-3 py-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-400 text-[11px] font-semibold text-fg-primary">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-fg-primary">
              {userName ?? 'Hero'}
            </div>
          </div>
          <ChevronUp className="size-3.5 shrink-0 text-neutral-500" />
        </div>
      </div>
    </aside>
  )
}
