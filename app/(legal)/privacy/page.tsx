import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LegalPage, LegalSection as Section } from '@/components/ui/legal-page'

export async function generateMetadata() {
  const t = await getTranslations('meta')
  return { title: t('privacy.title'), description: t('privacy.description') }
}

/* ================================================================
   Privacy policy. Written for the platform as it actually works
   today (Clerk auth, Supabase in the EU, Vercel hosting, essential
   cookies only, no analytics). Keep it in sync when that changes —
   especially if analytics or email sending are added.

   English is the authoritative text (the policy says so): copy
   lives in messages/<locale>/legal-privacy.json, en is the source.
   ================================================================ */

const LAST_UPDATED = '12 July 2026'
const SUPPORT_EMAIL = 'support@thesuperhe.ro'

export default async function PrivacyPage() {
  const t = await getTranslations('legal-privacy')

  const supportLink = (chunks: React.ReactNode) => (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-500 hover:underline">
      {chunks}
    </a>
  )
  const strong = (chunks: React.ReactNode) => (
    <strong className="text-fg-primary">{chunks}</strong>
  )

  return (
    <LegalPage
      eyebrow={t('chrome.eyebrow')}
      title={t('chrome.title')}
      updatedLine={t('chrome.lastUpdated', { date: LAST_UPDATED })}
    >

      <Section title={t('sections.whoWeAre.title')}>
        <p>{t.rich('sections.whoWeAre.p1', { email: SUPPORT_EMAIL, link: supportLink })}</p>
        <p>{t('sections.whoWeAre.englishPrevails')}</p>
      </Section>

      <Section title={t('sections.whatWeCollect.title')}>
        <p>{t.rich('sections.whatWeCollect.p1', { strong })}</p>
        <p>{t.rich('sections.whatWeCollect.p2', { strong })}</p>
        <p>{t.rich('sections.whatWeCollect.p3', { strong })}</p>
        <p>{t.rich('sections.whatWeCollect.p4', { strong })}</p>
      </Section>

      <Section title={t('sections.whatWeUseItFor.title')}>
        <p>{t('sections.whatWeUseItFor.p1')}</p>
      </Section>

      <Section title={t('sections.whatIsPublic.title')}>
        <p>{t('sections.whatIsPublic.p1')}</p>
        <p>{t('sections.whatIsPublic.p2')}</p>
      </Section>

      <Section title={t('sections.cookies.title')}>
        <p>
          {t.rich('sections.cookies.p1', {
            code: (chunks) => <code className="text-fg-primary">{chunks}</code>,
          })}
        </p>
      </Section>

      <Section title={t('sections.processors.title')}>
        <p>{t('sections.processors.intro')}</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>{t.rich('sections.processors.items.supabase', { strong })}</li>
          <li>{t.rich('sections.processors.items.clerk', { strong })}</li>
          <li>{t.rich('sections.processors.items.vercel', { strong })}</li>
        </ul>
        <p>{t('sections.processors.outro')}</p>
      </Section>

      <Section title={t('sections.retention.title')}>
        <p>{t('sections.retention.p1')}</p>
      </Section>

      <Section title={t('sections.yourRights.title')}>
        <p>{t.rich('sections.yourRights.p1', { email: SUPPORT_EMAIL, link: supportLink })}</p>
        <p>{t('sections.yourRights.p2')}</p>
      </Section>

      <Section title={t('sections.policyChanges.title')}>
        <p>{t('sections.policyChanges.p1')}</p>
      </Section>

      <p className="mt-12 text-sm text-fg-tertiary">
        {t('footer.questions')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-500 hover:underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        · <Link href="/terms" className="text-amber-500 hover:underline">{t('footer.termsLink')}</Link>{' '}
        · <Link href="/" className="text-amber-500 hover:underline">{t('footer.homeLink')}</Link>
      </p>
    </LegalPage>
  )
}
