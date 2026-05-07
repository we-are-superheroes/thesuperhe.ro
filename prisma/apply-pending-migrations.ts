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

  // The init migration was applied manually before this runner existed —
  // the schema is already in place. If it's not yet recorded as applied,
  // baseline-record it so we don't try to re-run it.
  for (const name of allMigrations) {
    if (name.endsWith('_init') && !applied.has(name)) {
      console.log(`  baseline ${name} (assuming already applied)`)
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
