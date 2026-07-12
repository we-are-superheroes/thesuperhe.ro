import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import {
  getMembership,
  isActiveMember,
  isActiveAdmin,
  getOrgAttribution,
  getMemberHours,
} from '@/lib/orgs'
import { getTranslations } from 'next-intl/server'
import { isOrgAdminRole } from '@/lib/org-utils'
import { resolveLocale } from '@/lib/locale'
import { fmtMonthYear, fmtShortDate } from '@/lib/format'
import { stepNeedsHelp } from '@/lib/step-status'
import { gradientFor, initialsOf } from '@/lib/avatar'
import {
  OrgPageClient,
  type OrgPageData,
  type OrgProjectCard,
} from '@/components/platform/org-page-client'

/* ================================================================
   /orgs/[slug] — one page, visibility-scoped sections (spec D2):
   public profile for everyone; member list, org-only projects and
   the contribution dashboard for active members; invites for
   admins. Pending/suspended orgs 404 for non-members.
   ================================================================ */

interface Params {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ invite?: string; from?: string }>
}

const TYPE_IMG_KEY: Record<string, string> = {
  'Community Energy': 'energy',
  'Urban Rewilding': 'rewild',
  'Repair & Reuse': 'circular',
  'Policy Advocacy': 'policy',
  'Food & Agriculture': 'food',
  'Transport & Mobility': 'mobility',
  'Water & Conservation': 'water',
  'Education & Awareness': 'education',
  Biodiversity: 'rewild',
  'Waste Reduction': 'circular',
  'Climate Finance': 'energy',
  'Research & Data': 'policy',
  'Built Environment': 'mobility',
  'Ocean & Marine': 'water',
}


const projectCardSelect = {
  id: true,
  title: true,
  description: true,
  visibility: true,
  coverImageUrl: true,
  status: true,
  projectType: { select: { name: true } },
  steps: { select: { status: true, helpWanted: true } },
  contributions: {
    where: { status: 'active' },
    select: { userId: true },
  },
} as const

function toCard(
  p: {
    id: string
    title: string
    description: string
    visibility: string
    coverImageUrl: string | null
    status: string
    projectType: { name: string } | null
    steps: Array<{ status: string; helpWanted: boolean }>
    contributions: Array<{ userId: string }>
  },
  typeFallback: string,
): OrgProjectCard {
  return {
    id: p.id,
    title: p.title,
    description: p.description.split(/\n+/)[0],
    type: p.projectType?.name ?? typeFallback,
    status: p.status,
    imgKey: (p.projectType?.name && TYPE_IMG_KEY[p.projectType.name]) || 'rewild',
    coverImageUrl: p.coverImageUrl,
    membersOnly: p.visibility === 'org_members',
    live: p.status !== 'completed',
    contributors: new Set(p.contributions.map((c) => c.userId)).size,
    needsHelp: p.steps.filter(stepNeedsHelp).length,
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const org = await db.organisation.findUnique({
    where: { slug },
    select: { name: true, description: true, status: true },
  })
  if (!org || org.status !== 'active') return { title: 'Organisation — The Superhero' }
  return {
    title: `${org.name} — The Superhero`,
    description: org.description?.slice(0, 160) ?? undefined,
  }
}

export default async function OrgPage({ params, searchParams }: Params) {
  const { slug } = await params
  // Invite links (/orgs/<slug>?invite=CODE) pre-fill the join box so a
  // shared URL is all a new member needs. Redemption still validates
  // server-side.
  const sp = await searchParams
  const rawInvite = sp?.invite
  const inviteCode =
    typeof rawInvite === 'string' && /^[A-Z0-9-]{4,40}$/i.test(rawInvite.trim())
      ? rawInvite.trim().toUpperCase()
      : null
  // ?from= carries the internal page the visitor arrived from (set by the
  // org badge on project pages) — client-side navigation never updates
  // document.referrer, so the origin must travel in the URL.
  const rawFrom = sp?.from
  const from =
    typeof rawFrom === 'string' && /^\/projects(\/[A-Za-z0-9-]+)?$/.test(rawFrom)
      ? rawFrom
      : null
  const { userId } = await auth()
  const locale = await resolveLocale()
  const t = await getTranslations('orgs')

  const org = await db.organisation.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      status: true,
      listed: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
      website: true,
      createdAt: true,
    },
  })
  if (!org) notFound()

  const membership = await getMembership(org.id, userId)
  const member = isActiveMember(membership)
  const admin = isActiveAdmin(membership)

  // Not yet approved / kill-switched: invisible to everyone but members.
  if (org.status !== 'active' && !member) notFound()

  const [publicProjects, attribution, activeMemberCount] = await Promise.all([
    db.project.findMany({
      where: { orgId: org.id, visibility: 'public' },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: projectCardSelect,
    }),
    getOrgAttribution(org.id),
    db.userOrganisation.count({ where: { orgId: org.id, leftAt: null } }),
  ])

  // Members-only data — only fetched for active members.
  let orgProjects: OrgProjectCard[] = []
  let members: OrgPageData['members'] = []
  let invites: OrgPageData['invites'] = []
  if (member) {
    const [privRows, memberRows, memberHours] = await Promise.all([
      db.project.findMany({
        where: { orgId: org.id, visibility: 'org_members' },
        orderBy: { createdAt: 'desc' },
        take: 24,
        select: projectCardSelect,
      }),
      db.userOrganisation.findMany({
        where: { orgId: org.id, leftAt: null },
        orderBy: { joinedAt: 'asc' },
        take: 200,
        select: {
          role: true,
          joinedAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      getMemberHours(org.id),
    ])
    orgProjects = privRows.map((p) => toCard(p, t('projects.typeFallback')))
    members = memberRows.map((m) => {
      const hours = memberHours.get(m.user.id) ?? 0
      return {
        id: m.user.id,
        name: m.user.name,
        initials: initialsOf(m.user.name),
        gradient: gradientFor(m.user.id),
        isAdmin: isOrgAdminRole(m.role),
        isCreator: m.role === 'owner',
        isYou: m.user.id === userId,
        meta:
          hours > 0
            ? t('members.metaJoinedHours', {
                date: fmtMonthYear(m.joinedAt, locale),
                hours: Math.round(hours),
              })
            : t('members.metaJoined', { date: fmtMonthYear(m.joinedAt, locale) }),
      }
    })

    if (admin) {
      const inviteRows = await db.organisationInvite.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          code: true,
          email: true,
          maxUses: true,
          useCount: true,
          expiresAt: true,
          revokedAt: true,
        },
      })
      invites = inviteRows.map((i) => {
        const bits: string[] = []
        if (i.revokedAt) {
          bits.push(t('invites.meta.cancelled', { date: fmtShortDate(i.revokedAt, locale) }))
        } else {
          bits.push(
            i.email ? t('invites.meta.forEmail', { email: i.email }) : t('invites.meta.openCode'),
          )
          bits.push(
            i.maxUses !== null
              ? t('invites.meta.usesOfMax', { used: i.useCount, max: i.maxUses })
              : t('invites.meta.uses', { count: i.useCount }),
          )
          if (i.expiresAt) {
            bits.push(t('invites.meta.validUntil', { date: fmtShortDate(i.expiresAt, locale) }))
          }
        }
        return { id: i.id, code: i.code, meta: bits.join(' · '), revoked: !!i.revokedAt }
      })
    }
  }

  const dashRows: OrgPageData['dash']['rows'] = attribution.byProject.map((p) => ({
    name: p.title,
    vis: p.visibility === 'org_members' ? t('dash.visMembersOnly') : t('dash.visOrgPublic'),
    kind: 'org' as const,
    hours: Math.round(p.hours),
  }))
  if (attribution.sharedHours > 0) {
    dashRows.push({
      name: t('dash.sharedRowName'),
      vis: t('dash.sharedRowVis'),
      kind: 'pub' as const,
      hours: Math.round(attribution.sharedHours),
    })
  }

  const data: OrgPageData = {
    org: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      typeLabel: t(`type.${org.type}`),
      isCompany: org.type === 'company',
      status: org.status,
      listed: org.listed,
      description: org.description,
      website: org.website,
      logoUrl: org.logoUrl,
      bannerUrl: org.bannerUrl,
      sinceLabel: fmtMonthYear(org.createdAt, locale),
    },
    viewer: {
      signedIn: !!userId,
      role: admin ? 'admin' : member ? 'member' : 'visitor',
    },
    inviteCode,
    backLink: from
      ? {
          href: from,
          label: from === '/projects' ? t('back.toProjects') : t('back.toProject'),
        }
      : userId
        ? { href: '/organisations', label: t('back.toOrganisations') }
        : { href: '/projects', label: t('back.toProjects') },
    stats: {
      members: activeMemberCount,
      hours: Math.round(attribution.orgHours + attribution.sharedHours),
      publicProjects: publicProjects.filter((p) => p.status !== 'completed').length,
    },
    publicProjects: publicProjects.map((p) => toCard(p, t('projects.typeFallback'))),
    orgProjects,
    dash: {
      total: Math.round(attribution.orgHours + attribution.sharedHours),
      orgHours: Math.round(attribution.orgHours),
      sharedHours: Math.round(attribution.sharedHours),
      rows: dashRows,
    },
    members,
    invites,
  }

  return <OrgPageClient data={data} />
}
