import 'server-only'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@/messages/en/notifications.json'

/* ================================================================
   Notification message rendering — English snapshot side.

   Notification copy is authored as ICU messages in
   messages/en/notifications.json. At write time we render the
   English string and store it on the row (`title` / `body`) as a
   permanent fallback, and we also store the message key + params in
   `data.i18n` so the notifications page can re-render the row in the
   READER's language at read time.

   Per-key param contracts (all params are plain strings unless noted):

     titles.projectJoinWelcome   { leadName, projectTitle }
     titles.projectJoin          { actorName, projectTitle }
     titles.projectJoinRequest   { actorName, projectTitle }
     titles.projectJoinDeclined  { projectTitle }
     titles.projectLeave         { actorName, projectTitle }
     titles.projectUpdated       { actorName, projectTitle }
     titles.projectRenamed       { actorName, oldTitle, newTitle }
     titles.updatePosted         { actorName, projectTitle }
     titles.stepClaimed          { actorName, stepTitle, projectTitle }
     titles.stepUnclaimed        { actorName, stepTitle, projectTitle }
     titles.stepCompleted        { actorName, stepTitle, projectTitle }
     titles.stepNeedsHelp        { actorName, stepTitle, projectTitle }
     titles.blueprintForked      { actorName, blueprintTitle, projectTitle }
     titles.skillMatch           { projectTitle, skillName }
     titles.inviteReceived       { actorName, orgName }
     titles.messageReceived      { senderName, count: number }

     bodies.projectJoinDeclined  (no params)
     bodies.inviteReceived       { code }
   ================================================================ */

export type NotificationMessageKey = keyof typeof en.titles
export type NotificationBodyKey = keyof typeof en.bodies

export interface NotificationMessage {
  key: NotificationMessageKey
  params?: Record<string, string | number>
}

export interface NotificationBodyMessage {
  key: NotificationBodyKey
  params?: Record<string, string | number>
}

function renderEn(icu: string, params?: Record<string, string | number>): string {
  const out = new IntlMessageFormat(icu, 'en').format(params)
  return Array.isArray(out) ? out.join('') : String(out)
}

/** Render a notification title as the stored-English snapshot string. */
export function renderNotificationTitleEn(msg: NotificationMessage): string {
  return renderEn(en.titles[msg.key], msg.params)
}

/** Render a notification body as the stored-English snapshot string. */
export function renderNotificationBodyEn(msg: NotificationBodyMessage): string {
  return renderEn(en.bodies[msg.key], msg.params)
}
