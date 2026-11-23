import { config as loadEnv } from 'dotenv'

/* ================================================================
   Translate map places that are missing a translation or whose text
   changed since the last one. Places are normally translated right
   after they are saved (lib/place-translator.ts); this script fills
   in existing places and anything a failed call left behind.

     npm run translate:places              missing and out-of-date only
     npm run translate:places -- --all     translate everything again
     npm run translate:places -- --dry-run count the places, no API calls

   Works on the database DATABASE_URL points at (.env.local wins over
   .env) and needs ANTHROPIC_API_KEY. Safe to run again at any time.
   ================================================================ */

loadEnv({ path: ['.env.local', '.env'], quiet: true })

async function main() {
  const args = new Set(process.argv.slice(2))
  for (const arg of args) {
    if (arg !== '--all' && arg !== '--dry-run') throw new Error(`unknown argument "${arg}"`)
  }

  // Imported after the env is loaded: lib/db reads DATABASE_URL on import.
  const { db } = await import('../lib/db')
  const { publicPlacesWhere } = await import('../lib/places')
  const { placeTranslationEnabled, translatePlace } = await import('../lib/place-translator')

  const places = await db.place.findMany({
    where: publicPlacesWhere(),
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`${places.length} public place(s).`)
  if (args.has('--dry-run')) return
  if (!placeTranslationEnabled()) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local (or export it) and re-run.')
  }

  let translated = 0
  let failed = 0
  for (const place of places) {
    const outcome = await translatePlace(place.id, { force: args.has('--all') })
    translated += outcome.translated.length
    failed += outcome.failed.length
    if (outcome.translated.length > 0 || outcome.failed.length > 0) {
      console.log(
        `  ${place.slug}: translated ${outcome.translated.join(', ') || 'none'}` +
          (outcome.failed.length > 0 ? ` — FAILED ${outcome.failed.join(', ')}` : ''),
      )
    }
  }
  console.log(`Done: ${translated} translation(s) written, ${failed} failed.`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => process.exit())
