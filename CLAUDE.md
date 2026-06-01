# Agent Hub

Personal hub for autonomous AI agents. Each agent is a LangGraph workflow triggered by Inngest (cron + manual events), persisting state in Supabase via Prisma, observed via Langfuse. The dashboard (Next.js 15) is the deployment target and the only UI.

Current state: iteration 1 of `/job-hunt` ported (scraping + persistence; dedupe/eval/tailor/render are placeholder nodes). `/get-news` not started.

Full plan with status markers: `./agent-hub-plan.md`.

---

## Setup (first time)

```bash
pnpm install
cp .env.example .env.local        # fill in real values (see "Env vars" below)
pnpm supabase:start               # local Supabase on Docker (ports 54421-54429)
pnpm db:push                      # sync Prisma schema → local DB
```

## Daily commands

```bash
pnpm dev                          # Next.js dashboard → http://localhost:3000
pnpm inngest:dev                  # Inngest local dev server (separate terminal)
pnpm supabase:studio              # Supabase Studio (Auth, Storage, SQL)
pnpm db:studio                    # Prisma Studio (browse app tables)
pnpm db:push                      # apply schema changes (prototyping)
pnpm db:migrate                   # create + apply named migration (permanent)
pnpm typecheck                    # before claiming done
pnpm build                        # uses SKIP_ENV_VALIDATION via apps/dashboard script
```

**Two terminals required for local agent runs**: `pnpm dev` + `pnpm inngest:dev`. Without the second, Inngest events go nowhere.

---

## Architecture (3-layer monorepo)

```
agent-hub/
├── apps/
│   └── dashboard/          Next.js 15 app — pages, server actions, proxy (auth), API routes
├── packages/
│   ├── core/               Shared infra: db, supabase, llm, inngest client, langfuse, env
│   └── agent-jobhunt/      One agent's workflow: config, nodes, graph, Inngest function
└── supabase/               Local Supabase config (project_id: agent-hub)
```

**Layer rules**:
- `apps/dashboard` = UI + HTTP edge. Routing requires it to live in `app/`.
- `packages/core` = primitives reused by every agent. If a second agent would re-implement it, it belongs here.
- `packages/agent-<name>` = one agent's logic. No React, no Next.js. Other agents don't import from here.

**Where UI components live**: agent-specific React → `apps/dashboard/app/agents/<slug>/_components/`. Shared → `apps/dashboard/components/`. Agent packages export *data* (manifest, types), not JSX.

---

## Adding a new agent

1. `packages/agent-<name>/` with `package.json` (depends on `@hub/core`), `src/manifest.ts`, `src/graph.ts`, `src/inngest.ts`, `src/index.ts`
2. Add `"@hub/agent-<name>": "workspace:*"` to `apps/dashboard/package.json` deps
3. Add `"@hub/agent-<name>"` to `transpilePackages` in `apps/dashboard/next.config.ts`
4. Import the agent's Inngest functions and spread into `serve({ functions: [...] })` in `apps/dashboard/app/api/inngest/route.ts`
5. Create `apps/dashboard/app/agents/<slug>/page.tsx` + `actions.ts`
6. Add manifest to home page `agents[]` array in `apps/dashboard/app/page.tsx`

---

## Conventions

- **Single root `.env.local`** loaded via `dotenv-cli` in package scripts. Never create per-package `.env` files.
- **`import "server-only"`** on every file in `packages/core/src/` that touches secrets or DB. Prevents accidental client bundle leak.
- **Server actions live next to the page that uses them**: `apps/dashboard/app/<route>/actions.ts`. They're tied to routes; don't put them in packages.
- **One LangGraph per agent**, compiled in the agent's `graph.ts`. Nodes are async functions returning `Partial<State>`. State uses `Annotation.Root` with reducers.
- **Inngest functions own AgentRun lifecycle**: create row → invoke graph → mark completed/failed → flush Langfuse.
- **Manifest = business card**. Slug, cron, timezone, dashboardPath. Anything that needs to *know about* an agent (without running it) reads the manifest.
- **Prisma schema is shared** in `packages/core/prisma/schema.prisma`. Per-agent models live there too; don't fork schemas.

---

## Gotchas

- **`proxy.ts` not `middleware.ts`**. Next.js 16 deprecated middleware. We're on 15.5 but use the modern name.
- **Supabase local runs on 54421-54429** (not the default 54321 range) — other local Supabase projects on this machine use the defaults.
- **Local Supabase has no pooler** — `DATABASE_URL` and `DIRECT_URL` both point to `:54422`. In Vercel production, `DATABASE_URL` becomes `:6543?pgbouncer=true&connection_limit=1`.
- **Prisma client regeneration**: if you change `schema.prisma` and the new field doesn't show in TypeScript, run `pnpm db:generate` (or it runs automatically on `pnpm install` via postinstall).
- **Don't customize Prisma `output`** in schema. Default works with pnpm workspaces; custom paths break resolution in nested packages.
- **`SKIP_ENV_VALIDATION=true`** is gated to Next.js build phase only (`NEXT_PHASE === "phase-production-build"`). Doesn't disable validation at runtime, even if env is set.
- **LangGraph array reducers `[...a, ...b]`** are safe for fan-out parallel branches but unsafe if a node retries (would double the array). Only matters once we add a checkpointer.
- **Inngest cron uses `TZ=` prefix**: `{ cron: \`TZ=${manifest.timezone} ${manifest.cron}\` }`. Don't hardcode the cron string in two places.
- **`step.run("invoke-graph")` wraps the whole graph** — if it retries, Firecrawl re-pays. Acceptable for iter 1 because persist is idempotent (upsert + skip-if-seen-today). Revisit when adding a checkpointer.
- **Vercel Pro function max = 800s** (per current docs as of June 2026). Don't trust older "300s" advice.

---

## Env vars

All loaded from root `.env.local` into both Next.js and Prisma via `dotenv-cli`.

| Var | Where used | Notes |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | core/supabase.ts | Local values from `supabase status` |
| `DATABASE_URL` / `DIRECT_URL` | Prisma | Local: same direct URL; prod: pooled + direct |
| `ANTHROPIC_API_KEY` | core/llm.ts (future LLM calls) | Placeholder OK for iter 1 |
| `FIRECRAWL_API_KEY` | agent-jobhunt/nodes/scrape.ts | **Required** for job-hunt to actually run |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | core/inngest.ts + api/inngest route | Local: any value works with `pnpm inngest:dev` |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | core/langfuse.ts | Placeholder OK until iter 3 (LLM calls) |
| `HUB_ACCESS_TOKEN` | proxy.ts + signIn action | Cookie-based auth for `/agents/*` routes. Generate with `openssl rand -hex 32`. |

---

## Anti-patterns to avoid

- ❌ Per-package `.env` files (always edit root `.env.local`)
- ❌ Importing `@hub/core/db` or `@hub/core/supabase` from a Client Component (`"use client"`) — `server-only` will throw
- ❌ Tailwind classes — not configured yet. Pages currently use inline styles intentionally; don't migrate piecemeal.
- ❌ Adding `output =` to Prisma schema (was tried, broke pnpm resolution)
- ❌ Creating a `middleware.ts` file — use `proxy.ts` (Next 16 convention)
- ❌ Calling LLMs directly from React components — always via Inngest function → graph node
- ❌ Tracking agent state in JSON files — use Prisma models
