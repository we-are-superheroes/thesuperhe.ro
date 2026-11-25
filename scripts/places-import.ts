import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { parseResearchRecord, type ResearchRecord } from '../lib/places-import'

/* ================================================================
   Import researched places into the map. The research itself lives in
   its own repository (superhero-map-research); its README describes the
   record format. This script is the only part that belongs here,
   because every place must go in through applyProposal().

     npm run places:import -- ../superhero-map-research/out/geneve --as you@example.org
         Dry run: checks every record and says what would happen.

     npm run places:import -- ../superhero-map-research/out/geneve --as you@example.org --write
         verified records  → published on the map
         flagged records   → the review queue at /admin/places, with the
                             reasons in the note
         rejected records  → left out

     npm run places:import -- --export-known ../superhero-map-research/known-places.json
         Writes the names and positions of places already on the map or
         proposed before, so the research can leave them out.

   Works on the database DATABASE_URL points at (.env.local wins over
   .env — locally that is staging). `--as` is the e-mail of a curator
   or admin in that database; the places are recorded under that name.

   Safe to run again: a record with the same name as a place close by that
   is already on the map, or a proposal already made (waiting or rejected),
   is skipped. A similar name close by sends the record to the review
   queue. A different name is never held back, however close it is. Every
   place still goes in through applyProposal(), like any other change.
   ================================================================ */

loadEnv({ path: ['.env.local', '.env'], quiet: true })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(path, entry.name)
      if (entry.isDirectory()) return jsonFiles(full)
      // Files starting with "_" are run summaries, not places.
      return entry.name.endsWith('.json') && !entry.name.startsWith('_') ? [full] : []
    })
    .sort()
}

function readRecord(file: string): ResearchRecord | string {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return 'not valid JSON'
  }
  return parseResearchRecord(raw)
}

/** Which database this is, without the password: "postgres.abcd@host". */
function describeDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return `${url.username}@${url.hostname}`
  } catch {
    return 'unknown (DATABASE_URL is not a URL)'
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const write = argv.includes('--write')
  const asIndex = argv.indexOf('--as')
  const email = asIndex >= 0 ? argv[asIndex + 1] : undefined
  const exportIndex = argv.indexOf('--export-known')
  const exportPath = exportIndex >= 0 ? argv[exportIndex + 1] : undefined
  const paths = argv.filter(
    (arg, i) => !arg.startsWith('--') && (asIndex < 0 || i !== asIndex + 1) && (exportIndex < 0 || i !== exportIndex + 1),
  )
  const usage =
    'Usage: places:import -- <folder or file> --as <curator e-mail> [--write]\n' +
    '       places:import -- --export-known <file>'
  if (exportIndex >= 0 ? !exportPath || paths.length !== 0 : paths.length !== 1 || !email) {
    throw new Error(usage)
  }

  // Imported after the env is loaded: lib/db reads DATABASE_URL on import.
  const { db } = await import('../lib/db')
  const { applyProposal, ApplyError, isCuratorRole } = await import('../lib/places')
  const { PLACE_LIMITS, isValidLatLng, samePlaceMatch, validatePlaceInput } = await import(
    '../lib/places-shared'
  )

  console.log(`Database: ${describeDatabase()}`)

  // Everything a record could be a duplicate of: places (hidden ones too, so
  // a removed place does not come back) and "new" proposals already made.
  const known: Array<{ name: string; lat: number; lng: number; what: string }> = []
  const places = await db.place.findMany({
    select: { name: true, city: true, latitude: true, longitude: true },
    take: 20000,
  })
  const cities = new Map<string, string | null>()
  for (const p of places) {
    known.push({ name: p.name, lat: p.latitude, lng: p.longitude, what: 'on the map' })
    cities.set(p.name, p.city)
  }
  const proposals = await db.placeProposal.findMany({
    where: { kind: 'new', status: { in: ['pending', 'rejected'] } },
    select: { payload: true, status: true },
    take: 20000,
  })
  for (const proposal of proposals) {
    const p = proposal.payload
    if (isRecord(p) && typeof p.name === 'string' && isValidLatLng(p.latitude, p.longitude)) {
      known.push({
        name: p.name,
        lat: p.latitude as number,
        lng: p.longitude as number,
        what: proposal.status === 'pending' ? 'in the review queue' : 'rejected before',
      })
    }
  }

  if (exportPath) {
    const out = {
      exportedOn: new Date().toISOString().slice(0, 10),
      places: known.map((k) => ({ name: k.name, city: cities.get(k.name) ?? null, lat: k.lat, lng: k.lng, state: k.what })),
    }
    writeFileSync(exportPath, JSON.stringify(out, null, 2))
    console.log(`Wrote ${out.places.length} known place(s) to ${exportPath}`)
    return
  }

  const user = await db.user.findFirst({ where: { email }, select: { id: true, role: true } })
  if (!user) throw new Error(`No user with the e-mail ${email} in this database.`)
  if (!isCuratorRole(user.role)) throw new Error(`${email} is not a curator or admin.`)
  console.log(write ? 'Mode: WRITE' : 'Mode: dry run (add --write to save)')

  const counts = { published: 0, queued: 0, skipped: 0, rejected: 0, problems: 0 }
  for (const file of jsonFiles(paths[0])) {
    const record = readRecord(file)
    if (typeof record === 'string') {
      counts.problems++
      console.log(`  PROBLEM   ${file}: ${record}`)
      continue
    }
    if (record.status === 'rejected') {
      counts.rejected++
      continue
    }
    const checked = validatePlaceInput(record.place)
    if (!checked.ok) {
      counts.problems++
      console.log(`  PROBLEM   ${file}: ${checked.error.key} ${JSON.stringify(checked.error.params ?? {})}`)
      continue
    }
    const data = checked.data
    const here = { name: data.name, lat: data.latitude, lng: data.longitude }
    const duplicate = known.find((other) => samePlaceMatch(here, other) === 'same')
    if (duplicate) {
      counts.skipped++
      console.log(`  skip      ${data.name}: looks like "${duplicate.name}" (${duplicate.what})`)
      continue
    }

    // A similar name close by may be the same place or a neighbour: a
    // curator decides, so the record is never published straight away.
    const similar = known.find((other) => samePlaceMatch(here, other) === 'maybe')
    const publish = record.status === 'verified' && !similar
    const note = [
      `Map research${record.city ? `, ${record.city}` : ''}${record.checkedOn ? `, checked ${record.checkedOn}` : ''}.`,
      similar ? `May be the same place as "${similar.name}" (${similar.what}).` : null,
      record.flags.length > 0 ? `Needs a check: ${record.flags.join('; ')}.` : null,
      record.sources.length > 0 ? `Sources: ${record.sources.join(' ')}` : null,
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, PLACE_LIMITS.proposalNote)

    if (write) {
      try {
        await db.$transaction(async (tx) => {
          const proposal = await tx.placeProposal.create({
            data: {
              kind: 'new',
              payload: JSON.parse(JSON.stringify(data)),
              note,
              proposerId: user.id,
            },
            select: { id: true, kind: true, placeId: true, payload: true },
          })
          if (!publish) return
          const result = await applyProposal(tx, proposal, user.id, { createdById: user.id })
          if (!result.ok) throw new ApplyError(result)
        })
      } catch (e) {
        counts.problems++
        console.log(`  PROBLEM   ${data.name}: ${e instanceof Error ? e.message : 'could not be saved'}`)
        continue
      }
    }
    known.push({ ...here, what: 'earlier in this import' })
    if (publish) counts.published++
    else counts.queued++
    console.log(
      `  ${publish ? 'publish  ' : 'queue    '} ${data.name}${data.city ? ` (${data.city})` : ''}` +
        (similar ? `: may be the same as "${similar.name}" (${similar.what})` : ''),
    )
  }

  const verb = write ? '' : 'would be '
  console.log(
    `Done: ${counts.published} ${verb}published, ${counts.queued} ${verb}sent to the review queue, ` +
      `${counts.skipped} already known, ${counts.rejected} rejected by the research, ${counts.problems} with problems.`,
  )
  if (write && counts.published > 0) {
    console.log('Next: `npm run translate:places` translates the new places.')
  }
  if (counts.problems > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => process.exit())
