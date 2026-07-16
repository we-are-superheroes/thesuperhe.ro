import { config as loadEnv } from 'dotenv'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Tree,
  type TranslationState,
  sha1,
  stateKey,
  flattenTree,
  unflattenLike,
  diffNamespace,
  batchKeys,
  validateBatch,
} from './translate-lib'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from '../lib/locale-shared'
import { NAMESPACES, type Namespace } from '../i18n/messages'

/* ================================================================
   Claude-API translation pipeline (phase 7 of docs/i18n-plan.md).

     npm run translate                 translate stale + missing keys
     npm run translate -- --all        retranslate everything
     npm run translate -- --locale fr,de
     npm run translate -- --namespace orgs
     npm run translate -- --model claude-opus-4-8
     npm run translate -- --dry-run    no API; print work counts

   English is the authored source. Per-key sha1 hashes of the English
   values live in messages/.translation-state.json (committed); a key
   is stale when its English value, the glossary, or the prompt
   version changed since it was last translated. Hand-edits to the
   TARGET files are allowed and never overwritten unless the English
   side changes.
   ================================================================ */

// Mirror Next's env loading for scripts: .env.local wins over .env
// (dotenv never overwrites already-set variables).
loadEnv({ path: ['.env.local', '.env'], quiet: true })

/** Bump to force retranslation of everything after a prompt change. */
const PROMPT_VERSION = 1

const DEFAULT_MODEL = 'claude-opus-4-8'
const MESSAGES_DIR = join(process.cwd(), 'messages')
const STATE_PATH = join(MESSAGES_DIR, '.translation-state.json')
const GLOSSARY_PATH = join(MESSAGES_DIR, 'glossary.md')

const LANGUAGE_NAMES: Record<Exclude<Locale, 'en'>, string> = {
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  ru: 'Russian',
  uk: 'Ukrainian',
  pt: 'Portuguese (European)',
}

/* ---------------- CLI parsing ---------------- */

type CliOptions = {
  all: boolean
  dryRun: boolean
  model: string
  locales: Exclude<Locale, 'en'>[]
  namespaces: Namespace[]
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    all: false,
    dryRun: false,
    model: DEFAULT_MODEL,
    locales: SUPPORTED_LOCALES.filter((l): l is Exclude<Locale, 'en'> => l !== DEFAULT_LOCALE),
    namespaces: [...NAMESPACES],
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${arg} needs a value`)
      return v
    }
    if (arg === '--all') options.all = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--model') options.model = value()
    else if (arg === '--locale') {
      const requested = value().split(',').map((s) => s.trim()).filter(Boolean)
      options.locales = requested.map((l) => {
        if (l === 'en') throw new Error('en is the source locale — nothing to translate')
        const known = options.locales.find((k) => k === l)
        if (!known) throw new Error(`unknown locale "${l}" (supported: ${SUPPORTED_LOCALES.join(', ')})`)
        return known
      })
    } else if (arg === '--namespace') {
      const requested = value().split(',').map((s) => s.trim()).filter(Boolean)
      options.namespaces = requested.map((ns) => {
        const known = NAMESPACES.find((k) => k === ns)
        if (!known) throw new Error(`unknown namespace "${ns}" (known: ${NAMESPACES.join(', ')})`)
        return known
      })
    } else {
      throw new Error(`unknown argument "${arg}"`)
    }
  }
  return options
}

/* ---------------- state + catalog IO ---------------- */

function loadState(): TranslationState {
  if (!existsSync(STATE_PATH)) {
    return { promptVersion: PROMPT_VERSION, glossaryHash: '', locales: {} }
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as TranslationState
}

function saveState(state: TranslationState) {
  // Stable ordering keeps the committed file diff-friendly.
  const ordered: TranslationState = {
    promptVersion: state.promptVersion,
    glossaryHash: state.glossaryHash,
    locales: Object.fromEntries(
      Object.keys(state.locales)
        .sort()
        .map((locale) => [
          locale,
          Object.fromEntries(
            Object.keys(state.locales[locale])
              .sort()
              .map((key) => [key, state.locales[locale][key]]),
          ),
        ]),
    ),
  }
  writeFileSync(STATE_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8')
}

function loadCatalog(locale: string, namespace: string): Tree {
  const path = join(MESSAGES_DIR, locale, `${namespace}.json`)
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8')) as Tree
}

function saveCatalog(locale: string, namespace: string, tree: Tree) {
  const dir = join(MESSAGES_DIR, locale)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${namespace}.json`), JSON.stringify(tree, null, 2) + '\n', 'utf8')
}

/* ---------------- prompt ---------------- */

const SYSTEM_RULES = `You are the translation engine for "The Superhero", a web platform where people
collaborate on climate and sustainability projects. You translate the platform's
UI strings from English into a given target language.

Hard rules — violating any of these makes the output unusable:
1. Reply with ONLY a JSON object. No prose, no markdown fences, no comments.
2. The JSON object must have EXACTLY the same keys as the input object — no
   additions, omissions or renames. Every value must be a non-empty string.
3. Messages use ICU MessageFormat. Preserve every placeholder like {name} or
   {count} VERBATIM — same name, same braces, never translated.
4. Preserve ICU plural/select skeletons: keep the structure
   {arg, plural, ...}/{arg, select, ...} and the option keys; translate only
   the text inside the options.
5. Russian and Ukrainian: every plural MUST provide the categories
   one, few, many AND other (keep any =N exact matches from the source).
   Other languages keep the source's categories (usually one/other).
6. Preserve inline tags such as <em></em>, <strong></strong>, <link></link>
   exactly — same tag names, same nesting; translate only the text inside.
7. The product name "The Superhero" is NEVER translated or transliterated.
8. Use the pinned glossary renderings below for product vocabulary, and the
   glossary's address form (register) for the target language.
9. Plain language: short sentences, common words, active voice — many readers
   are not native speakers. Two exceptions by namespace: "marketing" carries
   the original's flair and energy; "legal-privacy" and "legal-terms" are
   formal and faithful to the legal meaning.

The glossary (verbatim, owner-maintained):
`

/* ---------------- Anthropic call ---------------- */

type AnthropicClient = {
  messages: {
    create: (params: {
      model: string
      max_tokens: number
      system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
      messages: Array<{ role: 'user'; content: string }>
    }) => Promise<{
      content: Array<{ type: string; text?: string }>
      stop_reason: string | null
    }>
  }
}

function buildUserMessage(
  locale: Exclude<Locale, 'en'>,
  namespace: string,
  batch: Record<string, string>,
  context: Record<string, string>,
  previousErrors: string[] = [],
): string {
  const parts = [
    `Target language: ${LANGUAGE_NAMES[locale]} (${locale}). Use the address form (register) the glossary specifies for this language.`,
    `Namespace: ${namespace}`,
  ]
  if (Object.keys(context).length > 0) {
    parts.push(
      `Existing ${LANGUAGE_NAMES[locale]} translations from this namespace, for consistency of tone and vocabulary (reference only — do not include them in your reply):\n${JSON.stringify(context, null, 2)}`,
    )
  }
  parts.push(
    `Translate the English values of this JSON object into ${LANGUAGE_NAMES[locale]}. Reply with ONLY a JSON object containing exactly these keys:\n${JSON.stringify(batch, null, 2)}`,
  )
  if (previousErrors.length > 0) {
    parts.push(
      `Your previous attempt failed validation. Fix ALL of these problems:\n- ${previousErrors.join('\n- ')}`,
    )
  }
  return parts.join('\n\n')
}

function extractJson(response: { content: Array<{ type: string; text?: string }>; stop_reason: string | null }): unknown {
  if (response.stop_reason === 'max_tokens') {
    throw new Error('response was cut off (max_tokens) — reduce the batch size')
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function translateBatch(
  client: AnthropicClient,
  model: string,
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>,
  locale: Exclude<Locale, 'en'>,
  namespace: string,
  batch: Record<string, string>,
  context: Record<string, string>,
): Promise<Record<string, string>> {
  let errors: string[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: buildUserMessage(locale, namespace, batch, context, errors) }],
    })
    const parsed = extractJson(response)
    errors = parsed === undefined ? ['response was not valid JSON'] : validateBatch(batch, parsed, locale)
    if (errors.length === 0) return parsed as Record<string, string>
    if (attempt === 1) {
      console.warn(`    retrying ${locale}/${namespace} batch — ${errors.length} validation problem(s)`)
    }
  }
  throw new Error(
    `TRANSLATION FAILED for ${locale}/${namespace} after a retry. Nothing from this batch was written.\n` +
      `Validation problems:\n- ${errors.join('\n- ')}`,
  )
}

/* ---------------- main ---------------- */

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!existsSync(GLOSSARY_PATH)) {
    throw new Error(`missing ${GLOSSARY_PATH} — the glossary is required`)
  }
  const glossary = readFileSync(GLOSSARY_PATH, 'utf8')
  const glossaryHash = sha1(glossary)

  const state = loadState()
  const promptOrGlossaryChanged =
    state.glossaryHash !== '' && (state.promptVersion !== PROMPT_VERSION || state.glossaryHash !== glossaryHash)
  const allStale = options.all || promptOrGlossaryChanged
  if (promptOrGlossaryChanged) {
    console.log('Prompt version or glossary changed — every translated key is stale.')
  }

  // Flatten every requested en namespace once.
  const enFlat = new Map<Namespace, Record<string, string>>()
  const enTrees = new Map<Namespace, Tree>()
  for (const ns of options.namespaces) {
    const tree = loadCatalog('en', ns)
    enTrees.set(ns, tree)
    enFlat.set(ns, flattenTree(tree))
  }

  // Plan the work.
  type WorkItem = {
    locale: Exclude<Locale, 'en'>
    namespace: Namespace
    stale: string[]
    missing: string[]
    orphans: string[]
  }
  const plan: WorkItem[] = []
  for (const locale of options.locales) {
    const hashes = state.locales[locale] ?? {}
    for (const ns of options.namespaces) {
      const targetFlat = flattenTree(loadCatalog(locale, ns))
      const work = diffNamespace(ns, enFlat.get(ns)!, hashes, targetFlat, allStale)
      if (work.stale.length || work.missing.length || work.orphans.length) {
        plan.push({ locale, namespace: ns, ...work })
      }
    }
  }

  if (options.dryRun) {
    if (plan.length === 0) {
      console.log('Nothing to do — all translations are up to date.')
      return
    }
    console.log(`Dry run (model would be ${options.model}):`)
    let totals = { stale: 0, missing: 0, orphans: 0 }
    for (const locale of options.locales) {
      const items = plan.filter((w) => w.locale === locale)
      if (items.length === 0) continue
      console.log(`  ${locale}:`)
      for (const w of items) {
        console.log(
          `    ${w.namespace}: ${w.stale.length} stale, ${w.missing.length} missing, ${w.orphans.length} orphan(s)`,
        )
        totals = {
          stale: totals.stale + w.stale.length,
          missing: totals.missing + w.missing.length,
          orphans: totals.orphans + w.orphans.length,
        }
      }
    }
    console.log(`Total: ${totals.stale} stale, ${totals.missing} missing, ${totals.orphans} orphan(s).`)
    return
  }

  if (plan.length === 0) {
    console.log('Nothing to do — all translations are up to date.')
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local (or export it) and re-run. ' +
        'Use --dry-run to preview the work without an API key.',
    )
  }

  // Imported lazily so --dry-run works even before `npm install` picks
  // up the SDK in a fresh checkout.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey }) as unknown as AnthropicClient

  // Static system prompt + glossary; cache_control on the final block
  // caches the whole system prefix across calls (prompt caching).
  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    { type: 'text', text: SYSTEM_RULES },
    { type: 'text', text: glossary, cache_control: { type: 'ephemeral' } },
  ]

  for (const item of plan) {
    const { locale, namespace } = item
    const en = enFlat.get(namespace)!
    const enTree = enTrees.get(namespace)!
    const hashes = (state.locales[locale] ??= {})
    const targetFlat = flattenTree(loadCatalog(locale, namespace))

    const workKeys = [...new Set([...item.stale, ...item.missing])]
    let translatedCount = 0

    if (workKeys.length > 0) {
      // Unchanged siblings = consistency context (up to 20).
      const workSet = new Set(workKeys)
      const context: Record<string, string> = {}
      for (const [path, value] of Object.entries(targetFlat)) {
        if (Object.keys(context).length >= 20) break
        if (workSet.has(path) || en[path] === undefined) continue
        if (hashes[stateKey(namespace, path)] === sha1(en[path])) context[path] = value
      }

      for (const batch of batchKeys(workKeys, en)) {
        const source = Object.fromEntries(batch.map((path) => [path, en[path]]))
        const result = await translateBatch(client, options.model, system, locale, namespace, source, context)
        for (const [path, value] of Object.entries(result)) {
          targetFlat[path] = value
          hashes[stateKey(namespace, path)] = sha1(en[path])
        }
        translatedCount += batch.length
      }
    }

    // Prune orphans from both the file and the state.
    for (const path of item.orphans) {
      delete targetFlat[path]
      delete hashes[stateKey(namespace, path)]
    }

    saveCatalog(locale, namespace, unflattenLike(targetFlat, enTree))
    saveState(state) // after every namespace, so an abort is resumable
    console.log(
      `  ${locale}/${namespace}: translated ${translatedCount} (${item.stale.length} stale, ${item.missing.length} missing), pruned ${item.orphans.length}`,
    )
  }

  // Only stamp the prompt/glossary identity once a run covered the full
  // matrix — a filtered run must leave the rest marked stale.
  const fullRun =
    options.locales.length === SUPPORTED_LOCALES.length - 1 && options.namespaces.length === NAMESPACES.length
  if (fullRun || state.glossaryHash === '') {
    state.promptVersion = PROMPT_VERSION
    state.glossaryHash = glossaryHash
    saveState(state)
  } else if (promptOrGlossaryChanged) {
    console.log(
      'Note: this was a filtered run after a prompt/glossary change — other locales/namespaces stay stale until a full `npm run translate`.',
    )
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
