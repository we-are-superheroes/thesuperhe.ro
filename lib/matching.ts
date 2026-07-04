/* ================================================================
   Skill-match scoring — the engine behind /skill-matches.

   Ported from the Claude Design mockup's model (Skill Matches.html):
   - a needed skill you have (and are seeking)      → +34 each ("direct")
   - a needed skill in one of your skill categories → +14 each ("related")
   - remote item that runs in a language you speak  → +18
   - remote item in a language you don't speak      → −24
   - in-person item in your city                    → +18
   - in-person item elsewhere                       →  −6
   Scores clamp to 0–98; items with no direct AND no related skills
   don't match at all. "Strong matches" have ≥1 direct skill; the rest
   are "adjacent". Pure functions — unit-tested in tests/matching.test.ts.
   ================================================================ */

export interface MatchSkill {
  name: string
  category: string
}

export interface MatchMe {
  /** Names of the user's seeking skills (Languages category excluded). */
  skillNames: Set<string>
  /** Categories of those skills — powers "related" matching. */
  categories: Set<string>
  /** Lower-cased city token from the user's profile location, or null. */
  city: string | null
  /** ISO 639-1 codes derived from the user's Languages-category skills. */
  languages: Set<string>
}

export interface MatchItemInput {
  skills: MatchSkill[]
  remote: boolean
  /** The project's "City, Country" display string (or null). */
  location: string | null
  /** The project's ISO 639-1 working language (or null = unspecified). */
  language: string | null
}

export type LocNote =
  | { kind: 'near'; city: string }
  | { kind: 'far'; location: string | null }
  | { kind: 'remote-lang'; language: string }
  | { kind: 'remote-nolang'; language: string }
  | { kind: 'remote-unknown' }

export interface MatchAnalysis {
  direct: string[]
  related: string[]
  score: number
  locNote: LocNote
}

/** User-facing language skill name → ISO 639-1 code (projects store codes). */
export const LANGUAGE_SKILL_TO_ISO: Record<string, string> = {
  English: 'en',
  French: 'fr',
  German: 'de',
  Spanish: 'es',
  Italian: 'it',
  Mandarin: 'zh',
  Russian: 'ru',
  Ukrainian: 'uk',
  Arabic: 'ar',
  Polish: 'pl',
  Hindi: 'hi',
  Turkish: 'tr',
  Portuguese: 'pt',
}

/** First comma-segment of a location string, lower-cased: "Lausanne, CH" → "lausanne". */
export function cityOf(location: string | null | undefined): string | null {
  if (!location) return null
  const city = location.split(',')[0].trim().toLowerCase()
  return city || null
}

export function analyseMatch(item: MatchItemInput, me: MatchMe): MatchAnalysis | null {
  const direct: string[] = []
  const related: string[] = []
  for (const s of item.skills) {
    if (me.skillNames.has(s.name)) direct.push(s.name)
    else if (me.categories.has(s.category)) related.push(s.name)
  }
  if (direct.length === 0 && related.length === 0) return null

  let score = direct.length * 34 + related.length * 14
  let locNote: LocNote

  if (item.remote) {
    if (!item.language) {
      locNote = { kind: 'remote-unknown' }
    } else if (me.languages.has(item.language)) {
      score += 18
      locNote = { kind: 'remote-lang', language: item.language }
    } else {
      score -= 24
      locNote = { kind: 'remote-nolang', language: item.language }
    }
  } else {
    const itemCity = cityOf(item.location)
    if (itemCity && me.city && itemCity === me.city) {
      score += 18
      locNote = { kind: 'near', city: item.location!.split(',')[0].trim() }
    } else {
      score -= 6
      locNote = { kind: 'far', location: item.location }
    }
  }

  return { direct, related, score: Math.max(0, Math.min(98, score)), locNote }
}
