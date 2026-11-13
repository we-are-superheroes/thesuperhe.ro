import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EmailLinkAction } from '@/components/marketing/email-link-action'

/* Where the "unsubscribe" link in a notification e-mail lands. Nothing
   changes until the reader presses the button (see EmailLinkAction). */

export const metadata = { robots: { index: false } }

export default async function EmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/email-unsubscribed?state=invalid')
  const t = await getTranslations('notifications')

  return (
    <EmailLinkAction
      title={t('emailUnsub.confirm.title')}
      body={t('emailUnsub.confirm.body')}
      buttonLabel={t('emailUnsub.confirm.button')}
      action="/api/notifications/unsubscribe"
      token={token}
    />
  )
}
