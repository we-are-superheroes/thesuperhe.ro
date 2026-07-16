'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export type ProjectTab = 'overview' | 'updates'

const TABS: ProjectTab[] = ['overview', 'updates']

function isProjectTab(value: unknown): value is ProjectTab {
  return typeof value === 'string' && (TABS as string[]).includes(value)
}

interface ProjectTabsContextValue {
  tab: ProjectTab
  setTab: (tab: ProjectTab, opts?: { scroll?: boolean }) => void
  barRef: React.RefObject<HTMLElement | null>
}

const noopRef: React.RefObject<HTMLElement | null> = { current: null }

const ProjectTabsContext = createContext<ProjectTabsContextValue>({
  tab: 'overview',
  setTab: () => {},
  barRef: noopRef,
})

export function useProjectTabs(): ProjectTabsContextValue {
  return useContext(ProjectTabsContext)
}

/**
 * Owns the active-tab state for a project page. Panels are server-rendered
 * children toggled with `hidden`, so all content ships in the initial HTML
 * and client state (e.g. step filters) survives tab switches.
 *
 * SSR always renders Overview; a mount effect restores the visitor's last
 * tab (localStorage, per project) or honours a `#updates` deep link.
 */
export function ProjectTabsProvider({
  projectId,
  children,
}: {
  projectId: string
  children: React.ReactNode
}) {
  const [tab, setTabState] = useState<ProjectTab>('overview')
  const barRef = useRef<HTMLElement | null>(null)
  const storageKey = `superhero.project.${projectId}.tab`

  const setTab = useCallback(
    (next: ProjectTab, { scroll = true }: { scroll?: boolean } = {}) => {
      setTabState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        /* private browsing — fine */
      }
      // Keep #updates shareable without triggering native anchor jumps.
      const hash = next === 'updates' ? '#updates' : ''
      history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
      // If the reader is deep in a long tab, bring them back to the bar.
      if (scroll && barRef.current && barRef.current.getBoundingClientRect().top < 0) {
        barRef.current.scrollIntoView({ block: 'start' })
      }
    },
    [storageKey],
  )

  // Initial tab: a #updates deep link wins, then the stored preference.
  // Restored in a frame callback (SSR always paints Overview first) — the
  // brief flash on non-default tabs is the accepted tradeoff for keeping
  // server HTML deterministic.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      let initial: ProjectTab | null = null
      if (window.location.hash === '#updates') {
        initial = 'updates'
      } else {
        try {
          const stored = localStorage.getItem(storageKey)
          if (isProjectTab(stored)) initial = stored
        } catch {
          /* ignore */
        }
      }
      if (initial && initial !== 'overview') setTabState(initial)
    })

    const onHashChange = () => {
      if (window.location.hash === '#updates') setTabState('updates')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [storageKey])

  return (
    <ProjectTabsContext.Provider value={{ tab, setTab, barRef }}>
      {children}
    </ProjectTabsContext.Provider>
  )
}

/**
 * Sticky tab bar under the cover hero. `topOffsetClass` accounts for the two
 * scroll contexts: signed-in pages scroll inside the platform shell (top-0),
 * signed-out pages scroll the window beneath the sticky public navbar.
 */
export function ProjectTabBar({
  updatesCount,
  topOffsetClass,
}: {
  updatesCount: number
  topOffsetClass: string
}) {
  const t = useTranslations('project')
  const { tab, setTab, barRef } = useProjectTabs()

  const items: Array<{ key: ProjectTab; label: string; count?: number }> = [
    { key: 'overview', label: t('tabs.overview') },
    { key: 'updates', label: t('tabs.updates'), count: updatesCount },
  ]

  return (
    <nav
      ref={barRef as React.RefObject<HTMLElement>}
      className={cn(
        'sticky z-10 border-b border-white/[0.08] bg-bg-glass backdrop-blur-xl',
        topOffsetClass,
      )}
      aria-label={t('tabs.ariaLabel')}
    >
      <div
        className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-10"
        role="tablist"
      >
        {items.map((item) => {
          const active = tab === item.key
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors duration-fast',
                active
                  ? 'border-amber-500 text-fg-primary'
                  : 'border-transparent text-fg-tertiary hover:text-fg-secondary',
              )}
            >
              {item.label}
              {item.count != null && (
                <span
                  className={cn(
                    'rounded-full px-2 py-px text-[11px] font-semibold',
                    active
                      ? 'bg-amber-500/[0.18] text-amber-400'
                      : 'bg-bg-surface-2 text-fg-tertiary',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function ProjectTabPanel({
  tab,
  children,
}: {
  tab: ProjectTab
  children: React.ReactNode
}) {
  const { tab: active } = useProjectTabs()
  return (
    <div role="tabpanel" hidden={active !== tab}>
      {children}
    </div>
  )
}
