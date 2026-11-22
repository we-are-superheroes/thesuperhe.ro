import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { isCurrentUserAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { CuratorManager } from '@/components/map/curator-manager'

/* ================================================================
   /admin/curators — who may add map places directly and review
   suggestions.

   Admin-only. The page 404s for everyone else, curators included;
   the grant / revoke actions check the admin role again themselves.
   ================================================================ */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('curators.title') }
}

export default async function CuratorsPage() {
  if (!(await isCurrentUserAdmin())) notFound()

  const [t, curators] = await Promise.all([
    getTranslations('map'),
    db.user.findMany({
      where: { role: 'curator' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        <header>
          <h1 className="mb-3 font-display text-[clamp(28px,4vw,44px)] font-normal leading-none tracking-tight">
            {t('curators.title')}
          </h1>
          <p className="max-w-[560px] text-base leading-relaxed text-fg-secondary">
            {t('curators.subtitle')}
          </p>
        </header>
        <CuratorManager curators={curators} />
      </div>
    </div>
  )
}
