'use client'

import { useTransition, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, LogIn } from 'lucide-react'
import { joinProjectAction, leaveProjectAction } from '@/app/(platform)/projects/[id]/actions'

/**
 * Top-right "Join project" button used in the project view topbar.
 * Reflects the user's current membership state and pivots to "✓ Joined"
 * when the user is already a member.
 */
export function JoinProjectTopButton({
  projectId,
  isSignedIn,
  isMember,
}: {
  projectId: string
  isSignedIn: boolean
  isMember: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
      <span className="inline-flex items-center gap-2 rounded-lg border border-green-500/35 bg-green-500/[0.16] px-4 py-2.5 text-sm font-medium text-green-300">
        <Check className="size-3.5" strokeWidth={2.5} />
        Joined
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
 * Right-rail "Want in?" CTA card. Same membership logic, larger layout.
 */
export function JoinProjectCard({
  projectId,
  isSignedIn,
  isMember,
  myAssignedStepCount,
}: {
  projectId: string
  isSignedIn: boolean
  isMember: boolean
  myAssignedStepCount: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
            This project is now in your dashboard. Claim a step below to start contributing.
          </p>
          {error && <p className="mb-3 text-xs text-red-300">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null)
              if (myAssignedStepCount > 0) {
                const ok = window.confirm(
                  `You have ${myAssignedStepCount} step${myAssignedStepCount === 1 ? '' : 's'} assigned to you on this project. Leaving will hand ${myAssignedStepCount === 1 ? 'it' : 'them'} back to the team.\n\nAre you sure you want to leave?`,
                )
                if (!ok) return
              }
              startTransition(async () => {
                const result = await leaveProjectAction(projectId)
                if (!result.success) setError(result.error)
              })
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-primary transition-all duration-standard hover:border-neutral-600 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Leaving…' : 'Leave project'}
          </button>
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
