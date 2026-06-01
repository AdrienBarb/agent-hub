# Agent Hub

Personal hub for autonomous AI agents. See [agent-hub-plan.md](../agent-hub-plan.md) for the project plan.

## Structure

```
agent-hub/
├── apps/
│   └── dashboard/              Next.js dashboard
├── packages/
│   ├── core/                   Shared: db, llm, inngest, langfuse
│   ├── agent-jobhunt/          (coming soon)
│   └── agent-news/             (coming soon)
└── supabase/                   Local Supabase config (project_id: agent-hub)
```

---

## First-time setup

```bash
pnpm install
cp .env.example .env.local        # fill in Anthropic / Inngest / Langfuse keys
pnpm supabase:start               # start local Supabase (Docker)
pnpm db:push                      # sync Prisma schema to local DB
```

Local Supabase runs on ports **54421-54429** (custom range to avoid collisions with other local projects).

---

## Daily commands

### Run the app

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Next.js dashboard on http://localhost:3000 |
| `pnpm build` | Production build of all packages |
| `pnpm typecheck` | TypeScript check across the workspace |

### Local Supabase

| Command | What it does |
|---|---|
| `pnpm supabase:start` | Start the local Supabase stack (DB, Auth, Storage, Studio) |
| `pnpm supabase:stop` | Stop all Supabase containers |
| `pnpm supabase:status` | Show URLs and keys for the running stack |
| `pnpm supabase:studio` | Open Supabase Studio (http://127.0.0.1:54423) |
| `pnpm supabase:reset` | Reset local DB (drops everything, re-runs migrations) |

### Database (Prisma)

| Command | What it does | When to use |
|---|---|---|
| `pnpm db:push` | Push schema to DB without creating a migration file | Prototyping — edit `schema.prisma`, push, repeat |
| `pnpm db:migrate` | Create a new migration file and apply it | Permanent schema change |
| `pnpm db:deploy` | Apply pending migrations (no creation) | Production / CI |
| `pnpm db:reset` | Drop DB, re-apply all migrations | Wipe and start over |
| `pnpm db:studio` | Open Prisma Studio (http://localhost:5555) | Browse/edit table data |
| `pnpm db:generate` | Regenerate the Prisma Client | After editing `schema.prisma` |

### Two studios, different purposes

- **Supabase Studio** (`pnpm supabase:studio`) — manage Auth users, Storage buckets, run SQL
- **Prisma Studio** (`pnpm db:studio`) — browse and edit application tables

---

## Where things live

- **`.env.local`** at the repo root — single source of truth for env vars. Loaded into Next.js and Prisma via `dotenv-cli`.
- **Prisma schema** — `packages/core/prisma/schema.prisma`
- **Prisma migrations** — `packages/core/prisma/migrations/`
- **Supabase config** — `supabase/config.toml`
- **Generated Prisma client** — `packages/core/node_modules/.prisma/client`

---

## Ports (local)

| Service | Port |
|---|---|
| Next.js dashboard | 3000 |
| Prisma Studio | 5555 |
| Supabase API (Kong) | 54421 |
| Supabase Postgres | 54422 |
| Supabase Studio | 54423 |
| Supabase Inbucket (mail) | 54424 |
| Supabase Analytics | 54427 |
