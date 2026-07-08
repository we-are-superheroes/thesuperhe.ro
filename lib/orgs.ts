import 'server-only'
import { Prisma } from '@prisma/client'
import type { OrgRole, ProjectVisibility } from '@prisma/client'
import { db } from '@/lib/db'
import { isOrgAdminRole } from '@/lib/org-utils'

/* ================================================================
   Organisations — server-side queries. Membership checks, the
   browse-visibility fragment, and the attribution queries behind
   the contribution dashboard and CSV export.

   Attribution contract (spec §5): hours flow from time_logs
   (per step) up to the owning project.
     - Hours on an org's OWN projects always count, whoever logged
       them (the public stat includes non-member volunteers; the
       member CSV does not).
     - Hours on other PUBLIC projects count only while the logger
       was a member of the org, and only if that membership has
       shareContributions on. Computed at query time — toggling
       takes effect immediately.
   ================================================================ */

export interface ViewerMembership {
  role: OrgRole
  shareContributions: boolean
  joinedAt: Date
  leftAt: Date | null
}

/** The viewer's membership row for an org — active or left (null = none). */
export async function getMembership(
  orgId: string,
  userId: string | null,
): Promise<ViewerMembership | null> {
  if (!userId) return null
  return db.userOrganisation.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, shareContributions: true, joinedAt: true, leftAt: true },
  })
}

export function isActiveMember(m: ViewerMembership | null): boolean {
  return !!m && m.leftAt === null
}

export function isActiveAdmin(m: ViewerMembership | null): boolean {
  return isActiveMember(m) && isOrgAdminRole(m!.role)
}

/** Active orgs the user belongs to (for pickers, filters, profile). */
export async function getUserActiveOrgs(userId: string) {
  const rows = await db.userOrganisation.findMany({
    where: { userId, leftAt: null, org: { status: { not: 'suspended' } } },
    orderBy: { joinedAt: 'asc' },
    select: {
      role: true,
      shareContributions: true,
      org: {
        select: { id: true, slug: true, name: true, type: true, status: true, logoUrl: true },
      },
    },
  })
  return rows
}

/**
 * Where-fragment every project *browse* query must include: public projects
 * for everyone, plus org-members projects of orgs the viewer is active in.
 */
export function visibleProjectsWhere(
  userId: string | null,
): Prisma.ProjectWhereInput {
  if (!userId) return { visibility: 'public' }
  return {
    OR: [
      { visibility: 'public' },
      {
        visibility: 'org_members',
        organisation: { members: { some: { userId, leftAt: null } } },
      },
    ],
  }
}

/** Can the viewer open this specific project? (detail pages, actions) */
export async function canViewProject(
  project: { visibility: ProjectVisibility; orgId: string | null },
  userId: string | null,
): Promise<boolean> {
  if (project.visibility === 'public') return true
  if (!userId || !project.orgId) return false
  const m = await getMembership(project.orgId, userId)
  return isActiveMember(m)
}

/**
 * Can this user manage (edit/delete) the project as an org admin? True only
 * for active admins of the owning org. Project leads are checked separately
 * by the callers — this is the org-admin extension (spec D4).
 */
export async function isOrgAdminOfProject(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { orgId: true },
  })
  if (!project?.orgId) return false
  const m = await getMembership(project.orgId, userId)
  return isActiveAdmin(m)
}

/* ── Attribution ────────────────────────────────────────────── */

export interface OrgAttribution {
  /** Hours on the org's own projects (all contributors). */
  orgHours: number
  /** Members' opted-in hours on other public projects. */
  sharedHours: number
  /** Per-project split of orgHours, largest first. */
  byProject: Array<{
    id: string
    title: string
    visibility: ProjectVisibility
    hours: number
  }>
}

export async function getOrgAttribution(orgId: string): Promise<OrgAttribution> {
  const [byProject, shared] = await Promise.all([
    db.$queryRaw<
      Array<{ id: string; title: string; visibility: ProjectVisibility; hours: number }>
    >(Prisma.sql`
      SELECT p."id", p."title", p."visibility", COALESCE(SUM(t."hours"), 0)::float8 AS hours
      FROM "time_logs" t
      JOIN "project_steps" s ON s."id" = t."project_step_id"
      JOIN "projects" p ON p."id" = s."project_id"
      WHERE p."organisation_id" = ${orgId}
      GROUP BY p."id", p."title", p."visibility"
      ORDER BY hours DESC
    `),
    db.$queryRaw<Array<{ hours: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(t."hours"), 0)::float8 AS hours
      FROM "time_logs" t
      JOIN "project_steps" s ON s."id" = t."project_step_id"
      JOIN "projects" p ON p."id" = s."project_id"
      JOIN "user_organisations" m
        ON m."user_id" = t."user_id" AND m."org_id" = ${orgId}
      WHERE p."organisation_id" IS DISTINCT FROM ${orgId}
        AND p."visibility" = 'public'
        AND m."share_contributions" = true
        AND t."logged_on" >= m."joined_at"
        AND (m."left_at" IS NULL OR t."logged_on" <= m."left_at")
    `),
  ])

  const orgHours = byProject.reduce((n, r) => n + r.hours, 0)
  return { orgHours, sharedHours: shared[0]?.hours ?? 0, byProject }
}

/**
 * Attributed hours per member (same contract as the CSV), for the member
 * grid. Returns userId → hours; members with no logged hours are absent.
 */
export async function getMemberHours(orgId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<Array<{ userId: string; hours: number }>>(Prisma.sql`
    SELECT t."user_id" AS "userId", COALESCE(SUM(t."hours"), 0)::float8 AS hours
    FROM "time_logs" t
    JOIN "project_steps" s ON s."id" = t."project_step_id"
    JOIN "projects" p ON p."id" = s."project_id"
    JOIN "user_organisations" m
      ON m."user_id" = t."user_id" AND m."org_id" = ${orgId}
    WHERE
      p."organisation_id" = ${orgId}
      OR (
        p."organisation_id" IS DISTINCT FROM ${orgId}
        AND p."visibility" = 'public'
        AND m."share_contributions" = true
        AND t."logged_on" >= m."joined_at"
        AND (m."left_at" IS NULL OR t."logged_on" <= m."left_at")
      )
    GROUP BY t."user_id"
  `)
  return new Map(rows.map((r) => [r.userId, r.hours]))
}

export interface OrgCsvRow {
  memberName: string | null // null = former member (anonymised by the caller)
  isFormer: boolean
  projectTitle: string
  visibility: ProjectVisibility
  orgOwned: boolean
  stepTitle: string
  hours: number
  loggedOn: Date
}

/**
 * Raw rows for the CSV export. Members only (current and former) — hours by
 * non-member volunteers on org public projects count in the aggregate stat
 * but are not listed member-by-member (spec Q3).
 */
export async function getOrgCsvRows(orgId: string): Promise<OrgCsvRow[]> {
  return db.$queryRaw<OrgCsvRow[]>(Prisma.sql`
    SELECT
      u."name"                                   AS "memberName",
      (m."left_at" IS NOT NULL)                  AS "isFormer",
      p."title"                                  AS "projectTitle",
      p."visibility"                             AS "visibility",
      (p."organisation_id" = ${orgId})           AS "orgOwned",
      s."title"                                  AS "stepTitle",
      t."hours"::float8                          AS "hours",
      t."logged_on"                              AS "loggedOn"
    FROM "time_logs" t
    JOIN "project_steps" s ON s."id" = t."project_step_id"
    JOIN "projects" p ON p."id" = s."project_id"
    JOIN "user_organisations" m
      ON m."user_id" = t."user_id" AND m."org_id" = ${orgId}
    JOIN "users" u ON u."id" = t."user_id"
    WHERE
      p."organisation_id" = ${orgId}
      OR (
        p."organisation_id" IS DISTINCT FROM ${orgId}
        AND p."visibility" = 'public'
        AND m."share_contributions" = true
        AND t."logged_on" >= m."joined_at"
        AND (m."left_at" IS NULL OR t."logged_on" <= m."left_at")
      )
    ORDER BY t."logged_on" DESC
  `)
}
