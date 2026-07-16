import { GroupIntlProvider } from '@/i18n/provider'

/** Marketing pages: only the shared namespaces reach the client. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <GroupIntlProvider group="marketing">{children}</GroupIntlProvider>
}
