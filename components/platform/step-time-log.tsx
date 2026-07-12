'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Clock, Plus, Minus, ArrowRight, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { fmtAgo } from '@/lib/format'
import {
  logTimeAction,
  deleteTimeLogAction,
} from '@/app/(platform)/my-steps/actions'

/* ================================================================
   StepTimeLog — shared time-logging UI used by both the project
   view step cards and the /my-steps page. The shape matches the
   design in api.anthropic.com/v1/design/h/yoy0HEtiKjirNfrRXn8how:
   a compact summary row with a "Log time" toggle, which expands
   into a panel showing recent entries + a form (hours, date,
   optional note, submit) plus quick-add chips.
   ================================================================ */

export interface StepTimeLogEntry {
  id: string
  hours: number
  note: string | null
  loggedOnMs: number
  user: {
    id: string
    name: string
    initials: string
    isMe: boolean
  } | null
}

export interface StepTimeLogContributor {
  id: string
  name: string
  initials: string
}

export interface StepTimeLogData {
  stepId: string
  totalHours: number
  totalEntryCount: number
  contributors: StepTimeLogContributor[]
  recentLogs: StepTimeLogEntry[]
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#B86E00,#F4A535 55%,#FAD08F)',
  'linear-gradient(135deg,#1A5C40,#3DAF7C 60%,#7DD3B0)',
  'linear-gradient(135deg,#2E5FAA,#4A7FD4 60%,#B2D0F5)',
  'linear-gradient(135deg,#5C3600,#B86E00 60%,#F7BD64)',
  'linear-gradient(135deg,#1B3A6B,#2E5FAA 60%,#7AAEE8)',
  'linear-gradient(135deg,#7A1A1A,#E05252 60%,#F09898)',
]
function gradientFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length]
}

type StepsTranslator = ReturnType<typeof useTranslations<'steps'>>

function fmtHours(h: number, t: StepsTranslator): string {
  if (h <= 0) return t('timeLog.hoursOnly', { hours: 0 })
  if (h >= 1) {
    const whole = Math.floor(h)
    const min = Math.round((h - whole) * 60)
    return min
      ? t('timeLog.hoursMinutes', { hours: whole, minutes: min })
      : t('timeLog.hoursOnly', { hours: whole })
  }
  return t('timeLog.minutesOnly', { minutes: Math.round(h * 60) })
}

const QUICK_HOURS = [0.5, 1, 2, 4] as const

export function StepTimeLog({
  data,
  canLog,
  onLogged,
  onDeleted,
  /** Auto-show entries inline beneath the summary even when collapsed.
   *  Useful for /my-steps where we want the user to land on a list view.
   */
  expandedByDefault = false,
}: {
  data: StepTimeLogData
  canLog: boolean
  onLogged?: (entry: StepTimeLogEntry, newTotal: number) => void
  onDeleted?: (entryId: string, newTotal: number) => void
  expandedByDefault?: boolean
}) {
  const t = useTranslations('steps')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(expandedByDefault)
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [loggedOn, setLoggedOn] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const hoursRef = useRef<HTMLInputElement>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(Date.now()))
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (open && hoursRef.current) hoursRef.current.focus()
  }, [open])

  const parsedHours = Number(hours)
  const canSubmit =
    canLog && Number.isFinite(parsedHours) && parsedHours > 0 && parsedHours <= 24

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await logTimeAction(
        data.stepId,
        parsedHours,
        note,
        loggedOn,
      )
      if (!result.success) {
        setError(result.error)
        return
      }
      onLogged?.(
        {
          id: result.data.logId,
          hours: Math.round(parsedHours * 4) / 4,
          note: note.trim() || null,
          loggedOnMs: new Date(loggedOn).getTime(),
          user: null, // server will round-trip on next render; row already added optimistically
        },
        result.data.newTotal,
      )
      setHours('')
      setNote('')
    })
  }

  const bumpQuick = (q: number) => {
    const cur = Number(hours)
    const base = Number.isFinite(cur) && cur > 0 ? cur : 0
    const next = Math.min(24, Math.round((base + q) * 4) / 4)
    setHours(String(next))
  }

  const remove = (logId: string) => {
    startTransition(async () => {
      const result = await deleteTimeLogAction(logId)
      if (result.success) onDeleted?.(logId, result.data.newTotal)
    })
  }

  const summaryEmpty = data.totalEntryCount === 0
  const visibleLogs = data.recentLogs.slice(0, 4)
  const hiddenLogCount = Math.max(0, data.totalEntryCount - visibleLogs.length)
  const contributorBlurb =
    data.contributors.length === 1
      ? t('timeLog.byName', { name: firstName(data.contributors[0].name) })
      : t('timeLog.contributorCount', { count: data.contributors.length })

  return (
    <div className="flex flex-col gap-2">
      {/* Summary row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-xs text-fg-tertiary">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Clock className="size-[13px] shrink-0 text-fg-secondary" />
          {summaryEmpty ? (
            <span>{t('timeLog.noTimeYet')}</span>
          ) : (
            <>
              {t.rich('timeLog.totalLogged', {
                hours: fmtHours(data.totalHours, t),
                strong: (chunks) => (
                  <strong className="font-semibold text-fg-primary">
                    {chunks}
                  </strong>
                ),
              })}
              {data.contributors.length > 0 && (
                <>
                  <ContributorStack contributors={data.contributors} />
                  <span className="text-[var(--border-strong)] opacity-50">·</span>
                  <span>{contributorBlurb}</span>
                </>
              )}
            </>
          )}
        </div>
        {canLog && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-all',
              open
                ? 'border-neutral-600 bg-bg-surface-2 text-fg-primary'
                : 'border-neutral-700 text-fg-secondary hover:border-neutral-600 hover:bg-white/[0.04] hover:text-fg-primary',
            )}
          >
            {open ? (
              <Minus className="size-3" strokeWidth={2.5} />
            ) : (
              <Plus className="size-3" strokeWidth={2.5} />
            )}
            {t('timeLog.logTime')}
          </button>
        )}
      </div>

      {/* Detail panel */}
      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-700 bg-bg-base p-4">
          <div className="flex flex-col gap-2">
            {visibleLogs.length === 0 ? (
              <div className="py-1 text-xs italic text-fg-tertiary">
                {canLog ? t('timeLog.beFirst') : t('timeLog.nothingLogged')}
              </div>
            ) : (
              visibleLogs.map((entry) => (
                <TimeEntry
                  key={entry.id}
                  entry={entry}
                  now={now}
                  onDelete={
                    entry.user?.isMe ? () => remove(entry.id) : undefined
                  }
                  pending={pending}
                />
              ))
            )}
            {hiddenLogCount > 0 && (
              <div className="text-xs italic text-fg-tertiary">
                {t('timeLog.earlierEntries', { count: hiddenLogCount })}
              </div>
            )}
          </div>

          {canLog && (
            <form
              onSubmit={submit}
              className="grid grid-cols-[100px_140px_1fr_auto] gap-2 border-t border-white/[0.06] pt-3 max-md:grid-cols-[1fr_1fr_auto]"
            >
              <div className="relative col-span-1 max-md:col-span-1">
                <input
                  ref={hoursRef}
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder={t('timeLog.hoursPlaceholder')}
                  required
                  className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2 pl-3 pr-6 text-sm tabular-nums text-fg-primary outline-none transition-colors placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(244,165,53,0.15)]"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-tertiary">
                  {t('timeLog.hourSymbol')}
                </span>
              </div>
              <input
                type="date"
                value={loggedOn}
                onChange={(e) => setLoggedOn(e.target.value)}
                title={t('timeLog.dateTitle')}
                className="rounded-lg border border-neutral-700 bg-bg-surface px-3 py-2 text-sm text-fg-primary outline-none transition-colors focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(244,165,53,0.15)] max-md:col-span-1"
              />
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('timeLog.notePlaceholder')}
                maxLength={120}
                className="rounded-lg border border-neutral-700 bg-bg-surface px-3 py-2 text-sm text-fg-primary outline-none transition-colors placeholder:text-fg-tertiary focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(244,165,53,0.15)] max-md:col-span-2"
              />
              <button
                type="submit"
                disabled={!canSubmit || pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-amber-900 transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-bg-surface-3 disabled:text-fg-tertiary max-md:col-span-1"
              >
                {pending ? tCommon('state.saving') : t('timeLog.log')}
                {!pending && <ArrowRight className="size-3" strokeWidth={2.5} />}
              </button>
              <div className="col-span-full -mt-0.5 flex flex-wrap gap-1.5">
                {QUICK_HOURS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => bumpQuick(q)}
                    className="inline-flex items-center rounded-full border border-dashed border-neutral-700 px-2.5 py-[3px] text-[11px] text-fg-tertiary transition-all hover:border-amber-500 hover:border-solid hover:text-amber-500"
                  >
                    {q === 0.5
                      ? t('timeLog.quickAddMinutes', { minutes: 30 })
                      : t('timeLog.quickAddHours', { hours: q })}
                  </button>
                ))}
              </div>
              {error && (
                <div className="col-span-full text-xs text-red-300">{error}</div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Subcomponents ──────────────────────────────────────────── */

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name
}

function ContributorStack({
  contributors,
}: {
  contributors: StepTimeLogContributor[]
}) {
  const visible = contributors.slice(0, 4)
  return (
    <span className="inline-flex items-center">
      {visible.map((c, i) => (
        <span
          key={c.id}
          title={c.name}
          className={cn(
            'inline-flex size-[18px] items-center justify-center rounded-full text-[9px] font-semibold text-blue-900 ring-[1.5px] ring-bg-surface',
            i > 0 && '-ml-1.5',
          )}
          style={{ background: gradientFor(c.id) }}
        >
          {c.initials}
        </span>
      ))}
    </span>
  )
}

function TimeEntry({
  entry,
  now,
  pending,
  onDelete,
}: {
  entry: StepTimeLogEntry
  now: number
  pending: boolean
  onDelete?: () => void
}) {
  const t = useTranslations('steps')
  const locale = useLocale()
  const name = entry.user?.name ?? t('timeLog.someone')
  const initials = entry.user?.initials ?? '?'
  const id = entry.user?.id ?? entry.id
  return (
    <div className="flex items-start gap-3 py-0.5">
      <div
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-blue-900"
        style={{ background: gradientFor(id) }}
        title={name}
      >
        {initials}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-xs text-fg-tertiary">
          <strong className="font-semibold text-fg-primary">
            {firstName(name)}
          </strong>{' '}
          · <span className="font-semibold tabular-nums text-amber-500">{fmtHours(entry.hours, t)}</span>{' '}
          · {now > 0 ? fmtAgo(entry.loggedOnMs, locale, now) : ''}
        </div>
        {entry.note && (
          <div className="text-sm leading-snug text-fg-secondary">
            {entry.note}
          </div>
        )}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          title={t('timeLog.deleteEntry')}
          className="shrink-0 text-fg-tertiary transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
