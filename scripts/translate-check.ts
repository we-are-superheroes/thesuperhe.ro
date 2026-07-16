import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Tree,
  type TranslationState,
  sha1,
  flattenTree,
  diffNamespace,
} from './translate-lib'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../lib/locale-shared'
import { NAMESPACES } from '../i18n/messages'

/* ================================================================
   CI gate: `npm run translate:check` (no API, no env needed).

   Recomputes the per-key hashes of the English catalogs against
   messages/.translation-state.json and compares target-file key sets
   with en. Exits 1 listing stale/missing/orphan keys so a changed
   English string can't ship with silently outdated translations.

   Hand-edits to TARGET files are fine and never flagged — the state
   tracks the English side only.
   ================================================================ */

const PROMPT_VERSION = 1 // keep in sync with scripts/translate.ts

const MESSAGES_DIR = join(process.cwd(), 'messages')
const STATE_PATH = join(MESSAGES_DIR, '.translation-state.json')
const GLOSSARY_PATH = join(MESSAGES_DIR, 'glossary.md')

function loadCatalog(locale: string, namespace: string): Tree {
  const path = join(MESSAGES_DIR, locale, `${namespace}.json`)
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8')) as Tree
}

function main() {
  const targetLocales = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)
  const presentDirs = targetLocales.filter((l) => existsSync(join(MESSAGES_DIR, l)))

  const state: TranslationState = existsSync(STATE_PATH)
    ? (JSON.parse(readFileSync(STATE_PATH, 'utf8')) as TranslationState)
    : { promptVersion: PROMPT_VERSION, glossaryHash: '', locales: {} }

  // Before the first translation run there is nothing to check — keep
  // CI green until `npm run translate` lands the initial catalogs.
  if (presentDirs.length === 0 && Object.keys(state.locales).length === 0) {
    console.log('no translations yet — run npm run translate')
    return
  }

  const glossaryHash = existsSync(GLOSSARY_PATH) ? sha1(readFileSync(GLOSSARY_PATH, 'utf8')) : ''
  const identityChanged = state.promptVersion !== PROMPT_VERSION || state.glossaryHash !== glossaryHash

  const problems: string[] = []
  if (identityChanged) {
    problems.push(
      'prompt version or glossary changed since the last full translation run — every key is stale',
    )
  }

  const summarise = (label: string, keys: string[]) => {
    if (keys.length === 0) return null
    const shown = keys.slice(0, 8)
    const more = keys.length - shown.length
    return `${keys.length} ${label}: ${shown.join(', ')}${more > 0 ? ` … +${more} more` : ''}`
  }

  const checkedLocales = [...new Set([...presentDirs, ...Object.keys(state.locales)])].sort()
  let staleTotal = 0
  let missingTotal = 0
  let orphanTotal = 0

  for (const locale of checkedLocales) {
    const hashes = state.locales[locale] ?? {}
    const localeLines: string[] = []
    for (const ns of NAMESPACES) {
      const enFlat = flattenTree(loadCatalog('en', ns))
      const targetFlat = flattenTree(loadCatalog(locale, ns))
      const { stale, missing, orphans } = diffNamespace(ns, enFlat, hashes, targetFlat, identityChanged)
      staleTotal += stale.length
      missingTotal += missing.length
      orphanTotal += orphans.length
      const parts = [
        summarise('stale', stale),
        summarise('missing', missing),
        summarise('orphan', orphans),
      ].filter((p): p is string => p !== null)
      if (parts.length > 0) localeLines.push(`  ${ns}: ${parts.join(' | ')}`)
    }
    if (localeLines.length > 0) problems.push(`${locale}:`, ...localeLines)
  }

  if (problems.length > 0) {
    console.error('Translations are out of date. Run `npm run translate` and commit the result.\n')
    for (const line of problems) console.error(line)
    console.error(`\nTotal: ${staleTotal} stale, ${missingTotal} missing, ${orphanTotal} orphan(s).`)
    process.exit(1)
  }

  console.log(`translate:check OK — ${checkedLocales.length} locale(s) up to date with en.`)
}

main()
