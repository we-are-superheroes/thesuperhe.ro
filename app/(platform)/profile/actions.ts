'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { uploadImage, deleteImageByUrl } from '@/lib/storage'
import type { ServerActionResult, Proficiency } from '@/types'

export interface ProfileFormSkill {
  skillId: string
  proficiency: Proficiency
  isSeeking: boolean
}

export interface ProfileFormData {
  name: string
  bio: string
  location: string
  timezone: string
  skills: ProfileFormSkill[]
}

const VALID_PROFICIENCIES: Proficiency[] = ['beginner', 'intermediate', 'expert']

async function ensureUserExists(userId: string): Promise<ServerActionResult<void>> {
  const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (existing) return { success: true, data: undefined }

  const cu = await currentUser()
  if (!cu) return { success: false, error: 'Could not load Clerk profile' }
  const email = cu.emailAddresses?.[0]?.emailAddress
  if (!email) return { success: false, error: 'No email on profile' }
  const name =
    [cu.firstName, cu.lastName].filter(Boolean).join(' ') ||
    cu.username ||
    email.split('@')[0]

  try {
    await db.user.create({
      data: { id: userId, email, name, avatarUrl: cu.imageUrl ?? null },
    })
    return { success: true, data: undefined }
  } catch {
    const retry = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (retry) return { success: true, data: undefined }
    return { success: false, error: 'Could not create user record' }
  }
}

export async function saveProfileAction(
  data: ProfileFormData,
): Promise<ServerActionResult<{ saved: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  // Validate basic fields
  const name = data.name.trim()
  if (name.length === 0) return { success: false, error: 'Name can’t be empty.' }
  if (name.length > 200) return { success: false, error: 'Name is too long.' }

  const bio = data.bio.trim().slice(0, 400)
  const location = data.location.trim().slice(0, 200) || null
  const timezone = data.timezone.trim().slice(0, 100) || null

  // Validate skill payload — every skill row must reference a real skill id and a valid proficiency.
  const skillIds = Array.from(new Set(data.skills.map((s) => s.skillId).filter(Boolean)))
  if (skillIds.length > 0) {
    const realSkills = await db.skill.findMany({
      where: { id: { in: skillIds } },
      select: { id: true },
    })
    const realIds = new Set(realSkills.map((s) => s.id))
    for (const s of data.skills) {
      if (!realIds.has(s.skillId)) {
        return { success: false, error: 'One of the skills does not exist.' }
      }
      if (!VALID_PROFICIENCIES.includes(s.proficiency)) {
        return { success: false, error: 'Invalid proficiency level.' }
      }
    }
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { name, bio: bio || null, location, timezone },
      }),
      // Replace user's skill list. Simpler than diffing for an MVP.
      db.userSkill.deleteMany({ where: { userId } }),
      ...(data.skills.length > 0
        ? [
            db.userSkill.createMany({
              data: data.skills.map((s) => ({
                userId,
                skillId: s.skillId,
                proficiency: s.proficiency,
                isSeeking: s.isSeeking,
              })),
            }),
          ]
        : []),
    ])
  } catch {
    return { success: false, error: 'Could not save profile.' }
  }

  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { success: true, data: { saved: true } }
}

export async function clearAvatarAction(): Promise<ServerActionResult<{ cleared: true }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }
  // Read the existing URL so we can delete the underlying object too.
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })
  try {
    await db.user.update({ where: { id: userId }, data: { avatarUrl: null } })
  } catch {
    return { success: false, error: 'Could not clear avatar.' }
  }
  // Best-effort: nuke the orphaned file in storage. Non-blocking.
  if (existing?.avatarUrl) await deleteImageByUrl(existing.avatarUrl)
  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { success: true, data: { cleared: true } }
}

/**
 * Upload a new avatar from the profile page. The form sends the file as
 * FormData; we accept PNG/JPEG/WebP/GIF up to 4 MB. Replaces any prior
 * avatar both in the DB and in storage to prevent orphans.
 */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<ServerActionResult<{ url: string }>> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: 'You need to sign in first.' }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: userCheck.error }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No file provided.' }
  }

  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })

  let url: string
  try {
    const result = await uploadImage(file, 'avatar')
    url = result.url
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Could not upload image.',
    }
  }

  try {
    await db.user.update({ where: { id: userId }, data: { avatarUrl: url } })
  } catch {
    // The file made it into storage but the DB write failed. Clean up.
    await deleteImageByUrl(url)
    return { success: false, error: 'Could not save avatar.' }
  }

  // Now that the new URL is committed, prune the old object.
  if (existing?.avatarUrl && existing.avatarUrl !== url) {
    await deleteImageByUrl(existing.avatarUrl)
  }

  revalidatePath('/profile')
  revalidatePath('/dashboard')
  return { success: true, data: { url } }
}
