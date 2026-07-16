# Internationalisation: 8 languages, preference-based

## Context

The platform serves an international audience but every one of its ~2,800–3,400 user-facing strings is hardcoded English across ~59 files. Goal: full UI availability in **en (source), fr, de, es, it, ru, uk, pt**, with a workflow where the owner edits only the English text and translations regenerate automatically via a Claude-API script. Decisions locked in with the owner:

- **Preference-based locale, no URL prefixes** — URLs unchanged, no `app/[locale]/` restructure, no touching ~146 links. Locale = user's stored preference → cookie → Accept-Language → `en`.
- **Marketing homepage translated** (tone-carrying translation of the owner's copy; English stays the authored source).
- **Legal pages translated** as convenience copies + an "the English version prevails" disclaimer line.
- **Translation flow**: local `npm run translate` (Claude API, per-key change tracking) + a no-API `translate:check` CI gate so stale translations can't ship silently.
- User content (projects, blueprints, skills, updates, messages) stays as authored — out of scope. Blueprint language variants already cover content localisation.

Nothing user-visible changes until the final phase: the whole sweep ships English-identical behaviour, then the catalogs + switcher flip it on.

## Architecture

**Library: next-intl v4 in its documented "without i18n routing" mode.** It matches this design exactly (request-scoped locale resolver, not URL), and provides what we must not hand-roll: ICU MessageFormat (ru/uk need one/few/many plurals), `getTranslations()` in server components **and server actions**, `useTranslations()` in client components, `t.rich()` for inline-markup islands, type-safe keys, and per-provider message subsetting.

**Phase-0 compatibility gate (first task, before anything else):** verify next-intl supports Next 16.2.4 (`npm info next-intl peerDependencies`, release notes — v4.4+ claims Next 16; smoke-test one page + one server action with `npm run dev` and `npm run build`). **Fallback if it fails:** small in-house layer in `lib/i18n/` on `intl-messageformat` + React context + a server `getT()` helper — everything else in this plan is library-agnostic (+1 day).

### Wiring

- `lib/locale.ts` (server-only, React `cache()`): `SUPPORTED_LOCALES = ['en','fr','de','es','it','ru','uk','pt']`; resolver = signed-in `User.locale` → `cookies().get('superhero-locale')` (validated) → hand-rolled Accept-Language q-value parse (primary subtags, `pt-BR`→`pt`; no negotiator dep) → `'en'`.
- `i18n/request.ts`: `getRequestConfig` returning `{ locale, messages, timeZone: 'UTC' }`; registered via `createNextIntlPlugin` in [next.config.ts](next.config.ts). This makes `await getTranslations('errors')` work inside server actions with zero per-call locale plumbing (verify in the phase-0 smoke test).
- [app/layout.tsx](app/layout.tsx): async; `<html lang={locale}>`; `@clerk/localizations` mapped per locale onto `ClerkProvider localization=` (sign-in/up widgets in all 8 — frFR/deDE/esES/itIT/ruRU/ukUA/ptPT exist).
- Route-group layouts get `NextIntlClientProvider` with `pick(messages, GROUP_NAMESPACES)` so clients only ship what they use: (platform) = common,nav,errors,notifications,search + platform namespaces; (public) = common,nav,browse,project,blueprints,orgs,errors; (marketing) = common,nav; (legal) = none (fully server-rendered); (auth) = common,auth. Server components use `getTranslations` directly — no client cost.
- `global.d.ts` augments next-intl's `Messages` with `typeof` the merged en catalog → key typos become tsc errors (the load-bearing guardrail for the sweep).

### Catalogs

`messages/<locale>/<namespace>.json`. Namespaces:
`common, nav, auth, errors, meta, marketing, legal-privacy, legal-terms, browse, project, steps, blueprints, orgs, dashboard, skillMatches, mySteps, myProjects, messagesInbox, notifications, profile, search, users, admin`

Rules: camelCase hierarchical keys (`header.editButton`), never sentences-as-keys; **all count phrases become ICU plurals** (`{n, plural, one {…} other {…}}` — en needs one/other only; pipeline must emit one/few/many/other for ru/uk, test-enforced); enum labels as explicit per-value keys (`steps.status.needs_help`) mirroring today's constant maps; inline markup via tags in messages (`"…to <em>save the world</em>"`) rendered with `t.rich(...)` — no HTML in catalogs; `meta` namespace feeds `generateMetadata`.

## Implementation phases

Per-commit guardrails for every phase: replaced strings land in `messages/en/*.json` **in the same commit**; `tsc` + `eslint --max-warnings 0` + `vitest` green; visual check of touched pages; product vocabulary (step, blueprint, fork, claim a step, organisation, Needs help, Ask for help) verbatim from `messages/glossary.md`; English-only until phase 7.

### Phase 0 — Infrastructure (1–2 days)
Compat gate; install `next-intl`, `@clerk/localizations`, `@formatjs/icu-messageformat-parser` (dev); `lib/locale.ts`, `i18n/request.ts`, `i18n/messages.ts`, config plugin; root layout (lang + Clerk localisation); route-group providers; `global.d.ts`; seed `messages/en/common.json`; `tests/i18n-catalogs.test.ts` skeleton (per existing locale dir: parses, key-set = en, ICU compiles, placeholder/tag parity, ru/uk have one/few/many; flips to all-8-required in phase 7).

### Phase 1 — Preference plumbing (0.5–1 day)
Hand-written SQL migration `ALTER TABLE users ADD COLUMN locale text;` (nullable, own commit, `npm run db:apply` staging-first per house rules) + `User.locale` in [prisma/schema.prisma](prisma/schema.prisma) (Clerk webhook does NOT touch it, like `role`). `setLocaleAction`: validate; set cookie `superhero-locale` (1 yr, SameSite=Lax, not httpOnly, secure in prod); update `User.locale` when signed in. `LocaleSwitcher` (client, native language names from `lib/locales.ts` LANGUAGES filtered to the 8) → sidebar footer, public navbar, marketing footer, legal footer; calls action + `router.refresh()`. Privacy page gains one sentence about the cookie.

### Phase 2 — Shared patterns (1 day)
Locale-aware `fmtAgo(ms, locale, now?)` via `Intl.RelativeTimeFormat` in [lib/format.ts](lib/format.ts) (also replaces notifications-client's private `fmtTime`); sweep the ~7 `'en-GB'` toLocaleString call sites to the resolved locale (server-side formatting stays server-side — provider keeps server/client locale identical, no hydration risk); shared server+client libs export **keys not strings** (`orgTypeKey(type)` in [lib/org-utils.ts](lib/org-utils.ts)); establish the constant-map→`t` pattern on [components/platform/project-steps-list.tsx](components/platform/project-steps-list.tsx) (STATUS_LABEL etc. become `t(\`status.${value}\`)`) as the reference commit for all later batches.

### Phase 3 — Errors & validation (1–1.5 days)
`errors` namespace (`errors.<feature>.<case>`). [lib/validation.ts](lib/validation.ts) validators return descriptors `{ key, params? } | null` (stay pure); [lib/rate-limit.ts](lib/rate-limit.ts) same; each of the 13 actions files does `const t = await getTranslations('errors')` and formats — **`ServerActionResult` shape unchanged**, zero client churn. Rewrite `tests/validation.test.ts` to assert keys/params (flag in PR: intentional), plus a coupling test that every returnable key exists in `errors.json`.

### Phase 4 — Platform sweep (~11 batches; 4–6 days serial, ~2 with parallel subagents)
One namespace = one batch = one commit; batches are conflict-free (only shared files: provider pick lists + `global.d.ts`, append-only). Batches: `nav+shell` (sidebar, platform-shell, navbar, global-search) · `dashboard` · `browse` · `project` (page, tabs, updates, join controls, status badge, share) · `steps` (steps-list, time-log) · `blueprints` · `orgs` (org-page-client, organisations-client, request form, profile-orgs-section) · `profile`+`users` · `mySteps`+`myProjects`+`skillMatches` · `messagesInbox` · `admin` + create/edit forms. Includes aria-labels/titles/placeholders (`…AriaLabel`/`…Placeholder` key suffixes).

### Phase 5 — Notifications: read-time rendering (1–1.5 days)
No schema change (`data` Json exists). `notify()` gains `params` (stored in `data.params`); callers stop composing titles — `notify()` itself writes the stored English `title` via `renderNotificationTitleEn(type, params)` (new [lib/notification-messages.ts](lib/notification-messages.ts), formats `messages/en/notifications.json`; documents the per-type param contracts: actorName/projectTitle/stepTitle/blueprintTitle/orgName/skillName/senderName/count). `notifyMessageReceived` coalescing becomes one ICU plural message. [components/platform/notifications-client.tsx](components/platform/notifications-client.tsx) renders `data.params ? t(\`titles.${type}\`, params) : item.title` (guarded fallback for legacy rows/unknown types), relative time via the shared formatter.

### Phase 6 — Public, marketing, legal (2–3 days)
Public pages + `meta` namespace for generateMetadata. Marketing page via `t.rich` for the amber `<em>` islands — slowest file, translate-of-copy tone. Legal pages chunked into per-section keys + the "English version prevails" line added to the en source.

### Phase 7 — Pipeline + first translation (1–2 days)
- `messages/glossary.md`: per-language fixed renderings of product vocabulary ("The Superhero" never translated) + address forms — **de du, fr tu (flag: French UIs often prefer vous — owner call), es tú, it tu, pt você, ru вы (lowercase), uk ви (lowercase)**.
- `scripts/translate.ts` (`npm run translate`, `-- --all`, `--model` override): reads `messages/en/**`; per-key sha1 of the English value tracked per target locale in committed `messages/.translation-state.json` (+ `glossaryHash`, `promptVersion` — bumping either marks all stale); translates only stale/missing keys, prunes keys deleted from en, renames = delete+add; batches per namespace (~60 keys max), passing unchanged sibling translations as consistency context; Claude API via `@anthropic-ai/sdk`, default model `claude-opus-4-8` (full 7-locale run ≈ single-digit dollars), streaming, static system prompt + glossary marked with `cache_control` for prompt caching. Prompt: glossary, tone rules (plain language everywhere; marketing = carry the flair; legal = formal fidelity), hard ICU rules (placeholder/tag/skeleton preservation; ru/uk must emit one/few/many), JSON-only output. **Validation before write**: parse, key-set equality, ICU argument + tag parity via `@formatjs/icu-messageformat-parser`, plural categories per `Intl.PluralRules(locale)`; one retry with errors appended, then fail loudly.
- `scripts/translate-check.ts` (`npm run translate:check`, no API): recompute en hashes vs state + key-set comparison; exit 1 listing stale/missing/orphan keys. Add to [.github/workflows/ci.yml](.github/workflows/ci.yml) after eslint. Hand-edits to target files are allowed and not flagged (state tracks English-side changes only).
- Run `translate -- --all`; owner spot-reviews fr/de; flip the catalog test to require all 8 locales.

### Phase 8 — Verification & rollout (1 day)
Per-locale manual pass (dashboard, project page incl. plurals, notifications old + new rows, marketing, sign-in widgets); switcher round-trip: anonymous cookie → sign-in → preference persists to DB → other browser follows the account; Accept-Language first-visit check; bundle check of provider payloads (split platform namespaces per-page only if the measured payload warrants); `translate:check` red/green cycle by editing one en string.

## Out of scope (explicit)
User content; email (none exists); search API strings; country-name localisation (`lib/locales.ts` English country labels stay — `Intl.DisplayNames` has ICU-version hydration pitfalls; CLDR build-time generation is a noted follow-up). `LANGUAGES` labels are already endonyms.

## Risks
- **next-intl × Next 16**: gated first; in-house fallback contained (+1 day).
- **Server-action locale**: confirm `getRequestConfig` runs for action POSTs in the smoke test; fallback is explicit `resolveLocale()` per actions file (1 line each).
- **Bundle size**: bounded by per-group `pick()`; measured in phase 8.
- **Translation quality**: plural correctness is machine-enforced (pipeline validator + tests); tone is owner-reviewed (fr/de spot checks); glossary pins vocabulary.
- **tests/validation.test.ts** rewritten to keys — intentional, called out in the PR.
- Existing notification rows keep rendering via the stored-English fallback forever; no backfill.

## Verification (overall)
- Every phase: `npx tsc --noEmit && npx eslint . --max-warnings 0 && npx vitest run && npm run build`.
- `tests/i18n-catalogs.test.ts` green (all locales parse, complete, ICU-valid, plural-complete).
- `npm run translate:check` green in CI; deliberately break one hash locally to see it fail.
- Manual per-locale pass per phase 8, staging preview before any merge to main.

**Estimated total: ~12–17 working days serial; the phase-4 sweep parallelises well with subagents (one per namespace batch).**
