import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EmailLinkAction } from '@/components/marketing/email-link-action'

/* Where the "unsubscribe" link in a waitlist e-mail lands. Nothing changes
   until the visitor presses the button (see EmailLinkAction for why). */

export const metadata = { robots: { index: false } }

export default async function WaitlistUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/waitlist/status?state=unsubscribeInvalid')
  const t = await getTranslations('marketing')

  return (
    <EmailLinkAction
      title={t('waitlist.unsubscribePage.title')}
      body={t('waitlist.unsubscribePage.body')}
      buttonLabel={t('waitlist.unsubscribePage.button')}
      action="/api/waitlist/unsubscribe"
      token={token}
    />
  )
}
