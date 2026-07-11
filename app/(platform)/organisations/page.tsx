import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { ORG_TYPE_LABEL, isOrgAdminRole } from '@/lib/org-utils'
import {
  OrganisationsClient,
  type OrganisationRow,
} from '@/components/platform/organisations-client'

/* ================================================================
   /organisations — the organisations the signed-in user belongs to,
   plus the way in for new ones (the gated request form). Org pages
   themselves live at /orgs/[slug].
   ================================================================ */

export const metadata = {
  title: 'Organisations — The Superhero',
}

export default async function OrganisationsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

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
    typeLabel: ORG_TYPE_LABEL[m.org.type],
    status: m.org.status,
    isAdmin: isOrgAdminRole(m.role),
    isCreator: m.role === 'owner',
    members: m.org._count.members,
    projects: m.org._count.projects,
    joinedLabel: m.joinedAt.toLocaleString('en-GB', { month: 'short', year: 'numeric' }),
  }))

  return <OrganisationsClient orgs={orgs} />
}
