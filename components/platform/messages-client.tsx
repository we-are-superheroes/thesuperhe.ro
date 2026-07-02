'use client'

import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  Plus,
  Send,
  MoreVertical,
  User as UserIcon,
  ChevronLeft,
  BellOff,
  Bell,
  Archive,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { initialsOf } from '@/lib/avatar'
import {
  sendMessageAction,
  markConversationReadAction,
  muteConversationAction,
  archiveConversationAction,
  searchUsersAction,
} from '@/app/(platform)/messages/actions'

/* ================================================================
   Types — match the server page's shaped payload exactly.
   ================================================================ */

export interface ConversationListItem {
  id: string
  peer: {
    id: string
    name: string
    avatarUrl: string | null
    location: string | null
    timezone: string | null
    online: boolean
  } | null
  lastMessage: { id: string; preview: string; ts: number } | null
  unreadCount: number
  muted: boolean
  updatedAt: number
}

export interface ThreadMessage {
  id: string
  body: string
  senderId: string | null
  senderName: string | null
  ts: number
  edited: boolean
  deleted: boolean
  mine: boolean
}

export interface ThreadData {
  conversationId: string
  muted: boolean
  archived: boolean
  peer: ConversationListItem['peer']
  messages: ThreadMessage[]
}

interface CurrentUser {
  id: string
  name: string
  avatarUrl: string | null
}

/* ================================================================
   Tint palette — same hashing pattern as notifications, so a given
   user gets a consistent gradient across the app.
   ================================================================ */

const GRADIENTS = [
  'bg-[linear-gradient(135deg,#B86E00,#F4A535_50%,#FAD08F)]',
  'bg-[linear-gradient(135deg,#1A5C40,#3DAF7C_60%,#7DD3B0)]',
  'bg-[linear-gradient(135deg,#2E5FAA,#4A7FD4_60%,#B2D0F5)]',
  'bg-[linear-gradient(135deg,#5C3600,#B86E00_60%,#F7BD64)]',
  'bg-[linear-gradient(135deg,#1B3A6B,#2E5FAA_60%,#7AAEE8)]',
  'bg-[linear-gradient(135deg,#7A1A1A,#E05252_60%,#F09898)]',
]

function gradientFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]
}

/* ================================================================
   Date formatting helpers
   ================================================================ */

const ONE_DAY = 24 * 60 * 60 * 1000

function fmtRowTime(ts: number, now: number): string {
  const d = new Date(ts)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (now - ts < 7 * ONE_DAY) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(ts: number, now: number): string {
  const d = new Date(ts)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const daysDiff = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / ONE_DAY)
  if (daysDiff === 0) return 'Today'
  if (daysDiff === 1) return 'Yesterday'
  if (daysDiff < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' })
}

/* ================================================================
   Component
   ================================================================ */

export function MessagesClient({
  currentUser,
  conversations,
  openConversationId,
  thread: initialThread,
  view,
}: {
  currentUser: CurrentUser
  conversations: ConversationListItem[]
  openConversationId: string | null
  thread: ThreadData | null
  view: 'inbox' | 'archived'
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [now, setNow] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [thread, setThread] = useState<ThreadData | null>(initialThread)
  const [composer, setComposer] = useState('')
  const [sending, startSend] = useTransition()
  const [, startMutation] = useTransition()
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [showThreadMenu, setShowThreadMenu] = useState(false)
  const [showMobileThread, setShowMobileThread] = useState(false)

  // Hydration-safe "now" — start at 0 server-side; bump in a frame callback
  // after mount, then every minute.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(Date.now()))
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
    }
  }, [])

  // Sync local thread state when the server payload changes (e.g. after a
  // revalidate). Adjust-during-render instead of an effect so the sync
  // happens in the same render pass.
  const [prevInitialThread, setPrevInitialThread] = useState(initialThread)
  if (initialThread !== prevInitialThread) {
    setPrevInitialThread(initialThread)
    setThread(initialThread)
  }

  // Auto-show the thread view on mobile when a conversation is opened.
  const [prevOpenId, setPrevOpenId] = useState(openConversationId)
  if (openConversationId !== prevOpenId) {
    setPrevOpenId(openConversationId)
    if (openConversationId) setShowMobileThread(true)
  }

  // Mark this conversation as read on open + when the tab regains focus.
  useEffect(() => {
    if (!openConversationId) return
    const mark = () => {
      startMutation(async () => {
        await markConversationReadAction(openConversationId)
      })
    }
    mark()
    const onVisible = () => {
      if (document.visibilityState === 'visible') mark()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [openConversationId])

  // Lightweight polling while a conversation is open and the tab is foregrounded.
  useEffect(() => {
    if (!openConversationId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }
    const id = window.setInterval(tick, 10_000)
    return () => window.clearInterval(id)
    // router is stable, but suppress lint for openConversationId dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConversationId])

  // Scroll the thread to bottom on initial load + every new message.
  const threadScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight
    }
  }, [thread?.conversationId, thread?.messages.length])

  // Filtered conversation list — client-side, "name OR last-message text".
  const visibleConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const nameHit = c.peer?.name.toLowerCase().includes(q)
      const previewHit = c.lastMessage?.preview.toLowerCase().includes(q)
      return Boolean(nameHit || previewHit)
    })
  }, [conversations, searchQuery])

  /* ── Actions ───────────────────────────────────────── */

  const openConversation = (conversationId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('conversation', conversationId)
    params.delete('to')
    router.push(`/messages?${params.toString()}`)
    setShowMobileThread(true)
  }

  const send = () => {
    const recipientId = thread?.peer?.id
    const body = composer.trim()
    if (!recipientId || !body || sending) return

    // Optimistic insert
    const optimisticId = `tmp-${Date.now()}`
    const ts = Date.now()
    const optimistic: ThreadMessage = {
      id: optimisticId,
      body,
      senderId: currentUser.id,
      senderName: currentUser.name,
      ts,
      edited: false,
      deleted: false,
      mine: true,
    }
    setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev))
    setComposer('')

    startSend(async () => {
      const result = await sendMessageAction(recipientId, body)
      if (!result.success) {
        // Roll back the optimistic insert on error
        setThread((prev) =>
          prev
            ? { ...prev, messages: prev.messages.filter((m) => m.id !== optimisticId) }
            : prev,
        )
        setComposer(body)
        alert(result.error)
        return
      }
      // Server has the real id now; refresh so we pick up the canonical message.
      router.refresh()
    })
  }

  const toggleMute = () => {
    if (!thread) return
    const next = !thread.muted
    const prev = thread
    setThread({ ...thread, muted: next })
    setShowThreadMenu(false)
    startMutation(async () => {
      const result = await muteConversationAction(thread.conversationId, next)
      if (!result.success) setThread(prev)
    })
  }

  const toggleArchive = () => {
    if (!thread) return
    const next = !thread.archived
    setShowThreadMenu(false)
    startMutation(async () => {
      const result = await archiveConversationAction(thread.conversationId, next)
      if (result.success) {
        // Send the user to the view where the conversation now lives so
        // they can still see it: archived → /messages?view=archived,
        // unarchived → /messages (inbox).
        router.push(next ? '/messages?view=archived' : '/messages')
      }
    })
  }

  /* ── Render ────────────────────────────────────────── */

  const sortedConversations = [...visibleConversations].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  )

  return (
    <div className="grid h-full flex-1 grid-cols-1 overflow-hidden md:grid-cols-[340px_1fr]">
      {/* ── Conversation list pane ── */}
      <section
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden border-white/[0.08] bg-bg-base md:border-r',
          showMobileThread && openConversationId ? 'hidden md:flex' : 'flex',
        )}
      >
        <header className="flex shrink-0 flex-col gap-4 border-b border-white/[0.08] px-5 pb-4 pt-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-3xl font-normal leading-none tracking-tight">
              Messages
            </h1>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNewMessage((v) => !v)}
                title="New message"
                aria-label="New message"
                className={cn(
                  'flex size-9 items-center justify-center rounded-lg transition-all duration-fast',
                  showNewMessage
                    ? 'bg-amber-400 text-amber-900'
                    : 'bg-amber-500 text-amber-900 hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber',
                )}
              >
                {showNewMessage ? <X className="size-4" /> : <Plus className="size-4" strokeWidth={2.5} />}
              </button>
              {showNewMessage && (
                <NewMessagePopover
                  onClose={() => setShowNewMessage(false)}
                  onPick={(userId) => {
                    setShowNewMessage(false)
                    router.push(`/messages?to=${userId}`)
                  }}
                />
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people and messages"
              className="w-full rounded-lg border border-white/[0.08] bg-bg-surface py-2.5 pl-9 pr-3 text-sm text-fg-primary outline-none transition-colors placeholder:text-fg-tertiary focus:border-neutral-700"
            />
          </div>
          {/* Inbox / Archived toggle */}
          <div className="inline-flex shrink-0 self-start rounded-lg border border-white/[0.08] bg-bg-surface p-0.5 text-xs">
            <Link
              href="/messages"
              className={cn(
                'rounded-md px-3 py-1.5 font-medium transition-colors',
                view === 'inbox'
                  ? 'bg-bg-surface-2 text-fg-primary'
                  : 'text-fg-secondary hover:text-fg-primary',
              )}
            >
              Inbox
            </Link>
            <Link
              href="/messages?view=archived"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
                view === 'archived'
                  ? 'bg-bg-surface-2 text-fg-primary'
                  : 'text-fg-secondary hover:text-fg-primary',
              )}
            >
              <Archive className="size-3" strokeWidth={2.5} />
              Archived
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {sortedConversations.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-fg-tertiary">
              {searchQuery.trim() ? (
                <>No matches.</>
              ) : view === 'archived' ? (
                <>
                  <p className="mb-2 font-display text-base text-fg-primary">No archived conversations.</p>
                  Archive a thread from its <MoreVertical className="inline size-3" /> menu and it&apos;ll land here.
                </>
              ) : (
                <>
                  <p className="mb-2 font-display text-base text-fg-primary">No conversations yet.</p>
                  Use the <Plus className="inline size-3" /> button to start one.
                </>
              )}
            </div>
          ) : (
            sortedConversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === openConversationId}
                now={now}
                onClick={() => openConversation(c.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Thread pane ── */}
      <section
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-base',
          showMobileThread && openConversationId ? 'flex' : 'hidden md:flex',
        )}
      >
        {thread && thread.peer ? (
          <>
            <header className="flex shrink-0 items-center gap-4 border-b border-white/[0.08] px-4 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setShowMobileThread(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary md:hidden"
                aria-label="Back to conversations"
              >
                <ChevronLeft className="size-4" />
              </button>
              <Avatar
                size="md"
                user={thread.peer}
                showPresence={thread.peer.online}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-base font-semibold text-fg-primary">
                  <Link href={`/users/${thread.peer.id}`} className="hover:text-amber-500">
                    {thread.peer.name}
                  </Link>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-fg-tertiary">
                  {thread.peer.online && (
                    <>
                      <span className="size-1.5 rounded-full bg-green-500" />
                      <span>Online</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{[thread.peer.location, thread.peer.timezone].filter(Boolean).join(' · ') || '—'}</span>
                  {thread.muted && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-fg-secondary">
                        <BellOff className="size-3" />
                        Muted
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/users/${thread.peer.id}`}
                  className="flex size-9 items-center justify-center rounded-lg border border-neutral-700 text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
                  title="View profile"
                >
                  <UserIcon className="size-4" />
                </Link>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowThreadMenu((v) => !v)}
                    className="flex size-9 items-center justify-center rounded-lg border border-neutral-700 text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
                    title="More"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                  {showThreadMenu && (
                    <ThreadMenu
                      muted={thread.muted}
                      archived={thread.archived}
                      onMute={toggleMute}
                      onArchive={toggleArchive}
                      onClose={() => setShowThreadMenu(false)}
                    />
                  )}
                </div>
              </div>
            </header>

            <div ref={threadScrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
              <div className="mx-auto flex max-w-[720px] flex-col gap-3">
                {thread.messages.length === 0 ? (
                  <div className="py-12 text-center text-sm text-fg-tertiary">
                    No messages yet. Say hi to {thread.peer.name.split(' ')[0]}.
                  </div>
                ) : (
                  renderThread(thread, currentUser, now)
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
              className="shrink-0 border-t border-white/[0.08] bg-bg-base px-4 py-4 sm:px-6"
            >
              <div className="mx-auto flex max-w-[720px] flex-col gap-1.5">
                <div className="flex items-end gap-3 rounded-2xl border border-neutral-700 bg-bg-surface px-3.5 py-2 transition-colors focus-within:border-neutral-600">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        send()
                      }
                    }}
                    placeholder="Write a message…"
                    rows={1}
                    className="max-h-[160px] min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1.5 text-sm leading-relaxed text-fg-primary outline-none placeholder:text-fg-tertiary"
                  />
                  <button
                    type="submit"
                    disabled={sending || !composer.trim()}
                    aria-label="Send"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-amber-900 transition-all duration-fast hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:bg-bg-surface-3 disabled:text-fg-tertiary disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    <Send className="size-4" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="flex justify-between px-1 text-[11px] text-fg-tertiary">
                  <span>
                    <kbd className="inline-block rounded border border-white/[0.08] bg-bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-secondary">
                      Enter
                    </kbd>{' '}
                    to send ·{' '}
                    <kbd className="inline-block rounded border border-white/[0.08] bg-bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-secondary">
                      Shift
                    </kbd>{' '}
                    +{' '}
                    <kbd className="inline-block rounded border border-white/[0.08] bg-bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-secondary">
                      Enter
                    </kbd>{' '}
                    for newline
                  </span>
                  {composer.length > 3500 && (
                    <span className={composer.length > 4000 ? 'text-red-300' : 'text-amber-500'}>
                      {composer.length} / 4000
                    </span>
                  )}
                </div>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-fg-tertiary">
            <p className="font-display text-2xl text-fg-primary">Pick a conversation.</p>
            <p className="max-w-[360px] text-sm">
              Or start a new one — click the <Plus className="inline size-3" /> button to find someone.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

/* ================================================================
   Conversation row
   ================================================================ */

function ConversationRow({
  conversation,
  active,
  now,
  onClick,
}: {
  conversation: ConversationListItem
  active: boolean
  now: number
  onClick: () => void
}) {
  const unread = conversation.unreadCount > 0
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative grid w-full grid-cols-[44px_1fr_auto] items-start gap-3 rounded-lg p-3 text-left transition-colors duration-fast',
        active ? 'bg-bg-surface' : 'hover:bg-bg-surface',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute bottom-3.5 left-0 top-3.5 w-[3px] rounded-sm bg-amber-500"
        />
      )}
      <Avatar size="lg" user={conversation.peer} showPresence={conversation.peer?.online} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-fg-primary">
            {conversation.peer?.name ?? 'Conversation'}
          </span>
          <span
            className={cn(
              'shrink-0 text-[11px] tabular-nums',
              unread ? 'font-semibold text-amber-500' : 'text-fg-tertiary',
            )}
          >
            {conversation.lastMessage && now > 0 ? fmtRowTime(conversation.lastMessage.ts, now) : ''}
          </span>
        </div>
        <div
          className={cn(
            'line-clamp-2 text-xs leading-normal',
            unread ? 'text-fg-secondary' : 'text-fg-tertiary',
          )}
        >
          {conversation.lastMessage?.preview ?? 'No messages yet'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 pt-1">
        {unread && (
          <span
            className="size-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(244,165,53,0.6)]"
            title={`${conversation.unreadCount} unread`}
          />
        )}
        {conversation.muted && <BellOff className="size-3 text-fg-tertiary" />}
      </div>
    </button>
  )
}

/* ================================================================
   Avatar — with optional presence dot
   ================================================================ */

function Avatar({
  user,
  size,
  showPresence,
}: {
  user: ConversationListItem['peer'] | null
  size: 'lg' | 'md' | 'sm'
  showPresence?: boolean
}) {
  const dims =
    size === 'lg'
      ? 'size-11 text-lg'
      : size === 'md'
        ? 'size-10 text-base'
        : 'size-7 text-xs'
  const presenceSize = size === 'lg' ? 'size-[10px]' : 'size-2'
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-blue-900',
        dims,
        !user?.avatarUrl && (user ? gradientFor(user.id) : 'bg-bg-surface-3'),
      )}
    >
      {user?.avatarUrl ? (
        <Image src={user.avatarUrl} alt={user.name} fill sizes="44px" className="object-cover" />
      ) : user ? (
        initialsOf(user.name)
      ) : (
        '?'
      )}
      {showPresence && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-bg-base bg-green-500',
            presenceSize,
          )}
        />
      )}
    </div>
  )
}

/* ================================================================
   Thread rendering — day dividers + bubbles
   ================================================================ */

function renderThread(thread: ThreadData, me: CurrentUser, now: number) {
  const out: React.ReactNode[] = []
  let lastDay = ''
  // Show day labels even if `now` isn't initialised (use the latest message's ts).
  const refNow = now > 0 ? now : thread.messages[thread.messages.length - 1]?.ts ?? Date.now()
  for (const m of thread.messages) {
    const day = dayLabel(m.ts, refNow)
    if (day !== lastDay) {
      out.push(
        <div
          key={`day-${m.id}`}
          className="my-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-fg-tertiary"
        >
          <span className="h-px flex-1 bg-white/[0.08]" />
          <span>{day}</span>
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>,
      )
      lastDay = day
    }
    out.push(<MessageBubble key={m.id} message={m} me={me} peer={thread.peer} />)
  }
  return out
}

function MessageBubble({
  message,
  me,
  peer,
}: {
  message: ThreadMessage
  me: CurrentUser
  peer: ConversationListItem['peer']
}) {
  const mine = message.mine
  return (
    <div className={cn('flex max-w-[80%] gap-3', mine && 'flex-row-reverse self-end')}>
      <Avatar
        size="sm"
        user={
          mine
            ? { id: me.id, name: me.name, avatarUrl: me.avatarUrl, location: null, timezone: null, online: false }
            : peer
        }
      />
      <div className={cn('flex min-w-0 flex-col gap-1', mine && 'items-end')}>
        <div
          className={cn(
            'whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed',
            mine
              ? 'rounded-[14px_14px_4px_14px] bg-gradient-to-br from-amber-500 to-amber-400 text-amber-900'
              : 'rounded-[14px_14px_14px_4px] border border-white/[0.08] bg-bg-surface text-fg-primary',
            message.deleted && 'italic opacity-60',
          )}
        >
          {message.deleted ? '[deleted]' : message.body}
        </div>
        <span className="px-1 text-[11px] tabular-nums text-fg-tertiary">
          {fmtMessageTime(message.ts)}
          {message.edited && !message.deleted && ' · edited'}
        </span>
      </div>
    </div>
  )
}

/* ================================================================
   New-message popover
   ================================================================ */

function NewMessagePopover({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (userId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<
    Array<{ id: string; name: string; avatarUrl: string | null; location: string | null }>
  >([])
  const [searching, startSearch] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Debounce + run search. The empty-query clear also goes through the
  // timeout callback so no state is set synchronously inside the effect.
  useEffect(() => {
    const trimmed = query.trim()
    const handle = window.setTimeout(
      () => {
        if (!trimmed) {
          setResults([])
          return
        }
        startSearch(async () => {
          const result = await searchUsersAction(query)
          if (result.success) setResults(result.data)
        })
      },
      trimmed ? 200 : 0,
    )
    return () => window.clearTimeout(handle)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-[320px] overflow-hidden rounded-xl border border-white/[0.08] bg-bg-surface shadow-xl"
    >
      <div className="border-b border-white/[0.08] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            autoFocus
            className="w-full rounded-md border border-neutral-700 bg-bg-surface-2 py-1.5 pl-8 pr-2 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
          />
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto py-1">
        {query.trim() && results.length === 0 && !searching && (
          <div className="px-3 py-4 text-center text-xs text-fg-tertiary">No matches.</div>
        )}
        {!query.trim() && (
          <div className="px-3 py-4 text-center text-xs text-fg-tertiary">
            Search by name to start a conversation.
          </div>
        )}
        {results.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => onPick(u.id)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-surface-2"
          >
            <Avatar
              size="md"
              user={{
                id: u.id,
                name: u.name,
                avatarUrl: u.avatarUrl,
                location: u.location,
                timezone: null,
                online: false,
              }}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-fg-primary">{u.name}</span>
              {u.location && (
                <span className="truncate text-xs text-fg-tertiary">{u.location}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ================================================================
   Thread menu (⋯ → Mute / Archive)
   ================================================================ */

function ThreadMenu({
  muted,
  archived,
  onMute,
  onArchive,
  onClose,
}: {
  muted: boolean
  archived: boolean
  onMute: () => void
  onArchive: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-[200px] overflow-hidden rounded-xl border border-white/[0.08] bg-bg-surface shadow-xl"
    >
      <button
        type="button"
        onClick={onMute}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
      >
        {muted ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
        {muted ? 'Unmute' : 'Mute notifications'}
      </button>
      <button
        type="button"
        onClick={onArchive}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
      >
        <Archive className="size-3.5" />
        {archived ? 'Unarchive' : 'Archive'}
      </button>
    </div>
  )
}
