import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { ArrowRight, Building2, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { ORG_TYPE_LABEL, isOrgAdminRole } from '@/lib/org-utils'
import { cn } from '@/lib/utils'

/* ================================================================
   /organisations — a lightweight home for the organisations the
   signed-in user belongs to, plus the way in for new ones (the
   gated request form). Org pages themselves live at /orgs/[slug].
   ================================================================ */

export const metadata = {
  title: 'Organisations — The Superhero',
}

const LOGO_BG = {
  nonprofit: 'linear-gradient(135deg, #1A5C40, #3DAF7C)',
  company: 'linear-gradient(135deg, #1B3A6B, #4A7FD4)',
} as const

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
          description: true,
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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-3 font-display text-[clamp(32px,4vw,48px)] font-normal leading-none tracking-tight">
              Your <em className="italic text-amber-500">organisations</em>.
            </h1>
            <p className="max-w-[540px] text-lg leading-relaxed text-fg-secondary">
              The groups you belong to on The Superhero — each with its own page, members-only
              projects and contribution totals.
            </p>
          </div>
          <Link
            href="/orgs/request"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-950 transition-transform hover:-translate-y-px"
          >
            <Plus className="size-3.5" strokeWidth={2.5} />
            Request an organisation
          </Link>
        </header>

        {memberships.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-bg-surface px-8 py-12 text-center">
            <div className="mb-2 flex size-14 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-fg-tertiary">
              <Building2 className="size-6" />
            </div>
            <h2 className="font-display text-2xl font-normal">No organisations yet.</h2>
            <p className="max-w-[460px] text-sm leading-relaxed text-fg-secondary">
              Join one with an invite link from its admins — or bring your own group onto the
              platform with the request button above. We approve each organisation by hand.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {memberships.map((m) => (
              <Link
                key={m.org.id}
                href={`/orgs/${m.org.slug}`}
                className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-bg-surface px-4 py-4 transition-all duration-fast hover:-translate-y-px hover:border-neutral-600 hover:shadow-md sm:px-5"
              >
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl font-display text-xl text-white"
                  style={{ background: LOGO_BG[m.org.type] }}
                >
                  {m.org.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-lg leading-tight">
                      {m.org.name}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
                        m.org.type === 'company'
                          ? 'border-blue-400/45 bg-blue-400/10 text-blue-300'
                          : 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300',
                      )}
                    >
                      {ORG_TYPE_LABEL[m.org.type]}
                    </span>
                    {isOrgAdminRole(m.role) && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                        {m.role === 'owner' ? 'Creator' : 'Admin'}
                      </span>
                    )}
                    {m.org.status === 'pending' && (
                      <span className="rounded-full border border-neutral-700 bg-bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
                        Waiting for approval
                      </span>
                    )}
                    {m.org.status === 'suspended' && (
                      <span className="rounded-full border border-red-400/40 bg-red-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-300">
                        Suspended
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-fg-tertiary">
                    {m.org._count.members} member{m.org._count.members === 1 ? '' : 's'} ·{' '}
                    {m.org._count.projects} project{m.org._count.projects === 1 ? '' : 's'} ·
                    joined {m.joinedAt.toLocaleString('en-GB', { month: 'short', year: 'numeric' })}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fg-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-fg-primary" />
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs leading-relaxed text-fg-tertiary">
          Control what each organisation sees of your hours in your{' '}
          <Link href="/profile#sec-orgs" className="text-amber-500 hover:underline">
            profile settings
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
