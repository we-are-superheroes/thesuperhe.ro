import { describe, expect, it } from 'vitest'
import {
  type Tree,
  sha1,
  stateKey,
  flattenTree,
  unflattenLike,
  diffNamespace,
  batchKeys,
  validateBatch,
} from '../scripts/translate-lib'

/* ================================================================
   Pure helpers behind the translation pipeline (scripts/translate.ts
   and scripts/translate-check.ts). See docs/i18n-plan.md phase 7.
   ================================================================ */

const tree: Tree = {
  title: 'Hello',
  header: {
    editButton: 'Edit',
    nested: { deep: 'Deep {name}' },
  },
  count: '{n, plural, one {# item} other {# items}}',
}

describe('flattenTree / unflattenLike', () => {
  it('flattens nested catalogs into dot paths, preserving order', () => {
    expect(flattenTree(tree)).toEqual({
      title: 'Hello',
      'header.editButton': 'Edit',
      'header.nested.deep': 'Deep {name}',
      count: '{n, plural, one {# item} other {# items}}',
    })
    expect(Object.keys(flattenTree(tree))).toEqual([
      'title',
      'header.editButton',
      'header.nested.deep',
      'count',
    ])
  })

  it('round-trips through unflattenLike with en ordering', () => {
    const flat = flattenTree(tree)
    expect(unflattenLike(flat, tree)).toEqual(tree)
    // Order follows the reference tree even if the flat map is shuffled.
    const shuffled = Object.fromEntries(Object.entries(flat).reverse())
    expect(JSON.stringify(unflattenLike(shuffled, tree))).toBe(JSON.stringify(tree))
  })

  it('throws when a reference leaf is missing from the flat map', () => {
    expect(() => unflattenLike({ title: 'Hallo' }, tree)).toThrow(/header\.editButton/)
  })
})

describe('diffNamespace', () => {
  const enFlat = { a: 'Alpha', b: 'Beta', c: 'Gamma' }
  const freshHashes = {
    [stateKey('ns', 'a')]: sha1('Alpha'),
    [stateKey('ns', 'b')]: sha1('OLD Beta'), // English changed since translation
    [stateKey('ns', 'zombie')]: sha1('Gone'), // key deleted from en
  }
  const targetFlat = { a: 'Alpha-fr', b: 'Beta-fr', ghost: 'Ghost-fr' }

  it('classifies stale, missing and orphan keys', () => {
    const work = diffNamespace('ns', enFlat, freshHashes, targetFlat)
    expect(work.stale).toEqual(['b']) // hash mismatch
    expect(work.missing).toEqual(['c']) // never translated
    expect(work.orphans).toEqual(['ghost', 'zombie']) // file + state orphans
  })

  it('treats a key missing from the target file as missing even when hashed', () => {
    const work = diffNamespace('ns', enFlat, freshHashes, { b: 'Beta-fr' })
    expect(work.missing).toEqual(expect.arrayContaining(['a', 'c']))
  })

  it('allStale marks every translated key stale (prompt/glossary bump)', () => {
    const work = diffNamespace('ns', enFlat, freshHashes, targetFlat, true)
    expect(work.stale.sort()).toEqual(['a', 'b'])
    expect(work.missing).toEqual(['c'])
  })

  it('ignores hand-edits to the target values (English side only)', () => {
    const hashes = { [stateKey('ns', 'a')]: sha1('Alpha') }
    const work = diffNamespace('ns', { a: 'Alpha' }, hashes, { a: 'Hand-tuned by the owner' })
    expect(work).toEqual({ stale: [], missing: [], orphans: [] })
  })

  it('reports everything missing on a first run (no state, no file)', () => {
    const work = diffNamespace('ns', enFlat, {}, {})
    expect(work).toEqual({ stale: [], missing: ['a', 'b', 'c'], orphans: [] })
  })
})

describe('batchKeys', () => {
  it('caps batches by key count', () => {
    const keys = Array.from({ length: 130 }, (_, i) => `k${i}`)
    const enFlat = Object.fromEntries(keys.map((k) => [k, 'short']))
    const batches = batchKeys(keys, enFlat, 60, 100000)
    expect(batches.map((b) => b.length)).toEqual([60, 60, 10])
    expect(batches.flat()).toEqual(keys)
  })

  it('caps batches by source size for long-form namespaces', () => {
    const enFlat = { a: 'x'.repeat(5000), b: 'y'.repeat(5000), c: 'z' }
    const batches = batchKeys(['a', 'b', 'c'], enFlat, 60, 8000)
    expect(batches).toEqual([['a'], ['b', 'c']])
  })
})

describe('validateBatch', () => {
  const source = {
    greet: 'Hello {name}',
    rich: 'Join <em>now</em>',
    count: '{n, plural, one {# step} other {# steps}}',
  }

  it('accepts a faithful translation', () => {
    const ok = {
      greet: 'Bonjour {name}',
      rich: 'Rejoins <em>maintenant</em>',
      count: '{n, plural, one {# étape} other {# étapes}}',
    }
    expect(validateBatch(source, ok, 'fr')).toEqual([])
  })

  it('rejects non-objects, key drift, and empty strings', () => {
    expect(validateBatch(source, 'nope', 'fr')).toEqual(['response is not a JSON object'])
    const drifted = { greet: 'Bonjour {name}', extra: 'x' }
    const errors = validateBatch(source, drifted, 'fr')
    expect(errors.join('\n')).toMatch(/missing key "rich"/)
    expect(errors.join('\n')).toMatch(/unexpected key "extra"/)
    expect(
      validateBatch({ greet: 'Hi' }, { greet: '   ' }, 'fr').join('\n'),
    ).toMatch(/empty translation/)
  })

  it('rejects placeholder and tag drift', () => {
    const bad = {
      greet: 'Bonjour {nom}',
      rich: 'Rejoins <strong>maintenant</strong>',
      count: '{n, plural, one {# étape} other {# étapes}}',
    }
    const errors = validateBatch(source, bad, 'fr').join('\n')
    expect(errors).toMatch(/missing placeholder \{name\}/)
    expect(errors).toMatch(/unknown placeholder \{nom\}/)
    expect(errors).toMatch(/missing tag <em>/)
    expect(errors).toMatch(/unknown tag <strong>/)
  })

  it('rejects a lost plural skeleton', () => {
    const bad = { ...sourceAsFr(), count: '{n} étapes' }
    expect(validateBatch(source, bad, 'fr').join('\n')).toMatch(/plural on \{n\} was lost/)
  })

  it('requires one/few/many/other for ru and uk plurals', () => {
    const incomplete = {
      ...sourceAsFr(),
      count: '{n, plural, one {# шаг} other {# шагов}}',
    }
    const errors = validateBatch(source, incomplete, 'ru').join('\n')
    expect(errors).toMatch(/"few"/)
    expect(errors).toMatch(/"many"/)

    const complete = {
      ...sourceAsFr(),
      count: '{n, plural, one {# шаг} few {# шага} many {# шагов} other {# шага}}',
    }
    expect(validateBatch(source, complete, 'ru')).toEqual([])

    // =1 may stand in for "one".
    const exactOne = {
      ...sourceAsFr(),
      count: '{n, plural, =1 {один шаг} few {# шага} many {# шагов} other {# шага}}',
    }
    expect(validateBatch(source, exactOne, 'ru')).toEqual([])
  })

  function sourceAsFr() {
    return { greet: 'Bonjour {name}', rich: 'Rejoins <em>ici</em>' }
  }
})
