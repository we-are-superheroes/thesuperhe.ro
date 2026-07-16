'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Globe,
  Lock,
  Check,
  Users,
  Send,
  MoreHorizontal,
  ArrowRight,
  Megaphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { gradientFor, initialOf } from '@/lib/avatar'
import { useLocale, useTranslations } from 'next-intl'
import { fmtAgo } from '@/lib/format'
import {
  postUpdateAction,
  editUpdateAction,
  deleteUpdateAction,
} from '@/app/(platform)/projects/[id]/update-actions'
import { useProjectTabs } from './project-tabs'

/* ================================================================
   Project updates — composer (lead only), feed of posts + derived
   milestones, and the members-only gate for visitors. All data is
   fetched by the server page and passed in; mutations go through
   server actions and rely on revalidatePath to refresh the feed.
   ================================================================ */

export type UpdatesFeedItem =
  | {
      kind: 'update'
      id: string
      body: string
      visibility: 'public' | 'members'
      createdAtMs: number
      editedAtMs: number | null
      author: { id: string; name: string } | null
      isMine: boolean
    }
  | { kind: 'step_completed'; id: string; stepTitle: string; atMs: number }
  | { kind: 'members_joined'; id: string; names: string[]; atMs: number }

function joinNames(
  names: string[],
  t: ReturnType<typeof useTranslations<'project'>>,
): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) {
    return t('milestones.twoNames', { a: names[0], b: names[1] })
  }
  return t('milestones.moreNames', {
    first: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  })
}

/* ── Overview teaser ─────────────────────────────────────────── */

export function LatestUpdateTeaser({
  authorName,
  body,
  createdAtMs,
}: {
  authorName: string
  body: string
  createdAtMs: number
}) {
  const t = useTranslations('project')
  const { setTab } = useProjectTabs()
  const locale = useLocale()
  return (
    <button
      type="button"
      onClick={() => setTab('updates')}
      title={t('updates.openTabTitle')}
      className="mt-8 flex w-full items-center gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface p-4 text-left transition-colors duration-fast hover:border-amber-500/40 sm:p-5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/[0.14] text-amber-500">
        <Megaphone className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-tertiary">
          {t('updates.latestUpdateBy', { name: authorName })}
        </span>
        <span className="line-clamp-2 text-sm text-fg-primary">{body}</span>
      </span>
      <span className="hidden shrink-0 text-xs text-fg-tertiary sm:inline">
        {fmtAgo(createdAtMs, locale)}
      </span>
      <ArrowRight className="size-4 shrink-0 text-fg-tertiary" />
    </button>
  )
}

/* ── Updates panel ───────────────────────────────────────────── */

export function ProjectUpdatesPanel({
  projectId,
  projectTitle,
  isSignedIn,
  isMember,
  isLead,
  isAdmin,
  memberCount,
  hiddenMembersOnlyCount,
  items,
}: {
  projectId: string
  projectTitle: string
  isSignedIn: boolean
  isMember: boolean
  isLead: boolean
  isAdmin: boolean
  memberCount: number
  hiddenMembersOnlyCount: number
  items: UpdatesFeedItem[]
}) {
  const t = useTranslations('project')
  const posts = items.filter((i) => i.kind === 'update')
  const membersOnlyCount = posts.filter(
    (p) => p.kind === 'update' && p.visibility === 'members',
  ).length
  const canSeeMembersOnly = isMember || isAdmin

  const heading = (() => {
    if (posts.length === 0 && hiddenMembersOnlyCount === 0)
      return <>{t('updates.noUpdatesYet')}</>
    if (canSeeMembersOnly) {
      return (
        <>
          {t('updates.updateCount', { count: posts.length })}
          {membersOnlyCount > 0 && (
            <>
              {' '}
              <em className="italic text-amber-500">
                {t('updates.forMembersOnly', { count: membersOnlyCount })}
              </em>
            </>
          )}
        </>
      )
    }
    return <>{t('updates.publicUpdateCount', { count: posts.length })}</>
  })()

  return (
    <section>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-amber-500 before:h-px before:w-5 before:bg-amber-500">
          {t('tabs.updates')}
        </div>
        <h2 className="font-display text-3xl font-normal leading-tight tracking-tight">
          {heading}
        </h2>
      </div>

      {isLead && <UpdateComposer projectId={projectId} projectTitle={projectTitle} memberCount={memberCount} />}

      {!isMember && hiddenMembersOnlyCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.10] px-5 py-4 text-sm text-fg-secondary">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/[0.15] text-amber-500">
            <Lock className="size-3.5" />
          </span>
          <span>
            {t.rich('updates.hiddenGate', {
              count: hiddenMembersOnlyCount,
              b: (chunks) => (
                <b className="font-semibold text-fg-primary">{chunks}</b>
              ),
            })}{' '}
            {isSignedIn ? (
              <a href="#join" className="font-semibold text-amber-500 hover:underline">
                {t('updates.joinTheProject')}
              </a>
            ) : (
              <Link href="/sign-in" className="font-semibold text-amber-500 hover:underline">
                {t('updates.signInAndJoin')}
              </Link>
            )}{' '}
            {t('updates.toSeeThem', { count: hiddenMembersOnlyCount })}
          </span>
        </div>
      )}

      {items.length > 0 ? (
        <div className="flex flex-col gap-4">
          {items.map((item) =>
            item.kind === 'update' ? (
              <UpdateCard key={item.id} item={item} isAdmin={isAdmin} />
            ) : (
              <MilestoneRow key={item.id} item={item} />
            ),
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center">
          <h3 className="font-display text-2xl">{t('updates.emptyTitle')}</h3>
          <p className="max-w-[420px] text-sm text-fg-secondary">
            {isLead ? t('updates.emptyLead') : t('updates.emptyViewer')}
          </p>
        </div>
      )}
    </section>
  )
}

/* ── Composer (lead only) ────────────────────────────────────── */

function UpdateComposer({
  projectId,
  projectTitle,
  memberCount,
}: {
  projectId: string
  projectTitle: string
  memberCount: number
}) {
  const t = useTranslations('project')
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'members'>('public')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canPost = body.trim().length > 0 && !isPending

  const publish = () => {
    if (!canPost) return
    setError(null)
    startTransition(async () => {
      const result = await postUpdateAction(projectId, body, visibility)
      if (result.success) {
        setBody('')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-white/[0.12] bg-bg-surface p-4">
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') publish()
        }}
        maxLength={5000}
        placeholder={t('updates.composerPlaceholder', { title: projectTitle })}
        autoComplete="off"
        className="w-full rounded-lg border border-white/[0.08] bg-bg-surface-2 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-tertiary focus:border-amber-500/50 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-0.5 rounded-full border border-white/[0.08] bg-bg-surface-2 p-[3px]">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast',
              visibility === 'public'
                ? 'bg-bg-surface-3 text-fg-primary'
                : 'text-fg-tertiary hover:text-fg-secondary',
            )}
          >
            <Globe className="size-3" />
            {t('updates.public')}
          </button>
          <button
            type="button"
            onClick={() => setVisibility('members')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast',
              visibility === 'members'
                ? 'bg-amber-500/[0.18] text-amber-400'
                : 'text-fg-tertiary hover:text-fg-secondary',
            )}
          >
            <Lock className="size-3" />
            {t('updates.membersOnly')}
          </button>
        </div>
        <span className="text-xs text-fg-tertiary">
          {visibility === 'members'
            ? t('updates.visibleToMembers', { count: memberCount })
            : t('updates.visibleToAnyone')}
        </span>
        <button
          type="button"
          onClick={publish}
          disabled={!canPost}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-blue-900 transition-all duration-fast hover:bg-amber-400 disabled:pointer-events-none disabled:opacity-45"
        >
          <Send className="size-3.5" />
          {isPending ? t('updates.posting') : t('updates.postUpdate')}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  )
}

/* ── Update card ─────────────────────────────────────────────── */

function UpdateCard({
  item,
  isAdmin,
}: {
  item: Extract<UpdatesFeedItem, { kind: 'update' }>
  isAdmin: boolean
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const isPrivate = item.visibility === 'members'
  const authorName = item.author?.name ?? t('updates.formerMember')
  const canManage = item.isMine || isAdmin
  const locale = useLocale()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.body)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const saveEdit = () => {
    if (!draft.trim() || isPending) return
    setError(null)
    startTransition(async () => {
      const result = await editUpdateAction(item.id, draft)
      if (result.success) {
        setEditing(false)
      } else {
        setError(result.error)
      }
    })
  }

  const remove = () => {
    if (!window.confirm(t('updates.confirmDelete'))) return
    setError(null)
    startTransition(async () => {
      const result = await deleteUpdateAction(item.id)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <article
      className={cn(
        'rounded-2xl border p-5',
        isPrivate
          ? 'border-amber-500/30 bg-amber-500/[0.04]'
          : 'border-white/[0.08] bg-bg-surface',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-blue-900"
          style={{ background: gradientFor(item.author?.id ?? 'anon') }}
        >
          {initialOf(authorName)}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg-primary">
            {authorName}
            <span className="rounded-full bg-amber-500/[0.14] px-2 py-px text-[10px] font-bold uppercase tracking-wider text-amber-500">
              {t('updates.leadBadge')}
            </span>
          </span>
          <span className="text-xs text-fg-tertiary">
            {t('updates.postedAgo', { ago: fmtAgo(item.createdAtMs, locale) })}
            {item.editedAtMs != null && <> {t('updates.edited')}</>}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {isPrivate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.14] px-2.5 py-1 text-[11px] font-semibold text-amber-500">
              <Lock className="size-3" />
              {t('updates.membersOnly')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-fg-tertiary">
              <Globe className="size-3" />
              {t('updates.public')}
            </span>
          )}
          {canManage && !editing && (
            <UpdateKebab
              canEdit={item.isMine}
              onEdit={() => {
                setDraft(item.body)
                setEditing(true)
              }}
              onDelete={remove}
            />
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={5000}
            rows={4}
            className="w-full rounded-lg border border-white/[0.08] bg-bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-fg-primary focus:border-amber-500/50 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!draft.trim() || isPending}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-blue-900 transition-colors hover:bg-amber-400 disabled:pointer-events-none disabled:opacity-45"
            >
              {isPending ? tCommon('state.saving') : tCommon('actions.save')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:text-fg-primary"
            >
              {tCommon('actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg-secondary">
          {item.body}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </article>
  )
}

function UpdateKebab({
  canEdit,
  onEdit,
  onDelete,
}: {
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations('project')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('updates.manageUpdate')}
        className="flex size-7 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-white/[0.08] bg-bg-surface-2 py-1 shadow-xl"
        >
          {canEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
              className="flex w-full px-3 py-2 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-3 hover:text-fg-primary"
            >
              {tCommon('actions.edit')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className="flex w-full px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-bg-surface-3"
          >
            {tCommon('actions.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Milestone row ───────────────────────────────────────────── */

function MilestoneRow({
  item,
}: {
  item: Extract<UpdatesFeedItem, { kind: 'step_completed' | 'members_joined' }>
}) {
  const t = useTranslations('project')
  const locale = useLocale()
  return (
    <div className="flex items-center gap-3 px-2 text-sm text-fg-tertiary">
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-green-500/[0.15] text-green-300">
        {item.kind === 'step_completed' ? (
          <Check className="size-3" strokeWidth={3} />
        ) : (
          <Users className="size-3" />
        )}
      </span>
      <span className="min-w-0 truncate">
        {item.kind === 'step_completed' ? (
          <>
            {t('milestones.stepCompleted')}{' '}
            <b className="font-semibold text-fg-secondary">{item.stepTitle}</b>
          </>
        ) : (
          <>
            {t('milestones.peopleJoined', { count: item.names.length })}{' '}
            <b className="font-semibold text-fg-secondary">
              {joinNames(item.names, t)}
            </b>
          </>
        )}
      </span>
      <span className="ml-auto shrink-0 text-xs">{fmtAgo(item.atMs, locale)}</span>
    </div>
  )
}
