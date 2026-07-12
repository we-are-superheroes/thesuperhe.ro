import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { SUPPORTED_LOCALES } from '@/lib/locale-shared'
import { NAMESPACES } from '@/i18n/messages'

/* ================================================================
   Catalog integrity. Until the first translation run (phase 7 of
   docs/i18n-plan.md) only `en` exists; every locale directory that
   DOES exist must be complete and ICU-valid. Phase 7 flips
   REQUIRE_ALL_LOCALES to true so a missing locale fails CI.
   ================================================================ */

const REQUIRE_ALL_LOCALES = false

const MESSAGES_DIR = join(__dirname, '..', 'messages')

/** Locales with plural categories beyond one/other that ICU must cover. */
const EXTRA_PLURAL_LOCALES: Record<string, string[]> = {
  ru: ['one', 'few', 'many', 'other'],
  uk: ['one', 'few', 'many', 'other'],
}

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

function loadNamespace(locale: string, ns: string): Tree {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, locale, `${ns}.json`), 'utf8')) as Tree
}

/** Collect argument names, tag names and plural categories from an ICU AST. */
function analyse(elements: MessageFormatElement[]) {
  const args = new Set<string>()
  const tags = new Set<string>()
  const plurals = new Map<string, Set<string>>()
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) {
        args.add(el.value)
      } else if (el.type === TYPE.tag) {
        tags.add(el.value)
        walk(el.children)
      } else if (el.type === TYPE.plural || el.type === TYPE.select) {
        args.add(el.value)
        if (el.type === TYPE.plural) {
          plurals.set(el.value, new Set(Object.keys(el.options)))
        }
        for (const option of Object.values(el.options)) walk(option.value)
      }
    }
  }
  walk(elements)
  return { args, tags, plurals }
}

const presentLocales = existsSync(MESSAGES_DIR)
  ? readdirSync(MESSAGES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : []

describe('message catalogs', () => {
  it('every locale directory is a supported locale', () => {
    for (const locale of presentLocales) {
      expect(SUPPORTED_LOCALES).toContain(locale)
    }
  })

  it('en has every namespace registered in NAMESPACES', () => {
    for (const ns of NAMESPACES) {
      expect(existsSync(join(MESSAGES_DIR, 'en', `${ns}.json`)), `messages/en/${ns}.json`).toBe(true)
    }
  })

  if (REQUIRE_ALL_LOCALES) {
    it('all supported locales are present', () => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(presentLocales, `messages/${locale}/ missing`).toContain(locale)
      }
    })
  }

  for (const locale of presentLocales) {
    describe(locale, () => {
      for (const ns of NAMESPACES) {
        it(`${ns}: parses, matches en keys, ICU-valid`, () => {
          const en = flatten(loadNamespace('en', ns))
          if (locale === 'en') {
            for (const [key, message] of en) {
              expect(() => parse(message), `${ns}.${key}`).not.toThrow()
            }
            return
          }

          expect(
            existsSync(join(MESSAGES_DIR, locale, `${ns}.json`)),
            `messages/${locale}/${ns}.json missing`,
          ).toBe(true)
          const own = flatten(loadNamespace(locale, ns))

          // Key-set equality both ways.
          expect([...own.keys()].sort()).toEqual([...en.keys()].sort())

          for (const [key, message] of own) {
            const source = en.get(key)!
            const enAst = analyse(parse(source))
            const ownAst = analyse(parse(message))

            // Placeholder and tag parity with the English source.
            expect([...ownAst.args].sort(), `${ns}.${key} arguments`).toEqual(
              [...enAst.args].sort(),
            )
            expect([...ownAst.tags].sort(), `${ns}.${key} tags`).toEqual([...enAst.tags].sort())

            // Slavic locales must spell out one/few/many for every plural.
            const required = EXTRA_PLURAL_LOCALES[locale]
            if (required) {
              for (const [arg, categories] of ownAst.plurals) {
                for (const cat of required) {
                  expect(
                    categories.has(cat) || categories.has('=1'),
                    `${ns}.${key} plural(${arg}) missing "${cat}"`,
                  ).toBe(true)
                }
              }
            }
          }
        })
      }
    })
  }
})
