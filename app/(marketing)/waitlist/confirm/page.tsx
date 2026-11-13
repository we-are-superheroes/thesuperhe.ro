import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EmailLinkAction } from '@/components/marketing/email-link-action'

/* Where the "confirm my e-mail" link lands. Nothing is confirmed until the
   visitor presses the button (see EmailLinkAction for why). */

export const metadata = { robots: { index: false } }

export default async function WaitlistConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/waitlist/status?state=invalid')
  const t = await getTranslations('marketing')

  return (
    <EmailLinkAction
      title={t('waitlist.confirmPage.title')}
      body={t('waitlist.confirmPage.body')}
      buttonLabel={t('waitlist.confirmPage.button')}
      action="/api/waitlist/confirm"
      token={token}
    />
  )
}
