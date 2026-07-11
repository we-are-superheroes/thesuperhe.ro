import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { getMembership, isActiveAdmin, getOrgCsvRows } from '@/lib/orgs'

/* ================================================================
   GET /api/orgs/[slug]/export — raw CSV of all attributed
   contributions (spec F7). Admins only. Former members appear as
   "Former member" with no name; non-member volunteers on org public
   projects are not listed (they count in the aggregate stat only).
   ================================================================ */

function csvField(value: string | number | boolean): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) return new Response('Sign in required.', { status: 401 })

  const org = await db.organisation.findUnique({
    where: { slug },
    select: { id: true, name: true },
  })
  if (!org) return new Response('Not found.', { status: 404 })

  const membership = await getMembership(org.id, userId)
  if (!isActiveAdmin(membership)) {
    // Same response as a missing org — don't confirm it exists.
    return new Response('Not found.', { status: 404 })
  }

  const rows = await getOrgCsvRows(org.id)

  const header = [
    'Member',
    'Membership',
    'Project',
    'Project visibility',
    'Organisation project',
    'Step',
    'Hours',
    'Date',
  ].join(',')

  const lines = rows.map((r) =>
    [
      csvField(r.isFormer ? 'Former member' : (r.memberName ?? 'Unknown')),
      csvField(r.isFormer ? 'former' : 'current'),
      csvField(r.projectTitle),
      csvField(r.visibility === 'org_members' ? 'members only' : 'public'),
      csvField(r.orgOwned ? 'yes' : 'no'),
      csvField(r.stepTitle),
      csvField(r.hours),
      csvField(r.loggedOn.toISOString().slice(0, 10)),
    ].join(','),
  )

  const csv = [header, ...lines].join('\r\n') + '\r\n'
  const filename = `${slug}-contributions.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
