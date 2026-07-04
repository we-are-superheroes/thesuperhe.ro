# The Superhero

Live at [thesuperhe.ro](https://thesuperhe.ro).

Lots of people care about the climate and have useful skills. What they usually don't have is a project idea, collaborators, or the time to run something on their own. The Superhero tries to fix that: it connects people who want to contribute with local climate and sustainability projects that need them.

A few ideas we care about:

- **Any skill counts.** Not just tech workers. If you can do bookkeeping, drive a van, translate a flyer or talk to a council, there's a project that needs you.
- **Blueprints.** Proven project plans — repair cafés, pocket forests, solar buying groups — that anyone can fork and adapt to their own town. Steal shamelessly. Blueprints can have translated variants (we currently have French and German ones), so a good plan doesn't stop at a language border.
- **Steps, not just projects.** Every project is broken into small steps with their own skill needs and time estimates. You don't have to join a whole project; you can pick up one step that fits into an evening.
- **"Needs help" is a first-class signal.** Steps and projects can flag that they're stuck, and we surface those to people whose skills match.

## Stack

Next.js 16 (App Router), TypeScript, Prisma 7 on Postgres (Supabase), Clerk for auth, Tailwind v4 with hand-rolled components, Vitest for tests, hosted on Vercel. Deployment details are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Running it locally

```bash
npm install
npx prisma generate
npm run dev
```

You'll need a `.env.local` — see [.env.example](./.env.example) for the variable names. Database, Clerk keys and Supabase storage all need real values; ask if you don't have them.

Checks:

```bash
npx tsc --noEmit   # types
npx eslint .       # lint (should be zero problems)
npm test           # unit tests
```

CI runs all three plus a build on every push.

## Branches and environments

- `staging` → the preview environment (its own Supabase project and Clerk dev instance). This is where day-to-day work lands.
- `main` → production at thesuperhe.ro. We merge staging into main by PR when staging looks right.

Don't delete the staging branch after merging — it *is* the preview environment.

## Migrations

One quirk worth knowing: we don't use `prisma migrate dev`. Migrations are hand-written SQL in `prisma/migrations/`, applied by `npm run db:apply` (an idempotent runner that works over the pooled connection). A GitHub Action applies them on push — staging branch to the staging database, main to production.

For destructive changes, ship the code first and land the `DROP`/`ALTER` in a follow-up commit once the deploy is live. We learned this the fun way.

## Seed data

- `prisma/seed.ts` + `prisma/seed-skills-expanded.ts` — skills and project types (idempotent).
- `prisma/seed-blueprints.ts` — the blueprint catalogue from `prisma/seed-data/`, including the French and German variants (idempotent).
- `prisma/seed-projects.ts` — a few sample projects (create-only, so don't run it twice).

The "Seed database" workflow in GitHub Actions runs these against staging or production without the connection string ever leaving the repo secrets.
