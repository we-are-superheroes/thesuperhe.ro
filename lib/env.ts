import 'server-only'

/* ================================================================
   Environment validation — fail fast with a clear message instead
   of a cryptic runtime error on first use. Import `env` (or call
   requireEnv) from server modules that need these values.

   NEXT_PUBLIC_* values are inlined at build time by Next and read
   directly where used; only server-side secrets are validated here.
   ================================================================ */

const REQUIRED = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
] as const

type RequiredKey = (typeof REQUIRED)[number]

export function requireEnv(name: RequiredKey | string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `See .env.example for the full list and DEPLOYMENT.md for where each value comes from.`,
    )
  }
  return value
}

/** Validated at module load — importing this file checks the core set. */
export const env = Object.freeze(
  Object.fromEntries(REQUIRED.map((k) => [k, requireEnv(k)])) as Record<
    RequiredKey,
    string
  >,
)
