import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { ProfileEditForm, type ProfileFormInitial, type SkillOption } from '@/components/platform/profile-edit-form'

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
    />
  )
}
