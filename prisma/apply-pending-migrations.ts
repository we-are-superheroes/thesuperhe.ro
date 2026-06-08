import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Apply any migrations Prisma migrate hasn't yet recorded in
 * `_prisma_migrations`, using the pooled connection (the only one
 * reachable from this network). Idempotent: previously-applied
 * migrations are skipped.
 *
 *   npm run db:apply
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const db = new PrismaClient({ adapter })

  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
  const allMigrations = readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort()

  // Bootstrap the migrations table if Prisma migrate hasn't run yet on
  // this database. We never created it via `prisma migrate` because the
  // direct DB port isn't reachable from this network.
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `)

  const rows = await db.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
  )
  const applied = new Set(rows.map((r) => r.migration_name))

  // Does the base schema already exist? The original dev DB had `_init`
  // applied manually before this runner existed, so there we baseline-record
  // it (mark applied without re-running). But on a truly FRESH database
  // (e.g. a new prod/staging Supabase project) the schema isn't there yet —
  // baselining would skip table creation and every later migration would
  // fail. So only baseline when the schema is actually present; otherwise
  // let `_init` run normally in the apply loop below.
  const schemaProbe = await db.$queryRawUnsafe<Array<{ regclass: string | null }>>(
    `SELECT to_regclass('public.users')::text AS regclass`,
  )
  const schemaExists = !!schemaProbe[0]?.regclass

  for (const name of allMigrations) {
    if (name.endsWith('_init') && !applied.has(name) && schemaExists) {
      console.log(`  baseline ${name} (schema already present)`)
      await db.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1, $2, $3, NOW(), NOW(), 1)`,
        crypto.randomUUID(),
        'baseline',
        name,
      )
      applied.add(name)
    }
  }

  for (const name of allMigrations) {
    if (applied.has(name)) {
      console.log(`  skip ${name} (already applied)`)
      continue
    }
    const sqlPath = join(migrationsRoot, name, 'migration.sql')
    const sql = readFileSync(sqlPath, 'utf8')
    console.log(`  apply ${name}`)
    await db.$executeRawUnsafe(sql)
    await db.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1, $2, $3, NOW(), NOW(), 1)`,
      crypto.randomUUID(),
      'manual-apply',
      name,
    )
  }

  await db.$disconnect()
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
