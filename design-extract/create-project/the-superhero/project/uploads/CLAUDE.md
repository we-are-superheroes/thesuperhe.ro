# CLAUDE.md — Climate Collaboration Platform

This file gives you everything you need to work on this codebase. Read it fully before writing any code.

---

## What we're building

A web platform that connects people who want to contribute to climate and sustainability projects. The core problem: many people care about the climate crisis and have useful skills, but lack ideas, collaborators, or time to act alone. This platform lowers the barrier to contributing by acting as a force multiplier for individual effort.

Key differentiators from existing platforms (DemocracyLab, Work on Climate, Taproot, Catchafire):
- Open to **all skills**, not just tech workers
- Supports **individual project leaders**, not just organisations
- **Blueprints** — reusable project templates anyone can spin up (e.g. "Repair Café", "Community Solar Buying Group")
- **Project steps** — granular to-do items within projects, each with their own skill requirements, so people with limited time can contribute to a single step rather than a whole project
- **Climate-specific** focus throughout

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Clerk |
| Hosting | Vercel |
| Storage | Supabase Storage (avatars, project images) |
| Email | Resend |
| Styling | Tailwind CSS |
| UI components | shadcn/ui |

---

## Project structure

```
/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Clerk auth routes
│   ├── (marketing)/            # Public-facing pages
│   ├── (platform)/             # Authenticated app
│   │   ├── dashboard/
│   │   ├── projects/
│   │   ├── blueprints/
│   │   ├── organisations/
│   │   └── profile/
│   └── api/                    # API route handlers
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   └── [feature]/              # Feature-specific components
├── lib/
│   ├── db.ts                   # Prisma client singleton
│   ├── auth.ts                 # Clerk helpers
│   └── utils.ts                # Shared utilities
├── prisma/
│   ├── schema.prisma           # Source of truth for data model
│   ├── migrations/
│   └── seed.ts                 # Reference data (skills, project types)
└── types/
    └── index.ts                # Shared TypeScript types
```

---

## Data model

The full schema is in `prisma/schema.prisma`. Here is a conceptual summary.

### Core entities

**`users`** — platform members. Linked to skills via `user_skills` junction table.

**`skills`** — controlled vocabulary of skills (e.g. "Grant writing", "Web development", "Community organising"). Has a `category` field (Technical, Legal, Creative, Community, etc.).

**`user_skills`** — junction between users and skills. Has `proficiency` (beginner / intermediate / expert) and `is_seeking` (whether the user wants to apply this skill on projects — a burnt-out accountant may not want to do finance work).

**`organisations`** — NGOs, universities, corporates, community groups. Users join via `user_organisations`.

**`project_types`** — reference taxonomy of project categories (Community Energy, Urban Rewilding, Policy Advocacy, Education, etc.).

**`blueprints`** — reusable project templates. Any user can create one. Contains a set of `blueprint_steps`. When a project is created from a blueprint, steps are copied into `project_steps`. Tracks `reuse_count`.

**`blueprint_steps`** — the template-level to-do list. Each step has `order`, `estimated_hrs`, and required skills via `step_skills`.

**`projects`** — live project instances. Optionally linked to an organisation and/or a blueprint. Has `status` (draft / active / completed / archived), `location`, `remote_ok`, and `time_commitment_hrs`.

**`project_steps`** — live steps on a specific project. Copied from blueprint steps on instantiation (retains `blueprint_step_id` reference) or created ad hoc. Has `status` (not_started / in_progress / needs_help / done / skipped), `assigned_to`, and `due_date`. The `needs_help` status is important — it surfaces steps to potential contributors.

**`step_skills`** — junction between skills and steps. Used by both `blueprint_steps` and `project_steps` (one of the two FKs is always null). Has an optional `context` field for nuance (e.g. "intermediate level sufficient").

**`contributions`** — links a user to a project and optionally a specific step. This is how volunteers join. Step-level contributions support the low-time-commitment use case. Has `role` (lead / contributor / advisor / observer) and `hours_contributed`.

### Key relationships

```
users ──< user_skills >── skills
users ──< user_organisations >── organisations
organisations ──< projects
blueprints ──< blueprint_steps >── step_skills >── skills
blueprints ──< projects
blueprint_steps ──< project_steps
projects ──< project_steps >── step_skills >── skills
projects ──< contributions
project_steps ──< contributions
users ──< contributions
```

### Enums

```typescript
UserRole:           member | admin
OrgType:            ngo | academic | corporate | government | community | other
OrgRole:            owner | admin | member
Proficiency:        beginner | intermediate | expert
ProjectStatus:      draft | active | completed | archived
StepStatus:         not_started | in_progress | needs_help | done | skipped
ContributionStatus: pending | active | completed | withdrawn
ContributionRole:   lead | contributor | advisor | observer
```

---

## Coding conventions

### General
- Always use TypeScript. Enable strict mode. No `any`.
- Use `async/await`, never `.then()` chains.
- Prefer named exports over default exports, except for Next.js pages and layouts.
- Co-locate types with the code that uses them. Shared types go in `types/index.ts`.
- Never hardcode strings that should be env vars.

### Next.js / React
- Use the App Router. No Pages Router.
- Use Server Components by default. Only add `"use client"` when genuinely needed (event handlers, browser APIs, hooks).
- Data fetching happens in Server Components or Server Actions. Never `useEffect` for data fetching.
- Use Server Actions for mutations (form submissions, updates). Name them with the `action` suffix: `createProjectAction`, `joinStepAction`.
- Keep route handlers in `app/api/` thin — delegate logic to service functions in `lib/`.

### Prisma
- Use the singleton client in `lib/db.ts`:
  ```typescript
  import { PrismaClient } from '@prisma/client'

  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

  export const db = globalForPrisma.prisma ?? new PrismaClient()

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
  ```
- Always import `db` from `lib/db`, never instantiate `PrismaClient` directly elsewhere.
- Use `$transaction` for any operation that touches multiple tables atomically. The most important case: instantiating a project from a blueprint (must copy all steps and their skills in one transaction).
- Never expose raw Prisma errors to the client. Catch and map them.
- Select only the fields you need. Avoid `findMany` with no `select` or `include` on large tables.

### Auth
- Use Clerk for authentication. The current user is available via `auth()` (server) or `useUser()` (client).
- Always check auth at the start of Server Actions and API routes.
- The Clerk `userId` maps to `users.id` in our database. Ensure the user record exists in our DB on first sign-in (use a Clerk webhook handler at `app/api/webhooks/clerk/route.ts`).

### Error handling
- Server Actions should return a typed result: `{ success: true, data: T } | { success: false, error: string }`. Never throw from a Server Action that will be called from a form.
- Use `try/catch` around all database calls in Server Actions.

### Styling
- Tailwind CSS only. No inline styles, no CSS modules.
- Use shadcn/ui components as the base. Extend, don't override.
- Mobile-first responsive design throughout.

---

## Environment variables

```bash
# Database
DATABASE_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Supabase (storage only)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Resend
RESEND_API_KEY=

# Clerk webhook secret (for syncing users to DB)
CLERK_WEBHOOK_SECRET=
```

---

## Key product decisions

- **Anyone can create a project** — not gated behind having an organisation. A project can optionally be linked to an org.
- **Blueprints are public** — any user can browse and instantiate any blueprint.
- **`needs_help` step status** is a first-class signal. The platform should actively surface steps in this state to users whose skills match.
- **`is_seeking` on user_skills** matters for matching — always filter by this when suggesting contributors.
- **Time commitment is a filter** — `time_commitment_hrs` on projects and `estimated_hrs` on steps are key to the low-barrier-to-entry value proposition. Always surface these in the UI.
- **Contributions can be step-level** — a user can contribute to a single project step without joining the whole project. This is intentional and important.

---

## MVP feature priorities

Build in this order:

1. **Auth + onboarding** — sign up, create profile, add skills (with proficiency + is_seeking)
2. **Skills + project types seed data** — `prisma/seed.ts` with the reference tables populated
3. **Browse projects** — list view with filters (project type, location, remote, skills needed, time commitment)
4. **Project detail** — show project info, steps, required skills per step, current contributors
5. **Create project** — from scratch or from a blueprint
6. **Blueprints** — browse, view, instantiate (triggers step copy transaction)
7. **Join a project / step** — contribution flow
8. **User profile** — show skills, contributions, projects created
9. **Step management** — update status, assign contributors, mark complete

---

## Important implementation notes

### Instantiating a project from a blueprint

This must be a single `$transaction`:
1. Create the `Project` record with `blueprintId` set
2. Fetch all `BlueprintStep` records for the blueprint (including their `StepSkill` relations)
3. For each blueprint step, create a `ProjectStep` with `blueprintStepId` pointing back to the source
4. For each blueprint step's skills, create corresponding `StepSkill` records on the new project step

### `StepSkill` null constraint

`StepSkill` has two nullable FKs: `blueprintStepId` and `projectStepId`. Exactly one should be non-null at all times. Enforce this in application code (not yet at DB level). When creating step skills, always set exactly one of the two.

### `Contribution` uniqueness with nullable FK

The `@@unique([userId, projectId, projectStepId])` constraint in Prisma doesn't fully prevent duplicate project-level contributions (where `projectStepId` is null) because Postgres treats `null != null` in unique indexes. Before creating a project-level contribution (no step), check manually:
```typescript
const existing = await db.contribution.findFirst({
  where: { userId, projectId, projectStepId: null }
})
if (existing) throw new Error('Already contributing to this project')
```

### Clerk webhook → DB user sync

On `user.created` event from Clerk, create a corresponding `User` record in our database. On `user.updated`, sync `name`, `email`, `avatarUrl`. Use `svix` to verify the webhook signature.
