import { GroupIntlProvider } from '@/i18n/provider'

/** Auth pages: Clerk widgets self-localise; this covers our own chrome. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <GroupIntlProvider group="auth">{children}</GroupIntlProvider>
}
