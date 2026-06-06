# Agent Hub

Personal hub for autonomous AI agents. See [agent-hub-plan.md](./agent-hub-plan.md) for the project plan.

## Structure

```
agent-hub/
├── apps/
│   └── dashboard/              Next.js 16 dashboard — pages, REST API routes, TanStack Query client, auth proxy
├── packages/
│   ├── core/                   Shared infra: db, supabase, llm, inngest, langfuse, env
│   └── agent-jobhunt/          Job-hunt agent: LangGraph workflow + Inngest function
└── supabase/                   Local Supabase config (project_id: agent-hub)
```

**`agent-jobhunt`** is a LangGraph workflow triggered daily (and on demand) by Inngest:
scrape job boards via Firecrawl → fingerprint-dedupe → evaluate fit per JD → tailor a
resume + cover letter for matches → render ATS-friendly PDFs via Typst in a Vercel Sandbox.
State persists in Supabase (Prisma); runs are observed via Langfuse.

---

## Stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Dashboard | Next.js 16 (App Router, webpack build), React 19 |
| Client data | TanStack Query v5 + axios + react-hot-toast |
| Agents | LangGraph (one graph per agent) |
| Orchestration | Inngest (cron + manual events) |
| LLM | Vercel AI SDK v5 + `@ai-sdk/anthropic` (Claude) |
| DB / ORM | Supabase Postgres + Prisma 6 (migrations via `prisma migrate`) |
| Storage | Supabase Storage (private buckets, signed URLs) |
| PDF render | Typst in a Vercel Sandbox |
| Observability | Langfuse · Validation: Zod · Tests: Vitest |

The dashboard fetches **all** its data through its own REST API routes (`app/api/<slug>/…`)
using axios + TanStack Query — never Server Actions (those are reserved for the auth
sign-in form). See **Dashboard data fetching** in [`CLAUDE.md`](./CLAUDE.md) for the full pattern.

---

## First-time setup

```bash
pnpm install
cp .env.example .env.local        # fill in Anthropic / Inngest / Langfuse keys
pnpm supabase:start               # start local Supabase (Docker)
pnpm db:deploy                    # apply committed migrations to the local DB
```

Local Supabase runs on ports **54421-54429** (custom range to avoid collisions with other local projects).

---

## Daily commands

### Run the app

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Next.js dashboard on http://localhost:3001 |
| `pnpm inngest:dev` | Inngest local dev server (separate terminal) — required for agent runs |
| `pnpm build` | Production build of all packages |
| `pnpm typecheck` | TypeScript check across the workspace |

> **Two terminals for local agent runs:** `pnpm dev` + `pnpm inngest:dev`. Without the second, Inngest events go nowhere.

### Local Supabase

| Command | What it does |
|---|---|
| `pnpm supabase:start` | Start the local Supabase stack (DB, Auth, Storage, Studio) |
| `pnpm supabase:stop` | Stop all Supabase containers |
| `pnpm supabase:status` | Show URLs and keys for the running stack |
| `pnpm supabase:studio` | Open Supabase Studio (http://127.0.0.1:54423) |
| `pnpm supabase:reset` | Reset local DB (drops everything, re-runs migrations) |

### Database (Prisma)

> **This project uses Prisma Migrations** (`packages/core/prisma/migrations/`). Edit `schema.prisma`, then create a migration with `pnpm db:migrate`. Production applies them automatically during the Vercel build (`prisma migrate deploy`). Don't run `prisma db push` against a migrated DB. (See the gotcha in [`CLAUDE.md`](./CLAUDE.md).)

| Command | What it does | When to use |
|---|---|---|
| `pnpm db:migrate` | Create + apply a new migration (`prisma migrate dev`) | **How we apply schema changes** — edit, migrate |
| `pnpm db:deploy` | Apply pending migrations, no new file (`prisma migrate deploy`) | Sync a DB to committed migrations (CI/prod/fresh local) |
| `pnpm db:status` | Show migration state (`:prod` for production) | Check for drift before/after deploying |
| `pnpm db:generate` | Regenerate the Prisma Client | After editing `schema.prisma` (also runs on `pnpm install`) |
| `pnpm db:studio` | Open Prisma Studio (http://localhost:5555) | Browse/edit table data |
| `pnpm db:reset` | `prisma migrate reset` (re-applies all migrations) | Wipe and rebuild the local DB from scratch |

### Two studios, different purposes

- **Supabase Studio** (`pnpm supabase:studio`) — manage Auth users, Storage buckets, run SQL
- **Prisma Studio** (`pnpm db:studio`) — browse and edit application tables

---

## Where things live

- **`.env.local`** at the repo root — single source of truth for env vars. Loaded into Next.js and Prisma via `dotenv-cli`.
- **Prisma schema** — `packages/core/prisma/schema.prisma` (applied via migrations in `packages/core/prisma/migrations/`)
- **Supabase config** — `supabase/config.toml`
- **Generated Prisma client** — `packages/core/node_modules/.prisma/client`

---

## Ports (local)

| Service | Port |
|---|---|
| Next.js dashboard | 3001 |
| Prisma Studio | 5555 |
| Supabase API (Kong) | 54421 |
| Supabase Postgres | 54422 |
| Supabase Studio | 54423 |
| Supabase Inbucket (mail) | 54424 |
| Supabase Analytics | 54427 |
