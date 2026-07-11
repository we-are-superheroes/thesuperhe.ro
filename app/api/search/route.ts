import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { visibleProjectsWhere } from '@/lib/orgs'

/* ================================================================
   GET /api/search?q= — powers the dashboard search box. Returns a
   small grouped result set: projects, steps and people whose names
   match. Members-only projects only appear for their org's members
   (visibleProjectsWhere).
   ================================================================ */

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ projects: [], steps: [], people: [] })
  }

  const visible = visibleProjectsWhere(userId)

  const [projects, steps, people] = await Promise.all([
    db.project.findMany({
      where: {
        title: { contains: q, mode: 'insensitive' },
        AND: [visible],
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        location: true,
        status: true,
        projectType: { select: { name: true } },
      },
    }),
    db.projectStep.findMany({
      where: {
        title: { contains: q, mode: 'insensitive' },
        project: { AND: [visible] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        helpWanted: true,
        project: { select: { id: true, title: true } },
      },
    }),
    db.user.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      orderBy: { lastSeenAt: { sort: 'desc', nulls: 'last' } },
      take: 5,
      select: { id: true, name: true, location: true },
    }),
  ])

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      meta: [p.projectType?.name, p.location].filter(Boolean).join(' · ') || null,
    })),
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      projectId: s.project.id,
      meta: s.project.title,
      done: s.status === 'completed',
      helpWanted: s.helpWanted && s.status !== 'completed',
    })),
    people: people.map((u) => ({
      id: u.id,
      name: u.name,
      meta: u.location,
    })),
  })
}
