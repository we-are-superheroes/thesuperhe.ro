'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { tError } from '@/lib/errors'
import { db } from '@/lib/db'
import { ensureUserExists } from '@/lib/users'
import { canViewProject } from '@/lib/orgs'
import { notify, getProjectLeadIds } from '@/lib/notifications'
import { rateLimit, rateLimitError } from '@/lib/rate-limit'
import type { ServerActionResult } from '@/types'


export async function joinProjectAction(
  projectId: string,
): Promise<ServerActionResult<{ joined: true; pending: boolean }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  // Join/leave loops spam the leads with notifications — throttle.
  const rl = rateLimit(`${userId}:join-project`, 5, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, joinPolicy: true, visibility: true, orgId: true },
  })
  if (!project) return { success: false, error: t('projectJoin.projectNotFound') }
  // Members-only projects can only be joined from inside the owning org.
  // Same response as a missing project — don't confirm it exists.
  if (!(await canViewProject(project, userId))) {
    return { success: false, error: t('projectJoin.projectNotFound') }
  }
  const approvalRequired = project.joinPolicy === 'approval_required'

  // Project-level uniqueness must be checked manually because Postgres treats
  // NULL != NULL in unique indexes (CLAUDE.md). Reactivate any prior withdrawal.
  const existing = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId: null },
    select: { id: true, status: true },
  })
  if (existing && (existing.status === 'active' || existing.status === 'pending')) {
    return { success: false, error: t('projectJoin.alreadyMember') }
  }

  // Look up the actor's name for the notification copy.
  const actor = await db.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })
  const actorName = actor?.name ?? 'A new contributor'

  // If approval is required, contribution starts pending and the lead has to
  // accept. Otherwise it goes straight to active (today's default behaviour).
  const targetStatus = approvalRequired ? 'pending' : 'active'

  let contributionId: string
  try {
    await db.$transaction(async (tx) => {
      if (existing) {
        await tx.contribution.update({
          where: { id: existing.id },
          data: { status: targetStatus },
        })
        contributionId = existing.id
      } else {
        const created = await tx.contribution.create({
          data: {
            userId,
            projectId,
            projectStepId: null,
            role: 'contributor',
            status: targetStatus,
          },
          select: { id: true },
        })
        contributionId = created.id
      }

      const leadIds = await getProjectLeadIds(tx, projectId)
      if (approvalRequired) {
        await notify(tx, {
          type: 'project_join_request',
          recipients: leadIds,
          actorId: userId,
          projectId,
          message: {
            key: 'projectJoinRequest',
            params: { actorName, projectTitle: project.title },
          },
          data: { contributionId },
        })
      } else {
        await notify(tx, {
          type: 'project_join',
          recipients: leadIds,
          actorId: userId,
          projectId,
          message: { key: 'projectJoin', params: { actorName, projectTitle: project.title } },
        })
      }
    })
  } catch {
    return { success: false, error: t('projectJoin.joinFailed') }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  revalidatePath('/notifications')
  return { success: true, data: { joined: true, pending: approvalRequired } }
}

export async function joinStepAction(
  projectId: string,
  projectStepId: string,
): Promise<ServerActionResult<{ joined: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:step-membership`, 10, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const userCheck = await ensureUserExists(userId)
  if (!userCheck.success) return { success: false, error: t('common.profileSyncFailed') }

  // Must be an active project-level member to claim steps. A pending join
  // request doesn't grant claim rights yet.
  const membership = await db.contribution.findFirst({
    where: {
      userId,
      projectId,
      projectStepId: null,
      status: 'active',
    },
    select: { id: true },
  })
  if (!membership) {
    return { success: false, error: t('projectJoin.joinBeforeClaimingStep') }
  }

  const step = await db.projectStep.findUnique({
    where: { id: projectStepId },
    select: {
      id: true,
      projectId: true,
      coordinatorId: true,
      status: true,
      title: true,
      project: { select: { title: true } },
    },
  })
  if (!step || step.projectId !== projectId) {
    return { success: false, error: t('projectJoin.stepNotFound') }
  }

  // Already an active joiner? No-op — joining is idempotent.
  const existingStepContribution = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId, status: 'active' },
    select: { id: true },
  })
  if (existingStepContribution) {
    return { success: true, data: { joined: true } }
  }

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'A contributor'

  try {
    await db.$transaction(async (tx) => {
      await tx.contribution.upsert({
        where: {
          userId_projectId_projectStepId: { userId, projectId, projectStepId },
        },
        update: { status: 'active', role: 'contributor' },
        create: {
          userId,
          projectId,
          projectStepId,
          role: 'contributor',
          status: 'active',
        },
      })

      // First joiner becomes the coordinator + flips an idle step into motion.
      const stepUpdate: { coordinatorId?: string; status?: typeof step.status } = {}
      if (!step.coordinatorId) stepUpdate.coordinatorId = userId
      if (step.status === 'open') {
        stepUpdate.status = 'in_progress'
      }
      if (Object.keys(stepUpdate).length > 0) {
        await tx.projectStep.update({
          where: { id: projectStepId },
          data: stepUpdate,
        })
      }

      const leadIds = await getProjectLeadIds(tx, projectId)
      await notify(tx, {
        type: 'step_claimed',
        recipients: leadIds,
        actorId: userId,
        projectId,
        stepId: projectStepId,
        message: {
          key: 'stepClaimed',
          params: { actorName, stepTitle: step.title, projectTitle: step.project.title },
        },
      })
    })
  } catch {
    return { success: false, error: t('projectJoin.joinStepFailed') }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/my-steps')
  revalidatePath('/notifications')
  return { success: true, data: { joined: true } }
}

export async function leaveStepAction(
  projectId: string,
  projectStepId: string,
): Promise<ServerActionResult<{ left: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:step-membership`, 10, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const step = await db.projectStep.findUnique({
    where: { id: projectStepId },
    select: {
      id: true,
      projectId: true,
      coordinatorId: true,
      status: true,
      title: true,
      project: { select: { title: true } },
    },
  })
  if (!step || step.projectId !== projectId) {
    return { success: false, error: t('projectJoin.stepNotFound') }
  }

  const mine = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId, status: 'active' },
    select: { id: true },
  })
  if (!mine) {
    return { success: false, error: t('projectJoin.notOnStep') }
  }

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'A contributor'

  try {
    await db.$transaction(async (tx) => {
      await tx.contribution.update({
        where: { id: mine.id },
        data: { status: 'withdrawn' },
      })

      // Decide whether to transfer the coordinator + whether the step should
      // fall back to "needs help" because the team thinned out.
      const remainingJoiners = await tx.contribution.findMany({
        where: { projectId, projectStepId, status: 'active' },
        orderBy: { joinedAt: 'asc' },
        select: { userId: true },
      })

      const stepUpdate: {
        coordinatorId?: string | null
        status?: typeof step.status
        helpWanted?: boolean
      } = {}
      if (step.coordinatorId === userId) {
        stepUpdate.coordinatorId = remainingJoiners[0]?.userId ?? null
      }
      // Abandoned mid-work: back to open, waving for help. step_unclaimed
      // below already tells the leads, so no separate needs-help ping.
      if (remainingJoiners.length === 0 && step.status === 'in_progress') {
        stepUpdate.status = 'open'
        stepUpdate.helpWanted = true
      }
      if (Object.keys(stepUpdate).length > 0) {
        await tx.projectStep.update({
          where: { id: projectStepId },
          data: stepUpdate,
        })
      }

      const leadIds = await getProjectLeadIds(tx, projectId)
      await notify(tx, {
        type: 'step_unclaimed',
        recipients: leadIds,
        actorId: userId,
        projectId,
        stepId: projectStepId,
        message: {
          key: 'stepUnclaimed',
          params: { actorName, stepTitle: step.title, projectTitle: step.project.title },
        },
      })
    })
  } catch {
    return { success: false, error: t('projectJoin.leaveStepFailed') }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/my-steps')
  revalidatePath('/notifications')
  return { success: true, data: { left: true } }
}


export async function leaveProjectAction(
  projectId: string,
): Promise<ServerActionResult<{ left: true }>> {
  const t = await getTranslations('errors')
  const { userId } = await auth()
  if (!userId) return { success: false, error: t('common.notSignedIn') }

  const rl = rateLimit(`${userId}:join-project`, 5, 60_000)
  if (!rl.ok) return { success: false, error: await tError(rateLimitError(rl)) }

  const existing = await db.contribution.findFirst({
    where: { userId, projectId, projectStepId: null },
    select: { id: true, status: true },
  })
  if (!existing || (existing.status !== 'active' && existing.status !== 'pending')) {
    return { success: false, error: t('projectJoin.notInProject') }
  }

  // Find any steps this user joined or coordinates so we can release them
  // as part of leaving the project — leaving with steps still on your name
  // would strand the work.
  const joinedSteps = await db.projectStep.findMany({
    where: {
      projectId,
      contributions: { some: { userId, status: 'active' } },
    },
    select: { id: true, status: true, coordinatorId: true },
  })

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  })
  const projectTitle = project?.title ?? 'a project'

  const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  const actorName = actor?.name ?? 'A contributor'

  try {
    await db.$transaction(async (tx) => {
      // Withdraw the project-level contribution.
      await tx.contribution.update({
        where: { id: existing.id },
        data: { status: 'withdrawn' },
      })
      // Withdraw step-level contributions first so the remaining-joiners
      // counts below are accurate.
      await tx.contribution.updateMany({
        where: {
          userId,
          projectId,
          projectStepId: { not: null },
          status: { in: ['active', 'pending'] },
        },
        data: { status: 'withdrawn' },
      })

      // For each step the user was on: if they were coordinator, hand the
      // baton to the next remaining joiner (or null). If they were the last
      // joiner on an in-progress step, fall it back to needs_help.
      for (const s of joinedSteps) {
        const remaining = await tx.contribution.findMany({
          where: {
            projectId,
            projectStepId: s.id,
            status: 'active',
          },
          orderBy: { joinedAt: 'asc' },
          select: { userId: true },
        })
        const update: {
          coordinatorId?: string | null
          status?: typeof s.status
          helpWanted?: boolean
        } = {}
        if (s.coordinatorId === userId) {
          update.coordinatorId = remaining[0]?.userId ?? null
        }
        if (remaining.length === 0 && s.status === 'in_progress') {
          update.status = 'open'
          update.helpWanted = true
        }
        if (Object.keys(update).length > 0) {
          await tx.projectStep.update({ where: { id: s.id }, data: update })
        }
      }

      const leadIds = await getProjectLeadIds(tx, projectId)
      await notify(tx, {
        type: 'project_leave',
        recipients: leadIds,
        actorId: userId,
        projectId,
        message: { key: 'projectLeave', params: { actorName, projectTitle } },
      })
    })
  } catch {
    return { success: false, error: t('projectJoin.leaveProjectFailed') }
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  revalidatePath('/notifications')
  return { success: true, data: { left: true } }
}
