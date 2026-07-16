import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { isOrgAdminRole } from '@/lib/org-utils'
import { resolveLocale } from '@/lib/locale'
import { fmtMonthYear } from '@/lib/format'
import {
  OrganisationsClient,
  type OrganisationRow,
  type DirectoryRow,
} from '@/components/platform/organisations-client'

/* ================================================================
   /organisations — the organisations the signed-in user belongs to,
   plus the way in for new ones (the gated request form). Org pages
   themselves live at /orgs/[slug].
   ================================================================ */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('organisations.title') }
}

export default async function OrganisationsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const locale = await resolveLocale()
  const t = await getTranslations('orgs')

  const memberships = await db.userOrganisation.findMany({
    where: { userId, leftAt: null },
    orderBy: { joinedAt: 'asc' },
    select: {
      role: true,
      joinedAt: true,
      org: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          status: true,
          logoUrl: true,
          _count: {
            select: {
              members: { where: { leftAt: null } },
              projects: true,
            },
          },
        },
      },
    },
  })

  const orgs: OrganisationRow[] = memberships.map((m) => ({
    id: m.org.id,
    slug: m.org.slug,
    name: m.org.name,
    type: m.org.type,
    typeLabel: t(`type.${m.org.type}`),
    status: m.org.status,
    logoUrl: m.org.logoUrl,
    isAdmin: isOrgAdminRole(m.role),
    isCreator: m.role === 'owner',
    members: m.org._count.members,
    projects: m.org._count.projects,
    joinedLabel: fmtMonthYear(m.joinedAt, locale),
  }))

  // The directory: active organisations that opted in, minus the user's own
  // (they're already in the section above). Unlisted orgs never show here.
  const myOrgIds = orgs.map((o) => o.id)
  const listedOrgs = await db.organisation.findMany({
    where: {
      listed: true,
      status: 'active',
      id: { notIn: myOrgIds.length > 0 ? myOrgIds : ['__none__'] },
    },
    orderBy: { name: 'asc' },
    take: 200,
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      logoUrl: true,
      description: true,
      _count: {
        select: {
          members: { where: { leftAt: null } },
          projects: { where: { visibility: 'public' } },
        },
      },
    },
  })

  const directory: DirectoryRow[] = listedOrgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    type: o.type,
    typeLabel: t(`type.${o.type}`),
    logoUrl: o.logoUrl,
    description: o.description?.split(/\n+/)[0] ?? null,
    members: o._count.members,
    projects: o._count.projects,
  }))

  return <OrganisationsClient orgs={orgs} directory={directory} />
}
