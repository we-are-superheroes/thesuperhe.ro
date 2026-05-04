import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // DIRECT_URL bypasses PgBouncer for migrations (required by Prisma)
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
