# Deployment — Vercel · Supabase · Clerk

Two cleanly isolated environments so staging work never touches real data or auth:

| Environment | URL | Branch | Supabase project | Clerk instance |
|---|---|---|---|---|
| **Production** | `thesuperhe.ro` | `main` | `thesuperhero-prod` | Production (`pk_live`/`sk_live`) |
| **Preview / staging** | `…-git-staging-<scope>.vercel.app` | `staging` | `thesuperhero-staging` | Development (`pk_test`/`sk_test`) |

> **Vercel domain note:** the bare `thesuperhe-ro.vercel.app` always serves the
> **production** deployment — it can't serve a different environment in the same
> project. Preview deployments get their own stable per-branch alias
> (`…-git-<branch>-<scope>.vercel.app`). Use the long-lived `staging` branch's
> alias as the staging URL (and the Clerk preview webhook target).

The repo is already deploy-ready: `build` runs `prisma generate && next build`;
`next.config.ts` derives the allowed `next/image` host from
`NEXT_PUBLIC_SUPABASE_URL` per build; the migration runner is idempotent.

Env var names: see [`.env.example`](./.env.example).

---

## 1. Supabase — two projects

For **each** of `thesuperhero-prod` and `thesuperhero-staging`:

1. Create the project (strong DB password; note the region).
2. **Settings → Database → Connection string → Transaction pooler** (host
   `…pooler.supabase.com`, port **6543**): this is `DATABASE_URL`. Append
   `?pgbouncer=true`. *(Optional `DIRECT_URL` = the 5432 direct/session URI; only
   needed for `prisma migrate dev` locally.)*
3. **Settings → API**: `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`; `service_role`
   secret → `SUPABASE_SERVICE_ROLE_KEY`.
4. **Storage → New bucket**: create `public-images` as **public** (it would
   auto-create on first upload, but pre-creating avoids surprises).
5. **Apply the schema** (see §4 — the GitHub Action does this on push, or run it
   once locally for a brand-new DB):
   ```bash
   DATABASE_URL='<pooled-url>' npx tsx prisma/apply-pending-migrations.ts
   ```
   The runner baselines `_init` and applies the rest.
6. **Admin grant (prod):** the `_user_role` migration sets `matthew@leve.tt` to
   admin if the row exists. If that account signs in *after* the migration runs on
   a fresh prod DB, re-run:
   ```sql
   UPDATE "users" SET "role" = 'admin' WHERE "email" = 'matthew@leve.tt';
   ```

---

## 2. Clerk — two instances

1. **Development instance** (existing): `pk_test…`/`sk_test…`. Works on `localhost`
   and any `*.vercel.app`. Use for local + Preview.
2. **Production instance**: create/enable it for `thesuperhe.ro`. `pk_live…`/
   `sk_live…`. Clerk lists ~5 CNAME records (clerk / accounts / clkmail / DKIM) to
   add at the registrar (§5).
3. In each instance, set paths to match the app: sign-in `/sign-in`, sign-up
   `/sign-up`, after-sign-in `/dashboard`, after-sign-up `/onboarding`.
4. **Webhooks** (Configure → Webhooks; subscribe to
   `user.created`, `user.updated`, `user.deleted`):
   - Production → `https://thesuperhe.ro/api/webhooks/clerk` → its **Signing
     Secret** becomes the **Production** `CLERK_WEBHOOK_SECRET`.
   - Development → `https://<staging-alias>.vercel.app/api/webhooks/clerk` → its
     secret becomes the **Preview** `CLERK_WEBHOOK_SECRET`.

---

## 3. Vercel

1. One project linked to the repo. **Settings → Git → Production Branch = `main`.**
   Build command `npm run build`; install `npm ci`.
2. Create a long-lived **`staging`** branch; its preview deploys are the staging
   environment.
3. **Settings → Environment Variables**, scoped per environment:

   | Variable | Production | Preview | Exposure |
   |---|---|---|---|
   | `DATABASE_URL` | prod pooled (6543) | staging pooled (6543) | server |
   | `DIRECT_URL` *(optional)* | prod direct (5432) | staging direct (5432) | server |
   | `NEXT_PUBLIC_SUPABASE_URL` | prod URL | staging URL | public |
   | `SUPABASE_SERVICE_ROLE_KEY` | prod service_role | staging service_role | server |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live…` | `pk_test…` | public |
   | `CLERK_SECRET_KEY` | `sk_live…` | `sk_test…` | server |
   | `CLERK_WEBHOOK_SECRET` | prod webhook secret | staging webhook secret | server |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | `/sign-in` | public |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | `/sign-up` | public |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` | `/dashboard` | public |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/onboarding` | `/onboarding` | public |

   `NEXT_PUBLIC_*` are baked at build time — redeploy after changing them.
4. **Settings → Domains**: add `thesuperhe.ro` (Production) and
   `www.thesuperhe.ro` (redirect to apex). Vercel shows the exact DNS records.

---

## 4. Migrations (GitHub Action)

`.github/workflows/migrate.yml` runs the idempotent runner on push:
`main` → prod DB, `staging` → staging DB.

Add **GitHub repo secrets** (Settings → Secrets and variables → Actions):
- `PROD_DATABASE_URL` — prod pooled (6543) connection string
- `STAGING_DATABASE_URL` — staging pooled (6543) connection string

### Migration / deploy ordering

The Action and the Vercel deploy both trigger on the same push and run in
parallel. Usually fine, but a migration that **adds** something the new code
immediately requires can briefly race the deploy. For risky schema changes, keep
them backward-compatible (expand → deploy → contract) or apply the migration
manually first (`DATABASE_URL=… npx tsx prisma/apply-pending-migrations.ts`).

---

## 5. DNS for `thesuperhe.ro` (registrar)

1. **Vercel**: add the exact records Vercel displays when you add the domain
   (typically apex `A @ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com`).
2. **Clerk production**: add the ~5 CNAMEs the production instance lists; Clerk
   verifies them before going live.
3. Email (Resend SPF/DKIM): not needed until email is wired up.

---

## 6. Verify end-to-end

**Staging**
1. Merge to `staging` → check the Action applied migrations to the **staging** DB
   (log shows `apply …` / `skip …`).
2. Open the staging alias → sign in (Clerk **dev**) → upload an avatar (lands in
   the **staging** `public-images` bucket) → confirm a `users` row in the
   **staging** DB (dev webhook fired).

**Production**
3. Merge `staging` → `main` → Action migrates the **prod** DB; Vercel deploys to
   `thesuperhe.ro`.
4. Visit `https://thesuperhe.ro` → sign in (Clerk **live**) → user syncs to the
   **prod** DB, image upload hits the **prod** bucket, and `/` redirects a
   signed-in user to `/dashboard`.
5. Confirm `matthew@leve.tt` sees admin delete controls on a project/blueprint;
   if not, re-run the admin `UPDATE` against the prod DB (§1.6).
