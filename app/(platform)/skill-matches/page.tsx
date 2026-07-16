import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { getTranslations } from 'next-intl/server'
import { MapPin, Globe, Pencil, Star } from 'lucide-react'
import { getSkillMatchFeed } from '@/lib/skill-matches'
import { languageLabel } from '@/lib/locales'
import { SkillMatchesClient } from '@/components/platform/skill-matches-client'

/* ================================================================
   /skill-matches — steps and projects scored against the signed-in
   user's seeking skills, city and spoken languages. The fetching +
   scoring lives in lib/skill-matches.ts (shared with the dashboard's
   top-3 strip); this page renders the full list with filters.
   ================================================================ */

export default async function SkillMatchesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [t, { cards, seekingSkills, languages, location }] = await Promise.all([
    getTranslations('skillMatches'),
    getSkillMatchFeed(userId),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1020px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        {/* Page head */}
        <header>
          <h1 className="mb-3 font-display text-[clamp(36px,4vw,52px)] font-normal leading-none tracking-tight">
            {t.rich('hero.title', {
              em: (chunks) => <em className="italic text-amber-500">{chunks}</em>,
            })}
          </h1>
          <p className="max-w-[600px] text-lg leading-relaxed text-fg-secondary">
            {t('hero.subtitle')}
          </p>
        </header>

        {/* Matching-basis strip */}
        <section
          aria-label={t('basis.ariaLabel')}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-bg-surface px-5 py-4"
        >
          <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-fg-tertiary">
            {t('basis.matchingOn')}
          </span>
          {seekingSkills.length > 0 ? (
            seekingSkills.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/[0.12] px-3 py-1 text-sm font-medium text-amber-500"
              >
                {s.name}
              </span>
            ))
          ) : (
            <span className="text-sm text-fg-tertiary">{t('basis.noSkills')}</span>
          )}
          {location && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-surface-2 px-3 py-1 text-sm text-fg-secondary">
              <MapPin className="size-3.5 shrink-0" />
              {location}
            </span>
          )}
          {languages.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-bg-surface-2 px-3 py-1 text-sm text-fg-secondary">
              <Globe className="size-3.5 shrink-0" />
              {languages.map((code) => languageLabel(code) ?? code).join(', ')}
            </span>
          )}
          <Link
            href="/profile"
            className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-fg-tertiary transition-colors hover:text-amber-500"
          >
            <Pencil className="size-3.5" />
            {t('basis.editProfile')}
          </Link>
        </section>

        {seekingSkills.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-neutral-700 bg-[radial-gradient(ellipse_at_top,rgba(244,165,53,0.06),transparent_70%),var(--color-bg-surface)] px-8 py-12 text-center">
            <div className="mb-2 flex size-16 items-center justify-center rounded-full border border-neutral-700 bg-bg-surface-2 text-amber-500">
              <Star className="size-7" />
            </div>
            <h3 className="font-display text-2xl">{t('emptyProfile.title')}</h3>
            <p className="max-w-[460px] leading-relaxed text-fg-secondary">
              {t('emptyProfile.description')}
            </p>
            <Link
              href="/profile"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-900 transition-all duration-standard hover:-translate-y-px hover:bg-amber-400 hover:shadow-glow-amber"
            >
              {t('emptyProfile.cta')}
            </Link>
          </div>
        ) : (
          <SkillMatchesClient cards={cards} />
        )}
      </div>
    </div>
  )
}
