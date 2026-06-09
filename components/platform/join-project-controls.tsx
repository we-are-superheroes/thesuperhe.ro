'use client'

import { useTransition, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, Clock, LogIn, LogOut, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { joinProjectAction, leaveProjectAction } from '@/app/(platform)/projects/[id]/actions'
import { useProjectTabs } from './project-tabs'

/**
 * Top-right "Join project" button used in the project view topbar.
 * Reflects the user's current membership state; for members it becomes a
 * "✓ Joined ▾" dropdown holding the membership note, a Steps-tab shortcut,
 * and the Leave-project flow (moved here from the right-rail card).
 */
export function JoinProjectTopButton({
  projectId,
  projectTitle,
  isSignedIn,
  isMember,
  isPendingApproval = false,
  myAssignedStepCount,
}: {
  projectId: string
  projectTitle: string
  isSignedIn: boolean
  isMember: boolean
  /** A request to join exists but the lead hasn't accepted yet. */
  isPendingApproval?: boolean
  /** Steps currently assigned to the viewer — used in the leave confirm. */
  myAssignedStepCount: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [localPending, setLocalPending] = useState(isPendingApproval)

  if (!isSignedIn) {
    return (
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
      >
        <LogIn className="size-3.5" strokeWidth={2.5} />
        Sign in to join
      </Link>
    )
  }

  if (isMember) {
    return (
      <JoinedDropdown
        projectId={projectId}
        projectTitle={projectTitle}
        myAssignedStepCount={myAssignedStepCount}
      />
    )
  }

  if (localPending) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/[0.12] px-4 py-2.5 text-sm font-medium text-amber-500">
        <Clock className="size-3.5" />
        Request sent
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-red-300">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await joinProjectAction(projectId)
            if (!result.success) setError(result.error)
            else if (result.data.pending) setLocalPending(true)
          })
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending ? 'Joining…' : 'Join project'}
      </button>
    </div>
  )
}

/**
 * "✓ Joined ▾" dropdown for members. Houses the Leave-project flow so the
 * rail card can stay purely positive.
 */
function JoinedDropdown({
  projectId,
  projectTitle,
  myAssignedStepCount,
}: {
  projectId: string
  projectTitle: string
  myAssignedStepCount: number
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { setTab } = useProjectTabs()

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

  const leave = () => {
    setError(null)
    if (myAssignedStepCount > 0) {
      const ok = window.confirm(
        `You have ${myAssignedStepCount} step${myAssignedStepCount === 1 ? '' : 's'} assigned to you on this project. Leaving will hand ${myAssignedStepCount === 1 ? 'it' : 'them'} back to the team.\n\nAre you sure you want to leave?`,
      )
      if (!ok) return
    }
    setOpen(false)
    startTransition(async () => {
      const result = await leaveProjectAction(projectId)
      if (!result.success) setError(result.error)
    })
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-300">{error}</span>}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-lg border border-green-500/35 bg-green-500/[0.16] px-4 py-2.5 text-sm font-medium text-green-300 transition-colors hover:border-green-500/55"
        >
          <Check className="size-3.5" strokeWidth={2.5} />
          {pending ? 'Leaving…' : 'Joined'}
          <ChevronDown
            className={cn('size-3.5 transition-transform duration-fast', open && 'rotate-180')}
            strokeWidth={2.5}
          />
        </button>
      </div>
      {open && (
        <div
          role="menu"
          aria-label="Membership menu"
          className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-white/[0.08] bg-bg-surface shadow-xl"
        >
          <div className="border-b border-white/[0.08] px-4 py-3 text-xs leading-relaxed text-fg-tertiary">
            You’re a member. <b className="font-semibold text-fg-secondary">{projectTitle}</b>{' '}
            shows in your dashboard and you can see members-only updates.
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setTab('steps')
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg-secondary transition-colors hover:bg-bg-surface-2 hover:text-fg-primary"
          >
            <CheckSquare className="size-4 shrink-0" />
            See open steps
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={leave}
            disabled={pending}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-bg-surface-2 disabled:opacity-60"
          >
            <LogOut className="size-4 shrink-0" />
            Leave project
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Right-rail "Want in?" CTA card. Same membership logic, larger layout.
 * Leaving lives in the topbar's Joined dropdown — this card stays positive.
 */
export function JoinProjectCard({
  projectId,
  isSignedIn,
  isMember,
  isPendingApproval = false,
}: {
  projectId: string
  isSignedIn: boolean
  isMember: boolean
  isPendingApproval?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [localPending, setLocalPending] = useState(isPendingApproval)
  const { setTab } = useProjectTabs()

  return (
    <div
      id="join"
      className="rounded-2xl border border-amber-500/35 bg-bg-surface bg-[radial-gradient(ellipse_at_top_right,rgba(244,165,53,0.18),transparent_60%)] p-6"
    >
      {isMember ? (
        <>
          <h3 className="mb-2 flex items-center gap-2 font-display text-2xl leading-tight">
            <Check className="size-5 text-green-300" strokeWidth={2.5} />
            You’re in.
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-fg-secondary">
            This project is in your dashboard. Claim a step to start contributing, and keep an
            eye on the Updates tab.
          </p>
          <button
            type="button"
            onClick={() => setTab('steps')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04]"
          >
            See open steps
          </button>
        </>
      ) : localPending ? (
        <>
          <h3 className="mb-2 flex items-center gap-2 font-display text-2xl leading-tight">
            <Clock className="size-5 text-amber-500" />
            Request sent.
          </h3>
          <p className="text-sm leading-relaxed text-fg-secondary">
            The project lead will get a notification. You’ll be welcomed once they accept.
          </p>
        </>
      ) : (
        <>
          <h3 className="mb-2 font-display text-2xl leading-tight">Want in?</h3>
          <p className="mb-4 text-sm leading-relaxed text-fg-secondary">
            Join the project to claim steps, see updates in your dashboard, and chat with the team.
          </p>
          {error && <p className="mb-3 text-xs text-red-300">{error}</p>}
          {isSignedIn ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  const result = await joinProjectAction(projectId)
                  if (!result.success) setError(result.error)
                  else if (result.data.pending) setLocalPending(true)
                })
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {pending ? 'Joining…' : 'Join this project'}
              {!pending && <ArrowRight className="size-3.5" strokeWidth={2.5} />}
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
            >
              Sign in to join
              <ArrowRight className="size-3.5" strokeWidth={2.5} />
            </Link>
          )}
        </>
      )}
    </div>
  )
}
