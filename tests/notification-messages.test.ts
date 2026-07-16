import { describe, expect, it } from 'vitest'
import en from '@/messages/en/notifications.json'
import {
  renderNotificationTitleEn,
  renderNotificationBodyEn,
  type NotificationMessageKey,
} from '@/lib/notification-messages'

/* ================================================================
   The stored English snapshot must be byte-identical to the legacy
   template-literal copy — these are the exact strings the old code
   interpolated at each notify() call site.
   ================================================================ */

describe('renderNotificationTitleEn', () => {
  it('matches the legacy strings exactly', () => {
    const cases: Array<[NotificationMessageKey, Record<string, string | number>, string]> = [
      [
        'projectJoinWelcome',
        { leadName: 'Ada Lovelace', projectTitle: 'Repair Café' },
        'Ada Lovelace welcomed you to Repair Café.',
      ],
      [
        'projectJoin',
        { actorName: 'Ada Lovelace', projectTitle: 'Repair Café' },
        'Ada Lovelace joined Repair Café.',
      ],
      [
        'projectJoinRequest',
        { actorName: 'Ada Lovelace', projectTitle: 'Repair Café' },
        'Ada Lovelace wants to join Repair Café.',
      ],
      [
        'projectJoinDeclined',
        { projectTitle: 'Repair Café' },
        "Your request to join Repair Café wasn't accepted this time.",
      ],
      [
        'projectLeave',
        { actorName: 'Ada Lovelace', projectTitle: 'Repair Café' },
        'Ada Lovelace left Repair Café.',
      ],
      [
        'projectUpdated',
        { actorName: 'Ada Lovelace', projectTitle: 'Repair Café' },
        'Ada Lovelace updated Repair Café.',
      ],
      [
        'projectRenamed',
        { actorName: 'Ada Lovelace', oldTitle: 'Repair Café', newTitle: 'Repair Hub' },
        'Ada Lovelace renamed “Repair Café” to “Repair Hub”.',
      ],
      [
        'updatePosted',
        { actorName: 'Ada Lovelace', projectTitle: 'Repair Café' },
        'Ada Lovelace posted an update in Repair Café.',
      ],
      [
        'stepClaimed',
        { actorName: 'Ada Lovelace', stepTitle: 'Find a venue', projectTitle: 'Repair Café' },
        'Ada Lovelace joined “Find a venue” in Repair Café.',
      ],
      [
        'stepUnclaimed',
        { actorName: 'Ada Lovelace', stepTitle: 'Find a venue', projectTitle: 'Repair Café' },
        'Ada Lovelace left “Find a venue” in Repair Café.',
      ],
      [
        'stepCompleted',
        { actorName: 'Ada Lovelace', stepTitle: 'Find a venue', projectTitle: 'Repair Café' },
        'Ada Lovelace finished “Find a venue” in Repair Café.',
      ],
      [
        'stepNeedsHelp',
        { actorName: 'Ada Lovelace', stepTitle: 'Find a venue', projectTitle: 'Repair Café' },
        'Ada Lovelace asked for help on “Find a venue” in Repair Café.',
      ],
      [
        'blueprintForked',
        { actorName: 'Ada Lovelace', blueprintTitle: 'Repair Café', projectTitle: 'Leeds Repair Café' },
        'Ada Lovelace forked your “Repair Café” blueprint as “Leeds Repair Café”.',
      ],
      [
        'skillMatch',
        { projectTitle: 'Repair Café', skillName: 'Grant writing' },
        'New project “Repair Café” needs Grant writing.',
      ],
      [
        'inviteReceived',
        { actorName: 'Ada Lovelace', orgName: 'Green Leeds' },
        'Ada Lovelace invited you to join Green Leeds.',
      ],
    ]
    for (const [key, params, expected] of cases) {
      expect(renderNotificationTitleEn({ key, params }), key).toBe(expected)
    }
  })

  it('messageReceived pluralises exactly like the legacy copy', () => {
    expect(
      renderNotificationTitleEn({
        key: 'messageReceived',
        params: { senderName: 'Anna', count: 1 },
      }),
    ).toBe('Anna sent you a message.')
    expect(
      renderNotificationTitleEn({
        key: 'messageReceived',
        params: { senderName: 'Anna', count: 3 },
      }),
    ).toBe('3 new messages from Anna.')
  })
})

describe('renderNotificationBodyEn', () => {
  it('matches the legacy strings exactly', () => {
    expect(renderNotificationBodyEn({ key: 'projectJoinDeclined' })).toBe(
      'Thanks for offering to help — the team cannot take this one forward right now. Plenty of other projects need your skills.',
    )
    expect(renderNotificationBodyEn({ key: 'inviteReceived', params: { code: 'GREEN-4BX2QF' } })).toBe(
      'Use invite code GREEN-4BX2QF on the organisation page.',
    )
  })
})

describe('catalog coverage', () => {
  it('every title key renders without throwing', () => {
    const params: Record<string, string | number> = {
      actorName: 'A',
      leadName: 'A',
      senderName: 'A',
      projectTitle: 'P',
      oldTitle: 'P',
      newTitle: 'P',
      stepTitle: 'S',
      blueprintTitle: 'B',
      skillName: 'K',
      orgName: 'O',
      count: 2,
    }
    for (const key of Object.keys(en.titles) as NotificationMessageKey[]) {
      expect(() => renderNotificationTitleEn({ key, params }), key).not.toThrow()
      expect(renderNotificationTitleEn({ key, params }).length, key).toBeGreaterThan(0)
    }
  })
})
