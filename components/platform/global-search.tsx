'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, FolderOpen, CheckSquare, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ================================================================
   Dashboard search — queries /api/search (projects, steps, people)
   as you type and shows a grouped dropdown. Picking a result
   navigates; Escape or clicking elsewhere closes it.
   ================================================================ */

interface SearchResults {
  projects: Array<{ id: string; title: string; meta: string | null }>
  steps: Array<{
    id: string
    title: string
    projectId: string
    meta: string
    done: boolean
    helpWanted: boolean
  }>
  people: Array<{ id: string; name: string; meta: string | null }>
}

const EMPTY: SearchResults = { projects: [], steps: [], people: [] }

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY)
  // The query the current `results` belong to — "searching" is derived by
  // comparing it to the live query (no setState inside the effect body).
  const [fetchedFor, setFetchedFor] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const q = query.trim()
  const hasQuery = q.length >= 2
  const searching = hasQuery && fetchedFor !== q

  // Debounced fetch, cancelled when the query moves on. Previous results
  // stay on screen while the next ones load.
  useEffect(() => {
    if (q.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as SearchResults
        setResults(data)
        setFetchedFor(q)
      } catch {
        // Aborted or offline — keep whatever is shown.
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [q])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const total = results.projects.length + results.steps.length + results.people.length

  return (
    <div
      ref={wrapRef}
      className="relative order-2 w-full min-w-0 max-w-[480px] flex-1 sm:order-1 sm:w-auto"
    >
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search projects, steps, or people..."
        aria-label="Search projects, steps, or people"
        className="w-full rounded-lg border border-neutral-700 bg-bg-surface py-2.5 pl-10 pr-3.5 font-sans text-sm text-fg-primary outline-none transition-colors duration-fast placeholder:text-fg-tertiary focus:border-amber-500"
      />

      {open && hasQuery && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-neutral-700 bg-bg-surface-2 p-1.5 shadow-xl">
          {total === 0 ? (
            <div className="px-3 py-4 text-sm text-fg-tertiary">
              {searching ? 'Searching…' : `Nothing matches “${q}”.`}
            </div>
          ) : (
            <>
              <ResultGroup label="Projects">
                {results.projects.map((p) => (
                  <ResultRow
                    key={p.id}
                    href={`/projects/${p.id}`}
                    icon={<FolderOpen className="size-4" />}
                    title={p.title}
                    meta={p.meta}
                    onPick={() => setOpen(false)}
                  />
                ))}
              </ResultGroup>
              <ResultGroup label="Steps">
                {results.steps.map((s) => (
                  <ResultRow
                    key={s.id}
                    href={`/projects/${s.projectId}`}
                    icon={<CheckSquare className="size-4" />}
                    title={s.title}
                    meta={`in ${s.meta}`}
                    tag={s.done ? 'Completed' : s.helpWanted ? 'Needs help' : null}
                    tagTone={s.done ? 'green' : 'amber'}
                    onPick={() => setOpen(false)}
                  />
                ))}
              </ResultGroup>
              <ResultGroup label="People">
                {results.people.map((u) => (
                  <ResultRow
                    key={u.id}
                    href={`/users/${u.id}`}
                    icon={<UserIcon className="size-4" />}
                    title={u.name}
                    meta={u.meta}
                    onPick={() => setOpen(false)}
                  />
                ))}
              </ResultGroup>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ResultGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode[]
}) {
  if (children.length === 0) return null
  return (
    <div className="py-1 first:pt-0.5 last:pb-0.5">
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
        {label}
      </div>
      {children}
    </div>
  )
}

function ResultRow({
  href,
  icon,
  title,
  meta,
  tag,
  tagTone,
  onPick,
}: {
  href: string
  icon: React.ReactNode
  title: string
  meta: string | null
  tag?: string | null
  tagTone?: 'amber' | 'green'
  onPick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onPick}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-bg-surface-3"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-bg-surface text-fg-tertiary">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate text-sm text-fg-primary">{title}</span>
        {meta && <span className="truncate text-xs text-fg-tertiary">{meta}</span>}
      </span>
      {tag && (
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            tagTone === 'green'
              ? 'border-green-500/40 bg-green-500/[0.12] text-green-300'
              : 'border-amber-500/50 bg-amber-500/[0.14] text-amber-400',
          )}
        >
          {tag}
        </span>
      )}
    </Link>
  )
}
