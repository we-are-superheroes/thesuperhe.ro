import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { isOrgAdminRole } from '@/lib/org-utils'
import { ProfileEditForm, type ProfileFormInitial, type SkillOption } from '@/components/platform/profile-edit-form'
import { ProfileOrgsSection, type ProfileOrgRow } from '@/components/platform/profile-orgs-section'

const TIMEZONE_OPTIONS = [
  '(GMT−08:00) Pacific — Los Angeles',
  '(GMT−05:00) Eastern — New York',
  '(GMT+00:00) Western European — Lisbon',
  '(GMT+01:00) Central European — Berlin / Lausanne',
  '(GMT+02:00) Eastern European — Athens',
  '(GMT+05:30) India — Mumbai',
  '(GMT+09:00) Japan — Tokyo',
  '(GMT+10:00) AEST — Sydney',
]

export default async function ProfilePage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [user, allSkills] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        bio: true,
        location: true,
        timezone: true,
        avatarUrl: true,
        skills: {
          select: {
            proficiency: true,
            isSeeking: true,
            skill: { select: { id: true, name: true, category: true } },
          },
        },
      },
    }),
    db.skill.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true },
    }),
  ])

  const memberships = await db.userOrganisation.findMany({
    where: { userId, leftAt: null },
    orderBy: { joinedAt: 'asc' },
    select: {
      role: true,
      shareContributions: true,
      org: { select: { id: true, slug: true, name: true, type: true, status: true } },
    },
  })

  const tOrgs = await getTranslations('orgs')
  const orgRows: ProfileOrgRow[] = memberships.map((m) => ({
    orgId: m.org.id,
    slug: m.org.slug,
    name: m.org.name,
    typeLabel: tOrgs(`type.${m.org.type}`),
    status: m.org.status,
    roleLabel:
      m.role === 'owner'
        ? tOrgs('role.creator')
        : m.role === 'admin'
          ? tOrgs('role.admin')
          : tOrgs('role.member'),
    isAdmin: isOrgAdminRole(m.role),
    shareContributions: m.shareContributions,
  }))

  const skillOptions: SkillOption[] = allSkills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  }))

  const initial: ProfileFormInitial = {
    name: user?.name ?? '',
    email: user?.email ?? '',
    bio: user?.bio ?? '',
    location: user?.location ?? '',
    timezone: user?.timezone ?? '',
    avatarUrl: user?.avatarUrl ?? null,
    skills:
      user?.skills.map((us) => ({
        skillId: us.skill.id,
        name: us.skill.name,
        category: us.skill.category,
        proficiency: us.proficiency,
        isSeeking: us.isSeeking,
      })) ?? [],
  }

  return (
    <ProfileEditForm
      initial={initial}
      skillOptions={skillOptions}
      timezones={TIMEZONE_OPTIONS}
      orgsSlot={<ProfileOrgsSection orgs={orgRows} />}
    />
  )
}
