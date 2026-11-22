'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check, ExternalLink, Loader2, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  approveProposalAction,
  rejectProposalAction,
} from '@/app/(platform)/admin/places/actions'
import { PLACE_LIMITS } from '@/lib/places-shared'

/* ================================================================
   One suggestion in the curator's review queue. The page (a server
   component) has already turned the stored payload into display rows;
   this component only shows them and runs the two decisions.
   ================================================================ */

export interface ProposalRow {
  /** Translated field name. */
  label: string
  /** Current value — absent for a new place. Lines are shown one per row. */
  now?: string[]
  suggested: string[]
}

export interface ProposalView {
  id: string
  kind: 'new' | 'edit' | 'remove'
  /** Translated heading: "New place", "Change to …", "Remove …". */
  title: string
  /** "Suggested by … on …". */
  byline: string
  note: string | null
  /** The place changed after this suggestion was made. */
  conflict: boolean
  /** The live page of the place an edit/removal is about. */
  placeHref: string | null
  rows: ProposalRow[]
}

const BTN =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-60'
const BTN_PRIMARY = 'border-brand-accent bg-brand-accent text-fg-on-accent hover:bg-brand-accent-hover'
const BTN_SECONDARY =
  'border-border-default bg-bg-surface-2 text-fg-primary hover:border-border-strong hover:bg-bg-surface-3'
const BTN_DANGER = 'border-red-500/50 bg-transparent text-red-300 hover:bg-red-500/[0.12]'

function Lines({ lines, muted }: { lines: string[]; muted?: boolean }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={index} className={cn('block whitespace-pre-line break-words', muted && 'text-fg-tertiary')}>
          {line}
        </span>
      ))}
    </>
  )
}

export function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const t = useTranslations('map')
  const router = useRouter()
  const [resolved, setResolved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const approve = () => {
    setError(null)
    startTransition(async () => {
      const result = await approveProposalAction(proposal.id)
      if (!result.success) {
        setError(result.error)
        return
      }
      setResolved(proposal.kind === 'remove' ? t('review.removed') : t('review.approved'))
      router.refresh()
    })
  }

  const reject = () => {
    setError(null)
    startTransition(async () => {
      const result = await rejectProposalAction(proposal.id, reason)
      if (!result.success) {
        setError(result.error)
        return
      }
      setResolved(t('review.rejected'))
      router.refresh()
    })
  }

  const isEdit = proposal.kind === 'edit'

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-surface p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight">{proposal.title}</h2>
          <p className="mt-1 text-xs text-fg-tertiary">{proposal.byline}</p>
        </div>
        {proposal.placeHref && (
          <Link
            href={proposal.placeHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm text-fg-secondary underline underline-offset-2 hover:text-fg-primary"
          >
            {t('review.viewPlace')}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>

      {proposal.conflict && (
        <p className="mt-4 flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2 text-sm text-fg-primary">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          {t('review.conflict')}
        </p>
      )}

      {proposal.note && (
        <div className="mt-4 rounded-lg bg-bg-surface-2 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            {t('review.noteLabel')}
          </h3>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-fg-primary">{proposal.note}</p>
        </div>
      )}

      {proposal.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
                <th scope="col" className="w-40 py-2 pr-4 font-semibold">
                  {t('review.fieldColumn')}
                </th>
                {isEdit && (
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {t('review.nowColumn')}
                  </th>
                )}
                <th scope="col" className="py-2 font-semibold">
                  {t('review.suggestedColumn')}
                </th>
              </tr>
            </thead>
            <tbody>
              {proposal.rows.map((row) => (
                <tr key={row.label} className="border-t border-border-subtle align-top">
                  <th scope="row" className="py-2.5 pr-4 text-left font-medium text-fg-secondary">
                    {row.label}
                  </th>
                  {isEdit && (
                    <td className="py-2.5 pr-4 text-fg-tertiary">
                      <Lines lines={row.now ?? []} muted />
                    </td>
                  )}
                  <td className="py-2.5 text-fg-primary">
                    <Lines lines={row.suggested} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {resolved ? (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm font-medium text-fg-primary">
          <Check className="size-4 text-green-300" aria-hidden />
          {resolved}
        </p>
      ) : rejecting ? (
        <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/[0.06] p-4">
          <h3 className="font-medium text-fg-primary">{t('review.rejectTitle')}</h3>
          <label htmlFor={`reject-${proposal.id}`} className="mt-3 block text-sm font-medium text-fg-primary">
            {t('review.rejectReasonLabel')}
          </label>
          <textarea
            id={`reject-${proposal.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={PLACE_LIMITS.proposalNote}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-sm text-fg-primary outline-none transition-all duration-fast focus:border-amber-500 focus:shadow-[0_0_0_3px_rgba(244,165,53,0.18)]"
          />
          <p className="mt-1 text-xs text-fg-tertiary">{t('review.rejectReasonHelp')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={reject} disabled={pending} className={cn(BTN, BTN_DANGER)}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('review.rejectConfirm')}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={cn(BTN, BTN_SECONDARY)}>
              {t('review.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={approve} disabled={pending} className={cn(BTN, BTN_PRIMARY)}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" strokeWidth={2.5} aria-hidden />
            )}
            {pending ? t('review.approving') : t('review.approve')}
          </button>
          {proposal.kind !== 'remove' && (
            <Link href={`/map/suggest?proposal=${proposal.id}`} className={cn(BTN, BTN_SECONDARY)}>
              <Pencil className="size-4" aria-hidden />
              {t('review.editFirst')}
            </Link>
          )}
          <button type="button" onClick={() => setRejecting(true)} disabled={pending} className={cn(BTN, BTN_DANGER)}>
            <X className="size-4" strokeWidth={2.5} aria-hidden />
            {t('review.reject')}
          </button>
        </div>
      )}
    </article>
  )
}
