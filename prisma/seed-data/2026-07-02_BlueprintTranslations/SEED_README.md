# Blueprint Seed Data

Seed content for the platform: 50 sustainability project blueprints with steps and required skills.

## Files

| File | Rows | Purpose |
|---|---|---|
| `skills.csv` | 45 | Controlled skill vocabulary → seeds the `skills` table used by both `step_skills` and `user_skills` |
| `blueprints.csv` | 50 | One row per blueprint → `blueprints` table |
| `blueprint_steps.csv` | 332 | Ordered steps per blueprint → `blueprint_steps` table |
| `step_skills.csv` | 596 | Junction: step ↔ skill → `step_skills` table |
| `blueprint_translations.csv` | 100 | fr-CH and de-CH titles/summaries per blueprint |
| `blueprint_step_translations.csv` | 664 | fr-CH and de-CH titles/descriptions per step |
| `skill_translations.csv` | 90 | fr-CH and de-CH skill names |

All relationships use human-readable slugs as natural keys (`blueprint_slug`, `step_slug`, `skill_slug`). During seeding, insert parents first, keep a `slug → id` map in memory, and resolve foreign keys from it.

## Column notes

**blueprints.csv**
- `tier` (1–4): launch-readiness ranking. 1 = high appeal / easy to complete; 4 = high impact / complex, multi-skill.
- `appeal` (high/medium/low) and `effort` (low/medium/high): the two ranking dimensions, kept separate so the UI can filter on either.
- `category`: one of `waste-circular-economy`, `food-agriculture`, `biodiversity-nature`, `energy`, `mobility`, `built-environment`, `education-community`.
- `estimated_duration_weeks`: typical elapsed time from kickoff to completion.
- `step_count`, `total_estimated_hours`: denormalised convenience columns — recompute or drop if you prefer deriving them.

**blueprint_steps.csv**
- `step_order`: 1-based ordering within the blueprint.
- `estimated_hours`: effort for the step (not elapsed time) — feeds the low-time-commitment matching.
- `remote_friendly` (true/false): whether the step can be done without being physically present — a useful matching signal alongside skills.

**step_skills.csv** — plain junction, 1–3 skills per step, all guaranteed to exist in `skills.csv`.

**skills.csv**
- `category` groups skills for filtering/browsing (Coordination, Trades, Green Skills, Finance, etc.).
- `translation` is included but unused by any step — reserved for translation jobs on blueprint versions.

## Seeding sketch (Prisma)

```ts
// prisma/seed.ts — adapt field names to your schema.prisma
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

const load = (f: string) =>
  parse(readFileSync(`prisma/seed-data/${f}`), { columns: true });

// 1. skills
for (const s of load("skills.csv")) {
  await prisma.skill.upsert({
    where: { slug: s.skill_slug },
    update: {},
    create: { slug: s.skill_slug, name: s.name, category: s.category },
  });
}

// 2. blueprints, 3. steps (+ skills) — wrap each blueprint in a
// $transaction, consistent with the atomic-instantiation principle.
```

## Translations (fr-CH, de-CH)

The three `*_translations.csv` files are **pure translations of the canonical content** — layer 3 of the content model, not regional adaptations. Nothing operational differs (the canonical content is already Swiss-appropriate); only the language rendering changes.

- `language` uses BCP 47 codes: `fr-CH`, `de-CH`. German follows Swiss orthography (no ß).
- Seed order: canonical rows first, then translations, resolving `blueprint_slug` / `step_slug` against the already-inserted canonical rows.
- In the `BlueprintVersion` model: create these as versions with `versionType: translation`, `language` set, `region` inherited/null, and `parentVersion` pointing at the canonical version. Content hashes should be computed from the canonical source at seed time so staleness detection works when canonical content later changes.
- Step translations deliberately have **no independent structure** — no ordering, hours, remote flag, or skills. Those live only on the canonical step; translations override text fields at render time. This keeps the translation layer thin and prevents structural drift between languages.
- Skill names are translated in `skill_translations.csv`; skill slugs and categories stay canonical (categories can be translated in the UI layer later if needed).

Notes for the seeding session:
- These are **canonical** blueprint versions (no region, no language variant). When creating `BlueprintVersion` rows, set them as the canonical layer; regional adaptations and translations derive from them later.
- Cast `estimated_hours`, `tier`, `step_order`, `estimated_duration_weeks` to Int; `remote_friendly` to Boolean.
- If `appeal`/`effort`/`category` become enums in the schema, the CSV values are already enum-safe (lowercase, hyphenated).
