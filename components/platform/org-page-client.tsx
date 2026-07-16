'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  Check,
  Download,
  Globe,
  Link as LinkIcon,
  Lock,
  Pencil,
  Plus,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { fmtInt } from '@/lib/format'
import { ProjectStatusBadge } from '@/components/platform/project-status-badge'
import {
  clearOrgImageAction,
  createInviteCodeAction,
  inviteByEmailAction,
  promoteMemberAction,
  redeemInviteAction,
  removeMemberAction,
  revokeInviteAction,
  updateOrgProfileAction,
  uploadOrgImageAction,
} from '@/app/(platform)/orgs/actions'

/* ================================================================
   Organisation page — client half. Receives everything pre-scoped
   by the server (visitors never receive member data), renders the
   design's sections and wires the actions: invite redemption,
   member management, invite codes, profile editing.
   ================================================================ */

export interface OrgProjectCard {
  id: string
  title: string
  description: string
  type: string
  status: string
  imgKey: string
  coverImageUrl: string | null
  membersOnly: boolean
  live: boolean
  contributors: number
  needsHelp: number
}

export interface OrgPageData {
  org: {
    id: string
    slug: string
    name: string
    typeLabel: string
    isCompany: boolean
    status: 'pending' | 'active' | 'suspended'
    listed: boolean
    description: string | null
    website: string | null
    logoUrl: string | null
    bannerUrl: string | null
    sinceLabel: string
  }
  viewer: {
    signedIn: boolean
    role: 'visitor' | 'member' | 'admin'
  }
  /** Code from an ?invite= link, pre-filled into the join box. */
  inviteCode: string | null
  /** Where "back" goes — resolved server-side from the ?from= param. */
  backLink: { href: string; label: string }
  stats: { members: number; hours: number; publicProjects: number }
  publicProjects: OrgProjectCard[]
  orgProjects: OrgProjectCard[]
  dash: {
    total: number
    orgHours: number
    sharedHours: number
    rows: Array<{ name: string; vis: string; kind: 'org' | 'pub'; hours: number }>
  }
  members: Array<{
    id: string
    name: string
    initials: string
    gradient: string
    isAdmin: boolean
    isCreator: boolean
    isYou: boolean
    meta: string
  }>
  invites: Array<{ id: string; code: string; meta: string; revoked: boolean }>
}

const BANNER_BG = {
  np: 'radial-gradient(circle at 75% 30%, rgba(61,175,124,0.55) 0%, transparent 55%), radial-gradient(circle at 20% 80%, rgba(244,165,53,0.35) 0%, transparent 50%), linear-gradient(135deg, #12281c, #1A5C40)',
  co: 'radial-gradient(circle at 70% 40%, rgba(74,127,212,0.5) 0%, transparent 55%), radial-gradient(circle at 15% 75%, rgba(61,175,124,0.3) 0%, transparent 50%), linear-gradient(135deg, #0E1A2B, #1B3A6B)',
}

const LOGO_BG = {
  np: 'linear-gradient(135deg, #1A5C40, #3DAF7C)',
  co: 'linear-gradient(135deg, #1B3A6B, #4A7FD4)',
}

const IMG_BG: Record<string, string> = {
  rewild:
    'radial-gradient(circle at 70% 60%, #4a8b6e 0%, transparent 60%), linear-gradient(135deg, #1a3d2c, #6b9d7e)',
  circular:
    'radial-gradient(circle at 30% 50%, #f4a535 0%, transparent 70%), linear-gradient(160deg, #5C3600, #B86E00)',
  energy:
    'radial-gradient(circle at 60% 40%, #4A7FD4 0%, transparent 60%), linear-gradient(135deg, #0E1A2B, #2E5FAA)',
  food: 'radial-gradient(circle at 25% 70%, #7DD3B0 0%, transparent 70%), linear-gradient(135deg, #1A5C40, #3DAF7C)',
  mobility:
    'radial-gradient(circle at 70% 30%, #FAD08F 0%, transparent 60%), linear-gradient(160deg, #2E1A00, #8A5200)',
  policy:
    'radial-gradient(circle at 60% 40%, #4A7FD4 0%, transparent 60%), linear-gradient(135deg, #0E1A2B, #2E5FAA)',
  water:
    'radial-gradient(circle at 60% 40%, #4A7FD4 0%, transparent 60%), linear-gradient(135deg, #0E1A2B, #2E5FAA)',
  education:
    'radial-gradient(circle at 30% 50%, #f4a535 0%, transparent 70%), linear-gradient(160deg, #5C3600, #B86E00)',
}

export function OrgPageClient({ data }: { data: OrgPageData }) {
  const locale = useLocale()
  const t = useTranslations('orgs')
  const { org, viewer } = data
  const cls = org.isCompany ? 'co' : 'np'
  const isMember = viewer.role !== 'visitor'
  const isAdmin = viewer.role === 'admin'

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Banner. shrink-0 matters: inside the platform shell this page is a
          flex column with a fixed-height scroll area, and without it the
          banner gets compressed, cutting off the overlapping header. */}
      <div className="relative h-[180px] shrink-0 overflow-hidden sm:h-[220px]">
        <div className="absolute inset-0" style={{ background: BANNER_BG[cls] }} />
        {org.bannerUrl && (
          <Image
            src={org.bannerUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-base to-transparent" />
        <Link
          href={data.backLink.href}
          className="absolute left-4 top-5 z-[2] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[rgba(10,16,26,0.45)] px-3.5 py-1.5 text-sm text-white/85 backdrop-blur-md transition-colors hover:text-white sm:left-10"
        >
          <ArrowLeft className="size-3.5" /> {data.backLink.label}
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pb-16 sm:px-10">
        {/* Header */}
        <header className="relative z-[3] -mt-14 flex flex-wrap items-end gap-6">
          <div
            className="flex size-[112px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-bg-base font-display text-[44px] text-white shadow-lg"
            style={{ background: LOGO_BG[cls] }}
          >
            {org.logoUrl ? (
              <Image src={org.logoUrl} alt="" width={112} height={112} className="size-full object-cover" />
            ) : (
              org.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex min-w-[260px] flex-1 flex-col gap-2 pb-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[clamp(32px,4vw,46px)] font-normal leading-[1.02] tracking-tight">
                {org.name}
              </h1>
              <span
                className={cn(
                  'whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest',
                  org.isCompany
                    ? 'border-blue-400/45 bg-blue-400/10 text-blue-300'
                    : 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {org.typeLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-fg-secondary">
              {org.website && (
                <a
                  href={`https://${org.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-amber-500"
                >
                  <Globe className="size-3.5 text-fg-tertiary" /> {org.website}
                </a>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5 text-fg-tertiary" />{' '}
                {t('header.since', { date: org.sinceLabel })}
              </span>
            </div>
          </div>
          <HeaderActions data={data} />
        </header>

        {org.status !== 'active' && <StatusNotice status={org.status} />}

        {/* Stats */}
        <section aria-label={t('stats.ariaLabel')} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            big={String(data.stats.members)}
            label={org.isCompany ? t('stats.employees') : t('stats.members')}
          />
          <Stat
            big={t('stats.hours', { hours: fmtInt(data.stats.hours, locale) })}
            accent
            label={t('stats.contributed')}
            fine={t('stats.hoursFine')}
          />
          <Stat big={String(data.stats.publicProjects)} label={t('stats.publicProjects')} />
        </section>

        {/* About */}
        {org.description && (
          <section>
            <SectionHead title={t('about.title')} />
            <p className="max-w-[720px] leading-relaxed text-fg-secondary">{org.description}</p>
          </section>
        )}

        {/* Organisation projects — public + members-only in one section.
            Visitors only ever receive public ones, so they get no filter. */}
        <OrgProjectsSection data={data} isMember={isMember} />

        {/* ── Members-only boundary ── */}
        {!isMember ? (
          <LockedTeaser data={data} />
        ) : (
          <>
            <Dashboard data={data} isAdmin={isAdmin} />
            <MembersSection data={data} isAdmin={isAdmin} />
            {isAdmin && <InvitesSection data={data} />}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Header actions ─────────────────────────────────────────── */

function HeaderActions({ data }: { data: OrgPageData }) {
  const t = useTranslations('orgs')
  const { viewer } = data
  const [editing, setEditing] = useState(false)

  if (viewer.role === 'visitor') {
    return (
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <a
          href="#join"
          className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
        >
          {t('header.haveInviteCode')}
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pb-1">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/[0.08] px-3.5 py-2 text-sm font-medium text-emerald-300">
        <Check className="size-3.5" /> {viewer.role === 'admin' ? t('role.admin') : t('role.member')}
      </span>
      {viewer.role === 'admin' && (
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
        >
          <Pencil className="size-3.5" /> {t('header.editOrganisation')}
        </button>
      )}
      {editing && <EditOrganisationPanel data={data} onDone={() => setEditing(false)} />}
    </div>
  )
}

function EditOrganisationPanel({ data, onDone }: { data: OrgPageData; onDone: () => void }) {
  const t = useTranslations('orgs')
  const tc = useTranslations('common')
  const router = useRouter()
  const [description, setDescription] = useState(data.org.description ?? '')
  const [website, setWebsite] = useState(data.org.website ?? '')
  const [listed, setListed] = useState(data.org.listed)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateOrgProfileAction(data.org.id, { description, website, listed })
      if (!result.success) setError(result.error)
      else {
        onDone()
        router.refresh()
      }
    })
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <OrgImageField
          orgId={data.org.id}
          image="logo"
          label={t('edit.logoLabel')}
          hint={t('edit.logoHint')}
          currentUrl={data.org.logoUrl}
        />
        <OrgImageField
          orgId={data.org.id}
          image="banner"
          label={t('edit.bannerLabel')}
          hint={t('edit.bannerHint')}
          currentUrl={data.org.bannerUrl}
        />
      </div>

      <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        {t('edit.aboutLabel')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-sm text-fg-primary outline-none focus:border-amber-500"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-fg-secondary">
        {t('edit.websiteLabel')}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder={t('edit.websitePlaceholder')}
          className="rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2.5 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
        />
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-3">
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
          className="mt-0.5 size-4 accent-amber-500"
        />
        <span className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium text-fg-primary">{t('edit.listedLabel')}</span>
          <span className="text-xs leading-relaxed text-fg-tertiary">{t('edit.listedHint')}</span>
        </span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="cursor-pointer rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-60"
        >
          {pending ? tc('state.saving') : tc('actions.save')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="cursor-pointer rounded-lg border border-neutral-700 px-4 py-2 text-sm text-fg-secondary hover:text-fg-primary"
        >
          {tc('actions.cancel')}
        </button>
      </div>
    </div>
  )
}

/** Upload / replace / remove one org image. Uploads apply immediately. */
function OrgImageField({
  orgId,
  image,
  label,
  hint,
  currentUrl,
}: {
  orgId: string
  image: 'logo' | 'banner'
  label: string
  hint: string
  currentUrl: string | null
}) {
  const t = useTranslations('orgs')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onFile = (file: File | null) => {
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const result = await uploadOrgImageAction(orgId, image, fd)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  const remove = () => {
    setError(null)
    startTransition(async () => {
      const result = await clearOrgImageAction(orgId, image)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm text-fg-secondary">
      {label}
      <div className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-3">
        {currentUrl ? (
          <Image
            src={currentUrl}
            alt=""
            width={image === 'logo' ? 40 : 72}
            height={40}
            className={cn(
              'shrink-0 object-cover',
              image === 'logo' ? 'size-10 rounded-lg' : 'h-10 w-[72px] rounded-md',
            )}
          />
        ) : (
          <span className="flex h-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-700 px-3 text-xs text-fg-tertiary">
            {t('edit.image.noneYet')}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-full border border-neutral-700 px-3 py-1 text-xs text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary disabled:opacity-60"
          >
            {pending
              ? t('edit.image.uploading')
              : currentUrl
                ? t('edit.image.replace')
                : t('edit.image.upload')}
          </button>
          {currentUrl && (
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="cursor-pointer rounded-full border border-neutral-700 px-3 py-1 text-xs text-fg-tertiary transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-60"
            >
              {t('edit.image.remove')}
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <span className="text-xs text-fg-tertiary">{hint}</span>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

function StatusNotice({ status }: { status: 'pending' | 'suspended' }) {
  const t = useTranslations('orgs')
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.08] px-5 py-4 text-sm leading-relaxed text-fg-secondary">
      {t.rich(`status.${status}`, {
        strong: (chunks) => <strong className="text-fg-primary">{chunks}</strong>,
      })}
    </div>
  )
}

/* ── Shared bits ────────────────────────────────────────────── */

function SectionHead({
  title,
  sub,
  subNode,
  lock,
}: {
  title: string
  sub?: string
  subNode?: React.ReactNode
  lock?: string
}) {
  return (
    <div className="mb-4 flex items-baseline gap-4">
      <h2 className="flex items-center gap-3 font-display text-2xl font-normal tracking-tight">
        {title}
        {lock && (
          <span className="inline-flex -translate-y-0.5 items-center gap-1.5 rounded-full border border-neutral-700 bg-bg-surface-2 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
            <Lock className="size-2.5" /> {lock}
          </span>
        )}
      </h2>
      <span className="h-px flex-1 self-center bg-white/[0.08]" />
      {subNode ?? (sub && <span className="whitespace-nowrap text-sm text-fg-tertiary">{sub}</span>)}
    </div>
  )
}

function Stat({
  big,
  label,
  fine,
  accent,
}: {
  big: string
  label: string
  fine?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/[0.08] bg-bg-surface px-6 py-5">
      <b className={cn('font-display text-4xl font-normal leading-tight', accent && 'text-amber-500')}>
        {big}
      </b>
      <span className="text-sm text-fg-secondary">{label}</span>
      {fine && <span className="mt-1 text-xs text-fg-tertiary">{fine}</span>}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-10 text-center text-sm text-fg-tertiary">
      {text}
    </div>
  )
}

function ProjectCard({ p }: { p: OrgProjectCard }) {
  const t = useTranslations('orgs')
  return (
    <Link
      href={`/projects/${p.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-surface transition-all duration-fast hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-md"
    >
      <div className="relative h-[110px]" style={{ background: IMG_BG[p.imgKey] ?? IMG_BG.rewild }}>
        {p.coverImageUrl && (
          <Image src={p.coverImageUrl} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 500px" />
        )}
        <span className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/15 bg-[rgba(14,26,43,0.85)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-md">
            {p.type}
          </span>
          <ProjectStatusBadge status={p.status} className="bg-[rgba(14,26,43,0.85)] backdrop-blur-md" />
        </span>
        {p.membersOnly && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-[rgba(14,26,43,0.85)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300 backdrop-blur-md">
            <Lock className="size-2.5" /> {t('projects.membersOnly')}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-4">
        <h3 className="font-display text-lg leading-tight">{p.title}</h3>
        <p className="line-clamp-2 text-sm leading-normal text-fg-secondary">{p.description}</p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-fg-tertiary">
          <span>
            {t.rich('projects.contributors', {
              count: p.contributors,
              strong: (chunks) => (
                <strong className="font-semibold text-fg-primary">{chunks}</strong>
              ),
            })}
          </span>
          <span className="flex-1" />
          {p.needsHelp > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-500">
              <span className="size-[5px] rounded-full bg-amber-500 shadow-[0_0_5px_var(--color-amber-500,#F4A535)]" />
              {t('projects.needsHelp', { count: p.needsHelp })}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

/* ── Organisation projects (public + members-only, filterable) ── */

type ProjectFilter = 'all' | 'public' | 'members'

function OrgProjectsSection({
  data,
  isMember,
}: {
  data: OrgPageData
  isMember: boolean
}) {
  const t = useTranslations('orgs')
  const [filter, setFilter] = useState<ProjectFilter>('all')

  const all = [...data.publicProjects, ...data.orgProjects]
  const visible =
    filter === 'public'
      ? all.filter((p) => !p.membersOnly)
      : filter === 'members'
        ? all.filter((p) => p.membersOnly)
        : all

  const counts = {
    all: all.length,
    public: data.publicProjects.length,
    members: data.orgProjects.length,
  }

  const emptyText =
    filter === 'members'
      ? t('projects.empty.membersFilter')
      : filter === 'public'
        ? t('projects.empty.publicFilter')
        : isMember
          ? t('projects.empty.member')
          : t('projects.empty.publicFilter')

  return (
    <section>
      <SectionHead
        title={t('projects.title')}
        sub={
          !isMember
            ? t('projects.liveCount', { count: all.filter((p) => p.live).length })
            : undefined
        }
        subNode={
          isMember ? (
            <Link
              href={`/projects/new?org=${data.org.slug}`}
              className="text-sm text-amber-500 hover:underline"
            >
              {t('projects.newProject')}
            </Link>
          ) : undefined
        }
      />

      {/* Visibility filter — members only: visitors never receive
          members-only projects, so the pills would mislead them. */}
      {isMember && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              { key: 'all', label: t('projects.filter.all'), count: counts.all },
              { key: 'public', label: t('projects.filter.public'), count: counts.public },
              { key: 'members', label: t('projects.filter.members'), count: counts.members },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors duration-fast',
                filter === f.key
                  ? 'border-amber-500/40 bg-amber-500/[0.12] text-amber-500'
                  : 'border-neutral-700 bg-bg-surface text-fg-secondary hover:border-neutral-600 hover:text-fg-primary',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'rounded-full px-[7px] py-px text-[10px] font-semibold',
                  filter === f.key ? 'bg-amber-500/20' : 'bg-bg-surface-2',
                )}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyRow text={emptyText} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visible.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ── Visitor teaser ─────────────────────────────────────────── */

function LockedTeaser({ data }: { data: OrgPageData }) {
  const t = useTranslations('orgs')
  const router = useRouter()
  const [code, setCode] = useState(data.inviteCode ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Arriving via an invite link while signed out: sign in, then come
  // straight back here with the code still in the URL.
  const returnTo = `/orgs/${data.org.slug}${data.inviteCode ? `?invite=${data.inviteCode}` : ''}`

  const join = () => {
    setError(null)
    startTransition(async () => {
      const result = await redeemInviteAction(code)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <section id="join">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-10 text-center">
        <div className="mb-2 flex size-[52px] items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-fg-tertiary">
          <Lock className="size-[22px]" />
        </div>
        <h3 className="font-display text-xl font-normal">{t('teaser.title')}</h3>
        <p className="max-w-[440px] text-sm leading-relaxed text-fg-secondary">
          {t('teaser.body', { org: data.org.name })}
        </p>
        {data.viewer.signedIn ? (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('teaser.invitePlaceholder')}
              aria-label={t('teaser.invitePlaceholder')}
              className="w-[220px] rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 font-mono text-sm text-fg-primary outline-none placeholder:font-sans placeholder:text-fg-tertiary focus:border-amber-500"
            />
            <button
              type="button"
              onClick={join}
              disabled={pending || !code.trim()}
              className="cursor-pointer rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-60"
            >
              {pending ? t('teaser.joining') : t('teaser.join')}
            </button>
          </div>
        ) : (
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`}
            className="mt-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-amber-950"
          >
            {data.inviteCode ? t('teaser.signInAccept') : t('teaser.signInUse')}
          </Link>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </section>
  )
}

/* ── Contribution dashboard ─────────────────────────────────── */

function Dashboard({ data, isAdmin }: { data: OrgPageData; isAdmin: boolean }) {
  const locale = useLocale()
  const t = useTranslations('orgs')
  const d = data.dash
  const orgPct = d.total > 0 ? Math.round((d.orgHours / d.total) * 100) : 0
  const maxRow = Math.max(1, ...d.rows.map((r) => r.hours))

  return (
    <section>
      <SectionHead title={t('dash.title')} lock={t('dash.lock')} sub={t('dash.allTime')} />
      <div className="flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
        {d.total === 0 ? (
          <p className="text-sm text-fg-tertiary">{t('dash.empty')}</p>
        ) : (
          <div className="flex flex-wrap items-start gap-8">
            <div className="flex min-w-[160px] flex-col gap-0.5">
              <b className="font-display text-[52px] font-normal leading-none text-amber-500">
                {fmtInt(d.total, locale)}
              </b>
              <span className="text-sm text-fg-secondary">{t('dash.attributedHours')}</span>
              <span className="mt-1 max-w-[220px] text-xs leading-relaxed text-fg-tertiary">
                {t('dash.method')}
              </span>
            </div>
            <div className="flex min-w-[300px] flex-1 flex-col gap-3">
              <div className="flex h-3.5 overflow-hidden rounded-full bg-bg-surface-3">
                <span
                  className="bg-gradient-to-r from-amber-500 to-amber-400"
                  style={{ width: `${orgPct}%` }}
                />
                <span className="bg-blue-400" style={{ width: `${100 - orgPct}%` }} />
              </div>
              <div className="flex flex-wrap gap-6 text-xs text-fg-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-[9px] rounded-[3px] bg-amber-400" />{' '}
                  {t.rich('dash.orgLegend', {
                    hours: fmtInt(d.orgHours, locale),
                    b: (chunks) => <b className="text-fg-primary">{chunks}</b>,
                  })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-[9px] rounded-[3px] bg-blue-400" />{' '}
                  {t.rich('dash.sharedLegend', {
                    hours: fmtInt(d.sharedHours, locale),
                    b: (chunks) => <b className="text-fg-primary">{chunks}</b>,
                  })}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {d.rows.map((r) => (
                  <div
                    key={r.name}
                    className="grid grid-cols-[1fr_60px] items-center gap-2 text-sm sm:grid-cols-[1fr_90px_3fr_60px] sm:gap-4"
                  >
                    <span className="truncate text-fg-primary">{r.name}</span>
                    <span className="hidden text-xs text-fg-tertiary sm:block">{r.vis}</span>
                    <span className="hidden h-2 overflow-hidden rounded-full bg-bg-surface-3 sm:block">
                      <i
                        className={cn(
                          'block h-full rounded-full',
                          r.kind === 'org'
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-blue-400',
                        )}
                        style={{ width: `${Math.round((r.hours / maxRow) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-fg-secondary">{r.hours}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.08] pt-4">
          <p className="min-w-[260px] flex-1 text-xs leading-relaxed text-fg-tertiary">
            {t.rich('dash.footnote', {
              link: (chunks) => (
                <Link href="/profile" className="text-amber-500 hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          {isAdmin && (
            <a
              href={`/api/orgs/${data.org.slug}/export`}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary"
            >
              <Download className="size-3.5" /> {t('dash.downloadCsv')}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── Members ────────────────────────────────────────────────── */

function MembersSection({ data, isAdmin }: { data: OrgPageData; isAdmin: boolean }) {
  const t = useTranslations('orgs')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const promote = (userId: string) => {
    setError(null)
    startTransition(async () => {
      const result = await promoteMemberAction(data.org.id, userId)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  const remove = (userId: string, name: string) => {
    if (!window.confirm(t('members.removeConfirm', { name, org: data.org.name }))) return
    setError(null)
    startTransition(async () => {
      const result = await removeMemberAction(data.org.id, userId)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <section>
      <SectionHead
        title={t('members.title')}
        lock={t('members.lock')}
        sub={t('members.activeCount', { count: data.members.length })}
      />
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-bg-surface px-4 py-3"
          >
            <Link
              href={`/users/${m.id}`}
              className="flex size-[34px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-[#0E1A2B]"
              style={{ background: m.gradient }}
            >
              {m.initials}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col leading-snug">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Link href={`/users/${m.id}`} className="truncate hover:underline">
                  {m.name}
                </Link>
                {m.isYou && <span className="font-normal text-fg-tertiary">{t('members.you')}</span>}
                {m.isAdmin && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-1.5 py-px text-[9px] font-semibold uppercase tracking-widest text-amber-500">
                    {t('role.admin')}
                  </span>
                )}
              </span>
              <span className="text-xs text-fg-tertiary">{m.meta}</span>
            </div>
            {isAdmin && !m.isYou && !m.isCreator && (
              <div className="flex gap-1">
                {!m.isAdmin && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => promote(m.id)}
                    className="cursor-pointer rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-fg-tertiary transition-colors hover:border-neutral-600 hover:text-fg-primary disabled:opacity-60"
                  >
                    {t('members.makeAdmin')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(m.id, m.name)}
                  className="cursor-pointer rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-fg-tertiary transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-60"
                >
                  {t('members.remove')}
                </button>
              </div>
            )}
            {isAdmin && m.isCreator && (
              <span className="text-[10px] text-fg-tertiary">{t('role.creator')}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Invites (admin) ────────────────────────────────────────── */

function InvitesSection({ data }: { data: OrgPageData }) {
  const t = useTranslations('orgs')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const copyLink = async (inviteId: string, code: string) => {
    const url = `${window.location.origin}/orgs/${data.org.slug}?invite=${code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(inviteId)
      setTimeout(() => setCopiedId((prev) => (prev === inviteId ? null : prev)), 2000)
    } catch {
      setError(t('invites.copyFailed'))
    }
  }

  const run = (fn: () => Promise<{ success: boolean } & Record<string, unknown>>) => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = (await fn()) as
        | { success: true; data: Record<string, unknown> }
        | { success: false; error: string }
      if (!result.success) setError(result.error)
      else router.refresh()
      return
    })
  }

  const generate = () =>
    run(() => createInviteCodeAction(data.org.id, { maxUses: null, expiresInDays: 90 }))

  const revoke = (inviteId: string) => run(() => revokeInviteAction(inviteId))

  const sendEmailInvite = () => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await inviteByEmailAction(data.org.id, email)
      if (!result.success) setError(result.error)
      else {
        setEmail('')
        setNotice(
          result.data.delivered
            ? t('invites.sent')
            : t('invites.shareCode', { code: result.data.code }),
        )
        router.refresh()
      }
    })
  }

  return (
    <section>
      <SectionHead title={t('invites.title')} lock={t('invites.lock')} />
      <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-bg-surface p-6">
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            {t('invites.codesHeading')}
          </div>
          {data.invites.length === 0 ? (
            <p className="text-sm text-fg-tertiary">{t('invites.none')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.invites.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.08] bg-bg-surface-2 px-4 py-3 text-sm"
                >
                  <code
                    className={cn(
                      'rounded-md border border-neutral-700 bg-bg-base px-2.5 py-1 font-mono text-xs tracking-wider',
                      i.revoked ? 'text-fg-tertiary line-through' : 'text-amber-500',
                    )}
                  >
                    {i.code}
                  </code>
                  <span className={cn('flex-1 text-xs text-fg-tertiary', i.revoked && 'italic')}>
                    {i.meta}
                  </span>
                  {!i.revoked && (
                    <>
                      <button
                        type="button"
                        onClick={() => copyLink(i.id, i.code)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-fg-secondary transition-colors hover:border-amber-500/50 hover:text-amber-400"
                      >
                        {copiedId === i.id ? (
                          <>
                            <Check className="size-3" /> {t('invites.copied')}
                          </>
                        ) : (
                          <>
                            <LinkIcon className="size-3" /> {t('invites.copyLink')}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => revoke(i.id)}
                        className="cursor-pointer rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-fg-tertiary transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-60"
                      >
                        {t('invites.cancelCode')}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={generate}
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-lg border border-neutral-700 px-4 py-2 text-sm text-fg-secondary transition-colors hover:border-neutral-600 hover:text-fg-primary disabled:opacity-60"
        >
          <Plus className="size-3.5" /> {t('invites.generate')}
        </button>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            {t('invites.emailHeading')}
          </div>
          <p className="mb-3 max-w-[640px] text-sm leading-relaxed text-fg-secondary">
            {t('invites.emailBody')}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('invites.emailPlaceholder')}
              aria-label={t('invites.emailAria')}
              className="min-w-[220px] flex-1 rounded-lg border border-neutral-700 bg-bg-surface-2 px-3.5 py-2 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary focus:border-amber-500"
            />
            <button
              type="button"
              disabled={pending || !email.trim()}
              onClick={sendEmailInvite}
              className="cursor-pointer rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-60"
            >
              {t('invites.send')}
            </button>
          </div>
          {notice && <p className="mt-2 text-sm text-emerald-300">{notice}</p>}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </section>
  )
}
