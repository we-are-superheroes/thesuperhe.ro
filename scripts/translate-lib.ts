import { createHash } from 'node:crypto'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'

/* ================================================================
   Pure helpers shared by scripts/translate.ts and
   scripts/translate-check.ts, and unit-tested in
   tests/translate-lib.test.ts. No fs, no network, no process.
   ================================================================ */

export type Tree = { [key: string]: string | Tree }

/** Per-locale map of `namespace:dot.path` → sha1 of the English value. */
export type LocaleHashes = Record<string, string>

export type TranslationState = {
  promptVersion: number
  glossaryHash: string
  locales: Record<string, LocaleHashes>
}

export const sha1 = (text: string): string => createHash('sha1').update(text, 'utf8').digest('hex')

/** State-file key for one message. */
export const stateKey = (namespace: string, path: string): string => `${namespace}:${path}`

/** Flatten a nested catalog into dot-path → value, preserving key order. */
export function flattenTree(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else Object.assign(out, flattenTree(value, path))
  }
  return out
}

/**
 * Rebuild a nested catalog from flat dot-path values, using the English
 * tree as the structural reference so key order matches the en file
 * exactly. Every leaf of `reference` must exist in `flat`.
 */
export function unflattenLike(flat: Record<string, string>, reference: Tree, prefix = ''): Tree {
  const out: Tree = {}
  for (const [key, value] of Object.entries(reference)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      const translated = flat[path]
      if (translated === undefined) throw new Error(`unflattenLike: missing value for "${path}"`)
      out[key] = translated
    } else {
      out[key] = unflattenLike(flat, value, path)
    }
  }
  return out
}

export type NamespaceWork = {
  /** Translated before, but the English value (or prompt/glossary) changed. */
  stale: string[]
  /** Never translated, or absent from the target file. */
  missing: string[]
  /** Present in the target file or state but no longer in en → prune. */
  orphans: string[]
}

/**
 * Diff one namespace of one target locale against the English source.
 * `hashes` is the locale's state map (keys `namespace:path`); `targetFlat`
 * is the flattened target-locale file ({} if the file doesn't exist).
 * `allStale` forces every translated key stale (prompt/glossary change
 * or --all). Hand-edits to the target file are invisible here by design:
 * staleness tracks the English side only.
 */
export function diffNamespace(
  namespace: string,
  enFlat: Record<string, string>,
  hashes: LocaleHashes,
  targetFlat: Record<string, string>,
  allStale = false,
): NamespaceWork {
  const stale: string[] = []
  const missing: string[] = []
  for (const [path, enValue] of Object.entries(enFlat)) {
    const recorded = hashes[stateKey(namespace, path)]
    if (recorded === undefined || targetFlat[path] === undefined) missing.push(path)
    else if (allStale || recorded !== sha1(enValue)) stale.push(path)
  }
  const orphans = new Set<string>()
  for (const path of Object.keys(targetFlat)) {
    if (enFlat[path] === undefined) orphans.add(path)
  }
  const nsPrefix = `${namespace}:`
  for (const key of Object.keys(hashes)) {
    if (!key.startsWith(nsPrefix)) continue
    const path = key.slice(nsPrefix.length)
    if (enFlat[path] === undefined) orphans.add(path)
  }
  return { stale, missing, orphans: [...orphans].sort() }
}

/**
 * Split work keys into API batches: at most `maxKeys` keys and roughly
 * `maxChars` characters of English source per batch, so long-form
 * namespaces (legal-*) don't overflow the response token budget.
 */
export function batchKeys(
  keys: string[],
  enFlat: Record<string, string>,
  maxKeys = 60,
  maxChars = 8000,
): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  let chars = 0
  for (const key of keys) {
    const len = enFlat[key]?.length ?? 0
    if (current.length > 0 && (current.length >= maxKeys || chars + len > maxChars)) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(key)
    chars += len
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/* ---------------- ICU validation ---------------- */

/** Locales whose plurals must spell out one/few/many/other. */
export const SLAVIC_PLURAL_LOCALES = new Set(['ru', 'uk'])

type IcuShape = {
  args: Set<string>
  tags: Set<string>
  /** plural argument name → categories used (`one`, `few`, `=1`, …) */
  plurals: Map<string, Set<string>>
}

function analyseIcu(elements: MessageFormatElement[]): IcuShape {
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
          const existing = plurals.get(el.value) ?? new Set<string>()
          for (const category of Object.keys(el.options)) existing.add(category)
          plurals.set(el.value, existing)
        }
        for (const option of Object.values(el.options)) walk(option.value)
      }
    }
  }
  walk(elements)
  return { args, tags, plurals }
}

const setDiff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x))

/**
 * Validate one batch of model output against the English source.
 * Returns a list of human-readable problems; empty = valid.
 */
export function validateBatch(
  source: Record<string, string>,
  translated: unknown,
  locale: string,
): string[] {
  const errors: string[] = []
  if (translated === null || typeof translated !== 'object' || Array.isArray(translated)) {
    return ['response is not a JSON object']
  }
  const result = translated as Record<string, unknown>

  const sourceKeys = new Set(Object.keys(source))
  const resultKeys = new Set(Object.keys(result))
  for (const key of setDiff(sourceKeys, resultKeys)) errors.push(`missing key "${key}"`)
  for (const key of setDiff(resultKeys, sourceKeys)) errors.push(`unexpected key "${key}"`)

  for (const [key, enValue] of Object.entries(source)) {
    const value = result[key]
    if (value === undefined) continue
    if (typeof value !== 'string') {
      errors.push(`"${key}": value must be a string`)
      continue
    }
    if (value.trim() === '') {
      errors.push(`"${key}": empty translation`)
      continue
    }
    let ownShape: IcuShape
    try {
      ownShape = analyseIcu(parse(value))
    } catch (e) {
      errors.push(`"${key}": invalid ICU message (${e instanceof Error ? e.message : String(e)})`)
      continue
    }
    const enShape = analyseIcu(parse(enValue))
    for (const arg of setDiff(enShape.args, ownShape.args)) {
      errors.push(`"${key}": missing placeholder {${arg}}`)
    }
    for (const arg of setDiff(ownShape.args, enShape.args)) {
      errors.push(`"${key}": unknown placeholder {${arg}} (not in the English source)`)
    }
    for (const tag of setDiff(enShape.tags, ownShape.tags)) {
      errors.push(`"${key}": missing tag <${tag}></${tag}>`)
    }
    for (const tag of setDiff(ownShape.tags, enShape.tags)) {
      errors.push(`"${key}": unknown tag <${tag}> (not in the English source)`)
    }
    for (const arg of enShape.plurals.keys()) {
      if (!ownShape.plurals.has(arg)) errors.push(`"${key}": plural on {${arg}} was lost`)
    }
    if (SLAVIC_PLURAL_LOCALES.has(locale)) {
      for (const [arg, categories] of ownShape.plurals) {
        for (const required of ['one', 'few', 'many', 'other']) {
          // An exact match (=1 for "one") may stand in for the category.
          const exactCovers = required === 'one' && categories.has('=1')
          if (!categories.has(required) && !exactCovers) {
            errors.push(`"${key}": plural {${arg}} must include the "${required}" category for ${locale}`)
          }
        }
      }
    }
  }
  return errors
}
