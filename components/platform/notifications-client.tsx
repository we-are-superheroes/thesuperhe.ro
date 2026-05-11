'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Bell,
  Check,
  X,
  UserPlus,
  MessageSquare,
  AtSign,
  Star,
  Clock,
  GitFork,
  Target,
  ArrowRight,
  Sparkles,
  MailOpen,
} from 'lucide-react'

/* ================================================================
   Types
   ================================================================ */

export type NotificationType =
  | 'join'
  | 'invite'
  | 'step'
  | 'board'
  | 'mention'
  | 'fork'
  | 'milestone'
  | 'skill'
  | 'reminder'
  | 'featured'

export interface NotificationItem {
  id: string
  type: NotificationType
  ts: number
  actor?: { name: string; initials: string; tint: string }
  project?: { id: string; name: string; tint: string }
  /** Free-form supporting copy below the actor line, used by joins. */
  meta?: string
  /** Quoted excerpt for messages / mentions / invites. */
  note?: string
  /** For step-completed cards. */
  step?: string
  /** For reminders: how long since the step was touched. */
  idleDays?: number
  /** For skill-match cards. */
  skill?: string
  /** For mentions / boards: where the post happened. */
  where?: string
  /** For forks. */
  blueprint?: string
  forkedAs?: string
  /** For milestones. */
  headline?: string
  detail?: string
}

type Tab = 'all' | 'unread' | 'mention'

const LS_KEY = 'tsh:notifications:lastViewedAt'

/* ================================================================
   Helpers
   ================================================================ */

function fmtTime(ts: number, now: number): string {
  const diff = now - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function groupOf(ts: number, now: number): string {
  const days = Math.floor((now - ts) / (24 * 60 * 60 * 1000))
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return 'Earlier this week'
  return 'Earlier'
}

/* ================================================================
   Component
   ================================================================ */

export function NotificationsClient({ initialItems }: { initialItems: NotificationItem[] }) {
  const [items] = useState(initialItems)
  const [tab, setTab] = useState<Tab>('all')
  // Hydration-safe "now": start at 0 on the server, refresh on mount so the
  // time strings ("2h ago") only render once we know the client clock.
  const [now, setNow] = useState(0)
  const [lastViewedAt, setLastViewedAt] = useState<number>(0)

  useEffect(() => {
    setNow(Date.now())
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(LS_KEY) : null
    if (stored) {
      const n = Number(stored)
      if (!Number.isNaN(n)) setLastViewedAt(n)
    }
  }, [])

  // Compute counts. An item is unread if its timestamp is newer than the
  // last-viewed mark we have in localStorage.
  const unreadIds = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.ts > lastViewedAt) set.add(it.id)
    }
    return set
  }, [items, lastViewedAt])

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: unreadIds.size,
      mention: items.filter((i) => i.type === 'mention').length,
    }),
    [items, unreadIds],
  )

  const visible = useMemo(() => {
    if (tab === 'unread') return items.filter((i) => unreadIds.has(i.id))
    if (tab === 'mention') return items.filter((i) => i.type === 'mention')
    return items
  }, [items, tab, unreadIds])

  const markAllRead = () => {
    const t = Date.now()
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY, String(t))
    }
    setLastViewedAt(t)
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-3 font-display text-[clamp(36px,6vw,64px)] font-normal leading-none tracking-tight">
              Your <em className="italic text-amber-500">notifications</em>.
            </h1>
            <p className="max-w-[540px] text-base leading-relaxed text-fg-secondary sm:text-lg">
              The things that need your eyes — and a few you’ll be glad to hear about.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllRead}
              disabled={counts.unread === 0}
              className="inline-flex items-center gap-1.5 rounded-md border-none bg-transparent px-3 py-2 text-sm text-fg-secondary transition-colors hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-secondary"
            >
              <Check className="size-3.5" strokeWidth={2.5} />
              Mark all read
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/[0.08]">
          <TabButton
            active={tab === 'all'}
            label="All"
            count={counts.all}
            onClick={() => setTab('all')}
          />
          <TabButton
            active={tab === 'unread'}
            label="Unread"
            count={counts.unread}
            onClick={() => setTab('unread')}
          />
          <TabButton
            active={tab === 'mention'}
            label="Mentions"
            count={counts.mention}
            onClick={() => setTab('mention')}
          />
        </div>

        {/* Feed */}
        {visible.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <Feed items={visible} unreadIds={unreadIds} now={now} />
        )}
      </div>
    </div>
  )
}

/* ================================================================
   Tab pill
   ================================================================ */

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-3.5',
        active
          ? 'border-amber-500 text-fg-primary'
          : 'border-transparent text-fg-tertiary hover:text-fg-secondary',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-2 py-px text-[11px] font-semibold tabular-nums',
          active ? 'bg-amber-500/[0.15] text-amber-500' : 'bg-bg-surface-2 text-fg-tertiary',
        )}
      >
        {count}
      </span>
    </button>
  )
}

/* ================================================================
   Feed — groups items by time bucket
   ================================================================ */

function Feed({
  items,
  unreadIds,
  now,
}: {
  items: NotificationItem[]
  unreadIds: Set<string>
  now: number
}) {
  // Bucket in display order
  const buckets: Array<{ label: string; items: NotificationItem[] }> = []
  for (const it of items) {
    // Use a stable epoch for SSR: bucket against the latest item if we don't
    // know "now" yet, so the rendered groups don't shift on hydration.
    const refNow = now > 0 ? now : (items[0]?.ts ?? 0) + 1
    const label = groupOf(it.ts, refNow)
    const last = buckets[buckets.length - 1]
    if (!last || last.label !== label) buckets.push({ label, items: [it] })
    else last.items.push(it)
  }

  return (
    <div className="flex flex-col gap-6">
      {buckets.map((b) => (
        <div key={b.label} className="flex flex-col gap-2">
          <div className="flex items-center gap-3 py-3 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            <span>{b.label}</span>
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>
          <div className="flex flex-col gap-2">
            {b.items.map((it) => (
              <NotificationRow
                key={it.id}
                item={it}
                unread={unreadIds.has(it.id)}
                now={now}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================
   Notification row — wraps type-specific body
   ================================================================ */

const ICON_CLASS: Record<NotificationType, string> = {
  join: 'bg-blue-500/[0.16] text-blue-300',
  invite: 'bg-amber-500/[0.16] text-amber-500',
  step: 'bg-green-500/[0.16] text-green-300',
  board: 'bg-amber-500/[0.16] text-amber-500',
  mention: 'bg-blue-200/[0.15] text-blue-200',
  fork: 'bg-amber-400/[0.16] text-amber-300',
  milestone: 'bg-green-300/[0.15] text-green-300',
  skill: 'bg-blue-500/[0.16] text-blue-300',
  reminder: 'bg-red-500/[0.14] text-red-300',
  featured: 'bg-amber-500/[0.16] text-amber-500',
}

const ICON_FOR: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  join: UserPlus,
  invite: MailOpen,
  step: Check,
  board: MessageSquare,
  mention: AtSign,
  fork: GitFork,
  milestone: Star,
  skill: Target,
  reminder: Clock,
  featured: Sparkles,
}

function NotificationRow({
  item,
  unread,
  now,
}: {
  item: NotificationItem
  unread: boolean
  now: number
}) {
  const Icon = ICON_FOR[item.type]
  return (
    <article
      className={cn(
        'relative grid grid-cols-[44px_1fr_auto] gap-4 rounded-xl border bg-bg-surface p-4 transition-all duration-standard hover:-translate-y-px hover:shadow-sm sm:p-5',
        unread
          ? 'border-amber-500/[0.18] bg-[linear-gradient(90deg,rgba(244,165,53,0.04),var(--color-bg-surface)_30%)]'
          : 'border-white/[0.08] hover:border-neutral-700',
      )}
    >
      {unread && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-px bottom-3.5 top-3.5 w-[3px] rounded-sm bg-amber-500 shadow-[0_0_8px_rgba(244,165,53,0.4)]"
        />
      )}

      <div
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-lg',
          ICON_CLASS[item.type],
        )}
      >
        <Icon className="size-5" />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Body item={item} />
      </div>

      <div className="flex flex-col items-end gap-2 whitespace-nowrap">
        <span className="text-xs tabular-nums text-fg-tertiary">
          {now > 0 ? fmtTime(item.ts, now) : ' '}
        </span>
      </div>
    </article>
  )
}

/* ================================================================
   Body renderers per notification type
   ================================================================ */

function Actor({ actor }: { actor: NotificationItem['actor'] }) {
  if (!actor) return null
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-fg-primary">
      <span
        className="flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold text-blue-900"
        style={{ background: actor.tint }}
      >
        {actor.initials}
      </span>
      {actor.name}
    </span>
  )
}

function ProjectTag({ project }: { project: NotificationItem['project'] }) {
  if (!project) return null
  return (
    <Link
      href={`/projects/${project.id}`}
      className="inline-flex items-center gap-1.5 font-medium text-amber-500 underline decoration-amber-500/30 underline-offset-[3px] transition-colors hover:decoration-amber-500"
    >
      <span className="size-[7px] rounded-full" style={{ background: project.tint }} />
      {project.name}
    </Link>
  )
}

function Excerpt({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="rounded-r-md border-l-2 border-neutral-700 bg-bg-base px-4 py-3 text-sm italic leading-relaxed text-fg-secondary">
      <span className="text-fg-tertiary">“</span>
      {children}
      <span className="text-fg-tertiary">”</span>
    </blockquote>
  )
}

function Body({ item }: { item: NotificationItem }) {
  switch (item.type) {
    case 'join':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <Actor actor={item.actor} /> <span>joined</span> <ProjectTag project={item.project} />.
          </div>
          {item.meta && <div className="text-xs text-fg-tertiary">{item.meta}</div>}
        </>
      )

    case 'invite':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <Actor actor={item.actor} /> <span>invited you to</span>{' '}
            <ProjectTag project={item.project} />.
          </div>
          {item.note && <Excerpt>{item.note}</Excerpt>}
        </>
      )

    case 'step':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <Actor actor={item.actor} /> <span>completed a step in</span>{' '}
            <ProjectTag project={item.project} />.
          </div>
          {item.step && (
            <div className="inline-flex w-fit items-center gap-2 rounded-md border border-white/[0.08] bg-bg-base px-3 py-2 text-sm text-fg-secondary">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-blue-900">
                <Check className="size-2.5" strokeWidth={3} />
              </span>
              <span className="text-fg-tertiary line-through">{item.step}</span>
            </div>
          )}
        </>
      )

    case 'board':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <Actor actor={item.actor} />{' '}
            <span>posted {item.where ? `a ${item.where}` : 'a message'} in</span>{' '}
            <ProjectTag project={item.project} />.
          </div>
          {item.note && <Excerpt>{item.note}</Excerpt>}
        </>
      )

    case 'mention':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <Actor actor={item.actor} />{' '}
            <span>mentioned you in {item.where ? `a ${item.where}` : 'a thread'} on</span>{' '}
            <ProjectTag project={item.project} />.
          </div>
          {item.note && <Excerpt>{item.note}</Excerpt>}
        </>
      )

    case 'fork':
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
          <Actor actor={item.actor} /> <span>forked your blueprint</span>{' '}
          <b className="text-fg-primary">{item.blueprint}</b> <span>as</span>{' '}
          <b className="text-fg-primary">{item.forkedAs}</b>.
        </div>
      )

    case 'milestone':
      return (
        <>
          <div className="text-sm">
            <b className="text-fg-primary">{item.headline}</b>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-tertiary">
            <span>In</span> <ProjectTag project={item.project} />.
          </div>
          {item.detail && <div className="text-sm text-fg-secondary">{item.detail}</div>}
        </>
      )

    case 'skill':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <ProjectTag project={item.project} /> <span>has an open step needing</span>{' '}
            <b className="text-fg-primary">{item.skill}</b>
            <span> — one of your skills.</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/projects/${item.project?.id ?? ''}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/[0.18]"
            >
              Take a look
              <ArrowRight className="size-3" strokeWidth={2.5} />
            </Link>
          </div>
        </>
      )

    case 'reminder':
      return (
        <>
          <div className="text-sm">
            <b className="text-fg-primary">{item.step}</b>{' '}
            <span className="text-fg-secondary">
              hasn’t moved in {item.idleDays} day{item.idleDays === 1 ? '' : 's'}.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-tertiary">
            <span>You claimed it in</span> <ProjectTag project={item.project} />.
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/projects/${item.project?.id ?? ''}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/[0.18]"
            >
              Pick it back up
            </Link>
            <Link
              href="/my-steps"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-bg-base px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
            >
              Open my steps
            </Link>
          </div>
        </>
      )

    case 'featured':
      return (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            <ProjectTag project={item.project} /> <span>was featured.</span>
          </div>
          {item.detail && <div className="text-sm text-fg-secondary">{item.detail}</div>}
        </>
      )
  }
}

/* ================================================================
   Empty state
   ================================================================ */

function EmptyState({ tab }: { tab: Tab }) {
  const message =
    tab === 'unread'
      ? "Nothing unread. You're all caught up."
      : tab === 'mention'
        ? 'No mentions yet.'
        : 'Nothing here.'
  const subtitle =
    tab === 'unread'
      ? 'New activity will appear here as it happens.'
      : tab === 'mention'
        ? 'Mentions from project boards and threads will land here.'
        : 'When you join projects and claim steps, updates from your team show up here.'

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center">
      <div className="mb-2 flex size-14 items-center justify-center rounded-xl border border-white/[0.08] bg-bg-surface-2 text-fg-secondary">
        <Bell className="size-7" />
      </div>
      <h3 className="font-display text-xl font-normal text-fg-primary">{message}</h3>
      <p className="text-sm text-fg-tertiary">{subtitle}</p>
    </div>
  )
}

// Silence unused import warning — X is reserved for future "dismiss" actions.
export const _unused = X
