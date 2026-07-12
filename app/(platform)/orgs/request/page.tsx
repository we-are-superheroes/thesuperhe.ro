import { getTranslations } from 'next-intl/server'
import { OrgRequestForm } from '@/components/platform/org-request-form'

export const metadata = {
  title: 'Request an organisation — The Superhero',
}

export default async function OrgRequestPage() {
  const t = await getTranslations('orgs')
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 p-4 sm:p-6 lg:p-10">
        <header>
          <h1 className="mb-3 font-display text-[clamp(32px,4vw,48px)] font-normal leading-none tracking-tight">
            {t.rich('requestPage.title', {
              em: (chunks) => <em className="italic text-amber-500">{chunks}</em>,
            })}
          </h1>
          <p className="max-w-[560px] text-lg leading-relaxed text-fg-secondary">
            {t('requestPage.intro')}
          </p>
        </header>
        <OrgRequestForm />
      </div>
    </div>
  )
}
