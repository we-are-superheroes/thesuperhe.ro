/* ================================================================
   Reading one research record for `npm run places:import`
   (scripts/places-import.ts). The record format is described in the
   README of the superhero-map-research repository. Pure, so it is
   unit-tested; the `place` part is checked separately by
   validatePlaceInput().
   ================================================================ */

export interface ResearchRecord {
  status: 'verified' | 'flagged' | 'rejected'
  flags: string[]
  /** Untrusted until it has been through validatePlaceInput(). */
  place: unknown
  sources: string[]
  city: string | null
  checkedOn: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : []
}

/** The record, or a sentence saying why it is not one. */
export function parseResearchRecord(raw: unknown): ResearchRecord | string {
  if (!isRecord(raw)) return 'not a research record'
  const { status } = raw
  if (status !== 'verified' && status !== 'flagged' && status !== 'rejected') {
    return 'status must be verified, flagged or rejected'
  }
  const research = isRecord(raw.research) ? raw.research : {}
  return {
    status,
    flags: strings(raw.flags),
    place: raw.place,
    sources: strings(research.sources),
    city: typeof research.city === 'string' ? research.city : null,
    checkedOn: typeof research.checkedOn === 'string' ? research.checkedOn : null,
  }
}
