'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
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
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
  acceptJoinRequestAction,
  declineJoinRequestAction,
} from '@/app/(platform)/notifications/actions'

/* ================================================================
   Types
   ================================================================ */

export type NotificationType =
  | 'project_join'
  | 'project_join_request'
  | 'project_leave'
  | 'project_updated'
  | 'project_status_changed'
  | 'step_claimed'
  | 'step_unclaimed'
  | 'step_completed'
  | 'step_needs_help'
  | 'step_assigned'
  | 'blueprint_forked'
  | 'skill_match'
  | 'reminder_step_idle'
  | 'message_received'
  | 'mention'
  | 'invite_received'
  | 'project_milestone'
  | 'welcome'

export interface NotificationItem {
  id: string
  type: NotificationType
  ts: number
  readAt: number | null
  resolvedAt: number | null
  title: string
  body: string | null
  actor?: { id: string; name: string; initials: string; tint: string }
  project?: { id: string; name: string; tint: string }
  data: Record<string, unknown> | null
}

type Tab = 'all' | 'unread' | 'action' | 'mention'

const ACTIONABLE_TYPES = new Set<NotificationType>(['project_join_request', 'invite_received'])

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
  const [items, setItems] = useState(initialItems)
  const [tab, setTab] = useState<Tab>('all')
  const [now, setNow] = useState(0)
  const [, startTransition] = useTransition()

  // Keep local state synced when the server re-renders the page (e.g. after
  // a mark-read action revalidates) — adjusted during render, not an effect.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems)
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems)
    setItems(initialItems)
  }

  // Hydration-safe "now": 0 on the server, bumped in a frame callback.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(Date.now()))
    return () => cancelAnimationFrame(raf)
  }, [])

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: items.filter((i) => i.readAt === null).length,
      action: items.filter(
        (i) => ACTIONABLE_TYPES.has(i.type) && i.resolvedAt === null,
      ).length,
      mention: items.filter((i) => i.type === 'mention').length,
    }),
    [items],
  )

  const visible = useMemo(() => {
    if (tab === 'unread') return items.filter((i) => i.readAt === null)
    if (tab === 'mention') return items.filter((i) => i.type === 'mention')
    if (tab === 'action')
      return items.filter((i) => ACTIONABLE_TYPES.has(i.type) && i.resolvedAt === null)
    return items
  }, [items, tab])

  const markRead = (id: string) => {
    // Optimistic
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, readAt: Date.now() } : it)))
    startTransition(async () => {
      const r = await markNotificationReadAction(id)
      if (!r.success) {
        // Rollback on failure
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, readAt: null } : it)))
      }
    })
  }

  const markAllRead = () => {
    const at = Date.now()
    const prev = items
    setItems(items.map((it) => (it.readAt === null ? { ...it, readAt: at } : it)))
    startTransition(async () => {
      const r = await markAllNotificationsReadAction()
      if (!r.success) setItems(prev)
    })
  }

  const accept = (id: string) => {
    const at = Date.now()
    const prev = items
    setItems(items.map((it) => (it.id === id ? { ...it, resolvedAt: at, readAt: at, data: { ...(it.data ?? {}), resolution: 'accepted' } } : it)))
    startTransition(async () => {
      const r = await acceptJoinRequestAction(id)
      if (!r.success) setItems(prev)
    })
  }

  const decline = (id: string) => {
    const at = Date.now()
    const prev = items
    setItems(items.map((it) => (it.id === id ? { ...it, resolvedAt: at, readAt: at, data: { ...(it.data ?? {}), resolution: 'declined' } } : it)))
    startTransition(async () => {
      const r = await declineJoinRequestAction(id)
      if (!r.success) setItems(prev)
    })
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
          <TabButton active={tab === 'all'} label="All" count={counts.all} onClick={() => setTab('all')} />
          <TabButton
            active={tab === 'unread'}
            label="Unread"
            count={counts.unread}
            onClick={() => setTab('unread')}
          />
          <TabButton
            active={tab === 'action'}
            label="Needs action"
            count={counts.action}
            onClick={() => setTab('action')}
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
          <Feed
            items={visible}
            now={now}
            onMarkRead={markRead}
            onAccept={accept}
            onDecline={decline}
          />
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
  now,
  onMarkRead,
  onAccept,
  onDecline,
}: {
  items: NotificationItem[]
  now: number
  onMarkRead: (id: string) => void
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}) {
  const buckets: Array<{ label: string; items: NotificationItem[] }> = []
  for (const it of items) {
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
                now={now}
                onMarkRead={onMarkRead}
                onAccept={onAccept}
                onDecline={onDecline}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================
   Notification row
   ================================================================ */

const ICON_CLASS: Record<NotificationType, string> = {
  project_join: 'bg-blue-500/[0.16] text-blue-300',
  project_join_request: 'bg-amber-500/[0.16] text-amber-500',
  project_leave: 'bg-bg-surface-3 text-fg-secondary',
  project_updated: 'bg-bg-surface-3 text-fg-secondary',
  project_status_changed: 'bg-bg-surface-3 text-fg-secondary',
  step_claimed: 'bg-blue-500/[0.16] text-blue-300',
  step_unclaimed: 'bg-bg-surface-3 text-fg-secondary',
  step_completed: 'bg-green-500/[0.16] text-green-300',
  step_needs_help: 'bg-amber-500/[0.16] text-amber-500',
  step_assigned: 'bg-blue-500/[0.16] text-blue-300',
  blueprint_forked: 'bg-amber-400/[0.16] text-amber-300',
  skill_match: 'bg-blue-500/[0.16] text-blue-300',
  reminder_step_idle: 'bg-red-500/[0.14] text-red-300',
  message_received: 'bg-blue-200/[0.15] text-blue-200',
  mention: 'bg-blue-200/[0.15] text-blue-200',
  invite_received: 'bg-amber-500/[0.16] text-amber-500',
  project_milestone: 'bg-green-300/[0.15] text-green-300',
  welcome: 'bg-amber-500/[0.16] text-amber-500',
}

const ICON_FOR: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  project_join: UserPlus,
  project_join_request: UserPlus,
  project_leave: UserPlus,
  project_updated: MessageSquare,
  project_status_changed: Sparkles,
  step_claimed: Check,
  step_unclaimed: Clock,
  step_completed: Check,
  step_needs_help: Target,
  step_assigned: Target,
  blueprint_forked: GitFork,
  skill_match: Target,
  reminder_step_idle: Clock,
  message_received: MessageSquare,
  mention: AtSign,
  invite_received: MailOpen,
  project_milestone: Star,
  welcome: Sparkles,
}

function NotificationRow({
  item,
  now,
  onMarkRead,
  onAccept,
  onDecline,
}: {
  item: NotificationItem
  now: number
  onMarkRead: (id: string) => void
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}) {
  const Icon = ICON_FOR[item.type]
  const unread = item.readAt === null
  const actionable = ACTIONABLE_TYPES.has(item.type) && item.resolvedAt === null
  const resolution = (item.data as { resolution?: string } | null)?.resolution

  const handleRowClick = () => {
    if (unread) onMarkRead(item.id)
  }

  return (
    <article
      role={unread ? 'button' : undefined}
      tabIndex={unread ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (unread && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleRowClick()
        }
      }}
      className={cn(
        'relative grid grid-cols-[44px_1fr_auto] gap-4 rounded-xl border bg-bg-surface p-4 transition-all duration-standard hover:-translate-y-px hover:shadow-sm sm:p-5',
        unread
          ? 'cursor-pointer border-amber-500/[0.18] bg-[linear-gradient(90deg,rgba(244,165,53,0.04),var(--color-bg-surface)_30%)]'
          : 'border-white/[0.08] hover:border-neutral-700',
      )}
    >
      {unread && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-px bottom-3.5 top-3.5 w-[3px] rounded-sm bg-amber-500 shadow-[0_0_8px_rgba(244,165,53,0.4)]"
        />
      )}

      <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', ICON_CLASS[item.type])}>
        <Icon className="size-5" />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <RowTitle item={item} />
        {item.body && (
          <blockquote className="rounded-r-md border-l-2 border-neutral-700 bg-bg-base px-4 py-3 text-sm italic leading-relaxed text-fg-secondary">
            <span className="text-fg-tertiary">“</span>
            {item.body}
            <span className="text-fg-tertiary">”</span>
          </blockquote>
        )}

        {/* Actionable join-request chips */}
        {actionable && item.type === 'project_join_request' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAccept(item.id)
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/[0.12] px-3 py-1.5 text-xs font-medium text-green-300 transition-colors hover:bg-green-500/[0.18]"
            >
              <Check className="size-3" strokeWidth={2.5} />
              Welcome them
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDecline(item.id)
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-bg-base px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-500 hover:bg-red-500/[0.12]"
            >
              <X className="size-3" strokeWidth={2.5} />
              Not a fit
            </button>
          </div>
        )}

        {/* Resolved confirmation */}
        {!actionable && ACTIONABLE_TYPES.has(item.type) && resolution && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 text-xs italic',
              resolution === 'accepted' ? 'text-green-300' : 'text-red-300',
            )}
          >
            {resolution === 'accepted' ? (
              <>
                <Check className="size-3" strokeWidth={2.5} />
                Welcomed to the project.
              </>
            ) : (
              <>
                <X className="size-3" strokeWidth={2.5} />
                Politely declined.
              </>
            )}
          </div>
        )}

        {/* Deep link into a message thread for message_received rows. */}
        {item.type === 'message_received' &&
          (() => {
            const convId = (item.data as { conversationId?: string } | null)?.conversationId
            if (!convId) return null
            return (
              <Link
                href={`/messages?conversation=${convId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex w-fit items-center gap-1 text-xs font-medium text-amber-500 hover:underline"
              >
                Open conversation
                <ArrowRight className="size-3" strokeWidth={2.5} />
              </Link>
            )
          })()}

        {/* Generic deep link for non-actionable rows when a project is attached */}
        {item.type !== 'message_received' && !ACTIONABLE_TYPES.has(item.type) && item.project && (
          <Link
            href={`/projects/${item.project.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-amber-500 hover:underline"
          >
            <span className="size-[7px] rounded-full" style={{ background: item.project.tint }} />
            Open {item.project.name}
            <ArrowRight className="size-3" strokeWidth={2.5} />
          </Link>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 whitespace-nowrap">
        <span className="text-xs tabular-nums text-fg-tertiary">
          {now > 0 ? fmtTime(item.ts, now) : ' '}
        </span>
      </div>
    </article>
  )
}

function RowTitle({ item }: { item: NotificationItem }) {
  // The title was rendered at write time as plain text. If we have an actor,
  // bolt their avatar pill in front of the line and link it to their profile.
  if (item.actor) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
        <Link
          href={`/users/${item.actor.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 font-semibold text-fg-primary transition-opacity hover:opacity-80"
        >
          <span
            className="flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold text-blue-900"
            style={{ background: item.actor.tint }}
          >
            {item.actor.initials}
          </span>
        </Link>
        <span>{item.title}</span>
      </div>
    )
  }
  return <div className="text-sm text-fg-primary">{item.title}</div>
}

/* ================================================================
   Empty state
   ================================================================ */

function EmptyState({ tab }: { tab: Tab }) {
  let message: string
  let subtitle: string
  if (tab === 'unread') {
    message = "Nothing unread. You're all caught up."
    subtitle = 'New activity will appear here as it happens.'
  } else if (tab === 'mention') {
    message = 'No mentions yet.'
    subtitle = 'Mentions from project boards and threads will land here.'
  } else if (tab === 'action') {
    message = 'Nothing waiting on you.'
    subtitle = 'Join requests and invites will appear here when they need a decision.'
  } else {
    message = 'Nothing here.'
    subtitle =
      'When you join projects and claim steps, updates from your team show up here.'
  }

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
