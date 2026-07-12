import type common from './messages/en/common.json'
import type steps from './messages/en/steps.json'
import type { Locale } from './lib/locale-shared'

/**
 * Type-safe message keys: augmenting next-intl with the shape of the
 * English catalog turns `t('typo.key')` into a tsc error. Every new
 * namespace must be added here (and to NAMESPACES in i18n/messages.ts)
 * in the commit that creates its catalog file.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: {
      common: typeof common
      steps: typeof steps
    }
  }
}
