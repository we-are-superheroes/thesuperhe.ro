import type { ComponentProps } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { GROUP_NAMESPACES, pickMessages } from '@/i18n/messages'

type ProviderMessages = ComponentProps<typeof NextIntlClientProvider>['messages']

/**
 * Route-group client provider. Server components translate via
 * `getTranslations` for free; this provider only ships the group's
 * namespaces to the browser for `useTranslations` in client
 * components. Locale and time zone are inherited from the request
 * config automatically.
 */
export async function GroupIntlProvider({
  group,
  children,
}: {
  group: keyof typeof GROUP_NAMESPACES
  children: React.ReactNode
}) {
  const messages = await getMessages()
  const subset = pickMessages(messages, GROUP_NAMESPACES[group])
  return (
    <NextIntlClientProvider messages={subset as ProviderMessages}>
      {children}
    </NextIntlClientProvider>
  )
}
