import type common from './messages/en/common.json'
import type errors from './messages/en/errors.json'
import type nav from './messages/en/nav.json'
import type search from './messages/en/search.json'
import type dashboard from './messages/en/dashboard.json'
import type browse from './messages/en/browse.json'
import type project from './messages/en/project.json'
import type steps from './messages/en/steps.json'
import type blueprints from './messages/en/blueprints.json'
import type orgs from './messages/en/orgs.json'
import type profile from './messages/en/profile.json'
import type users from './messages/en/users.json'
import type mySteps from './messages/en/mySteps.json'
import type myProjects from './messages/en/myProjects.json'
import type skillMatches from './messages/en/skillMatches.json'
import type messagesInbox from './messages/en/messagesInbox.json'
import type admin from './messages/en/admin.json'
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
      errors: typeof errors
      nav: typeof nav
      search: typeof search
      dashboard: typeof dashboard
      browse: typeof browse
      project: typeof project
      steps: typeof steps
      blueprints: typeof blueprints
      orgs: typeof orgs
      profile: typeof profile
      users: typeof users
      mySteps: typeof mySteps
      myProjects: typeof myProjects
      skillMatches: typeof skillMatches
      messagesInbox: typeof messagesInbox
      admin: typeof admin
    }
  }
}
