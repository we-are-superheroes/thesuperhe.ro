import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LegalPage, LegalSection as Section } from '@/components/ui/legal-page'

export async function generateMetadata() {
  const t = await getTranslations('meta')
  return { title: t('terms.title'), description: t('terms.description') }
}

/* ================================================================
   Terms of service. Plain-language, tailored to how the platform
   works (user-generated projects/blueprints/updates/messages,
   real-world volunteer activities, admin moderation). Swiss law.

   English is the authoritative text (the terms say so): copy lives
   in messages/<locale>/legal-terms.json, en is the source.
   ================================================================ */

const LAST_UPDATED = '4 July 2026'
const SUPPORT_EMAIL = 'support@thesuperhe.ro'

export default async function TermsPage() {
  const t = await getTranslations('legal-terms')

  return (
    <LegalPage
      eyebrow={t('chrome.eyebrow')}
      title={t('chrome.title')}
      updatedLine={t('chrome.lastUpdated', { date: LAST_UPDATED })}
    >
      <Section title={t('sections.shortVersion.title')}>
        <p>{t('sections.shortVersion.p1')}</p>
        <p>{t('sections.shortVersion.englishPrevails')}</p>
      </Section>

      <Section title={t('sections.agreement.title')}>
        <p>
          {t.rich('sections.agreement.p1', {
            link: (chunks) => (
              <Link href="/privacy" className="text-amber-500 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Section>

      <Section title={t('sections.account.title')}>
        <p>{t('sections.account.p1')}</p>
      </Section>

      <Section title={t('sections.platform.title')}>
        <p>{t('sections.platform.p1')}</p>
        <p>{t('sections.platform.p2')}</p>
      </Section>

      <Section title={t('sections.content.title')}>
        <p>{t('sections.content.p1')}</p>
        <p>{t('sections.content.p2')}</p>
        <p>{t('sections.content.p3')}</p>
      </Section>

      <Section title={t('sections.acceptableUse.title')}>
        <p>{t('sections.acceptableUse.intro')}</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>{t('sections.acceptableUse.items.unlawful')}</li>
          <li>{t('sections.acceptableUse.items.impersonate')}</li>
          <li>{t('sections.acceptableUse.items.spam')}</li>
          <li>{t('sections.acceptableUse.items.advertise')}</li>
          <li>{t('sections.acceptableUse.items.scrape')}</li>
          <li>{t('sections.acceptableUse.items.collect')}</li>
        </ul>
      </Section>

      <Section title={t('sections.moderation.title')}>
        <p>{t('sections.moderation.p1')}</p>
      </Section>

      <Section title={t('sections.availability.title')}>
        <p>{t('sections.availability.p1')}</p>
      </Section>

      <Section title={t('sections.liability.title')}>
        <p>{t('sections.liability.p1')}</p>
      </Section>

      <Section title={t('sections.termsChanges.title')}>
        <p>{t('sections.termsChanges.p1')}</p>
      </Section>

      <Section title={t('sections.law.title')}>
        <p>{t('sections.law.p1')}</p>
      </Section>

      <p className="mt-12 text-sm text-fg-tertiary">
        {t('footer.questions')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-500 hover:underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        · <Link href="/privacy" className="text-amber-500 hover:underline">{t('footer.privacyLink')}</Link>{' '}
        · <Link href="/" className="text-amber-500 hover:underline">{t('footer.homeLink')}</Link>
      </p>
    </LegalPage>
  )
}
