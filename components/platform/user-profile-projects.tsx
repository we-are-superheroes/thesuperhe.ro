'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin, Star, Users, MessageSquare, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ProfileProject {
  id: string
  title: string
  type: string
  imgKey: string
  location: string
  role: 'lead' | 'contributor' | 'advisor' | 'observer'
  status: 'active' | 'finished'
  progress: number
  since: string
}

type Tab = 'active' | 'finished' | 'all'

const IMG_CLASS: Record<string, string> = {
  energy:
    '[background:radial-gradient(circle_at_60%_40%,#4A7FD4_0%,transparent_60%),linear-gradient(135deg,#0E1A2B,#2E5FAA)]',
  rewild:
    '[background:radial-gradient(circle_at_70%_60%,#4a8b6e_0%,transparent_60%),linear-gradient(135deg,#1a3d2c,#6b9d7e)]',
  circular:
    '[background:radial-gradient(circle_at_30%_50%,#f4a535_0%,transparent_70%),linear-gradient(160deg,#5C3600,#B86E00)]',
  policy:
    '[background:radial-gradient(circle_at_50%_30%,#B2D0F5_0%,transparent_65%),linear-gradient(160deg,#152236,#1B3A6B)]',
  food: '[background:radial-gradient(circle_at_25%_70%,#7DD3B0_0%,transparent_70%),linear-gradient(135deg,#1A5C40,#3DAF7C)]',
  mobility:
    '[background:radial-gradient(circle_at_70%_30%,#FAD08F_0%,transparent_60%),linear-gradient(160deg,#2E1A00,#8A5200)]',
  water:
    '[background:radial-gradient(circle_at_30%_50%,#7AAEE8_0%,transparent_65%),linear-gradient(135deg,#060D18,#1B3A6B)]',
  education:
    '[background:radial-gradient(circle_at_60%_50%,#F7BD64_0%,transparent_60%),linear-gradient(135deg,#2A3A52,#5A7090)]',
}

const ROLE_LABEL: Record<ProfileProject['role'], string> = {
  lead: 'Leading',
  contributor: 'Contributing',
  advisor: 'Advising',
  observer: 'Watching',
}

function RoleIcon({ role, className }: { role: ProfileProject['role']; className?: string }) {
  if (role === 'lead') return <Star className={cn('fill-current', className)} strokeWidth={0} />
  if (role === 'advisor') return <MessageSquare className={className} strokeWidth={2.5} />
  return <Users className={className} strokeWidth={2.5} />
}

export function UserProfileProjects({
  active,
  finished,
}: {
  active: ProfileProject[]
  finished: ProfileProject[]
}) {
  const [tab, setTab] = useState<Tab>(active.length > 0 ? 'active' : finished.length > 0 ? 'finished' : 'active')

  const visible = tab === 'all' ? [...active, ...finished] : tab === 'active' ? active : finished

  return (
    <>
      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-white/[0.08]">
        <TabButton active={tab === 'active'} label="Active" count={active.length} onClick={() => setTab('active')} />
        <TabButton active={tab === 'finished'} label="Finished" count={finished.length} onClick={() => setTab('finished')} />
        <TabButton
          active={tab === 'all'}
          label="All"
          count={active.length + finished.length}
          onClick={() => setTab('all')}
        />
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-700 bg-bg-surface px-6 py-8 text-center text-sm text-fg-tertiary">
          {tab === 'active' && 'Nothing active right now.'}
          {tab === 'finished' && 'Nothing finished yet.'}
          {tab === 'all' && 'No projects yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </>
  )
}

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
        '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
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

function ProjectCard({ project: p }: { project: ProfileProject }) {
  const finished = p.status === 'finished'
  const roleClass = (() => {
    if (p.role === 'lead') return 'text-amber-500 border-amber-500/40'
    if (p.role === 'advisor') return 'text-green-300 border-green-500/40'
    return 'text-blue-300 border-blue-500/40'
  })()
  return (
    <Link
      href={`/projects/${p.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-bg-surface transition-all duration-standard hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-sm',
        finished && 'opacity-85',
      )}
    >
      <div className={cn('relative aspect-[16/6]', IMG_CLASS[p.imgKey] ?? IMG_CLASS.rewild)}>
        <span className="absolute left-3 top-3 rounded-full border border-neutral-700 bg-blue-900/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-fg-primary backdrop-blur-sm">
          {p.type}
        </span>
        <span
          className={cn(
            'absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border bg-blue-900/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm',
            roleClass,
          )}
        >
          <RoleIcon role={p.role} className="size-2.5" />
          {ROLE_LABEL[p.role]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 sm:px-5">
        <h3 className="font-display text-lg leading-tight">{p.title}</h3>
        <div className="flex items-center gap-2 text-xs text-fg-tertiary">
          <MapPin className="size-3 shrink-0" />
          {p.location}
          <span className="mx-1 text-neutral-600">·</span>
          {p.since}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs text-fg-tertiary">
          {finished ? (
            <span className="inline-flex items-center gap-1.5 text-green-300">
              <Check className="size-3" strokeWidth={2.5} />
              Completed
            </span>
          ) : (
            <>
              <span>
                <strong className="font-semibold text-fg-primary">Active</strong>
              </span>
              <div className="mx-3 h-[3px] max-w-[100px] flex-1 overflow-hidden rounded-sm bg-bg-surface-2">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
              <span>
                <strong className="font-semibold text-fg-primary">{p.progress}%</strong>
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
