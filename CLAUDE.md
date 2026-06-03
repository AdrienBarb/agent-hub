# Agent Hub

Personal hub for autonomous AI agents. Each agent is a LangGraph workflow triggered by Inngest (cron + manual events), persisting state in Supabase via Prisma, observed via Langfuse. The dashboard (Next.js 15) is the deployment target and the only UI.

Current state: `/job-hunt` ported through iter 4 (scrape → persist → deep-scrape → evaluator sub-graph → tailor sub-graph). Render (Typst PDFs) is still a placeholder. Dedupe is still a placeholder. `/get-news` not started.

Full plan with status markers: `./agent-hub-plan.md`.

---

## Setup (first time)

```bash
pnpm install
cp .env.example .env.local        # fill in real values (see "Env vars" below)
pnpm supabase:start               # local Supabase on Docker (ports 54421-54429)
pnpm db:push                      # sync Prisma schema → local DB
pnpm storage:setup                # create the "job-hunt" Storage bucket (idempotent)
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
- **`generateObject` MUST set `providerOptions.anthropic.structuredOutputMode: "outputFormat"`.** Both run-steps (`tailor/run-step.ts`, `evaluator/run-step.ts`) do. `@ai-sdk/anthropic@2.0.80` defaults to `structuredOutputMode: "jsonTool"`, which wraps your Zod schema in a generic Anthropic tool named `"json"` and forces a tool call. Opus 4.7 fills that tool **unreliably** on non-trivial schemas — it nests the real object under a spurious key (`{input:{…}}`, `{"$PARAMETER_NAME":{…}}`) or returns `{}` — so Zod rejects it with `AI_NoObjectGeneratedError: response did not match schema`. (Sonnet 4.6 happens to tolerate the json tool; Opus does not. It is NOT that Opus can't emit JSON.) `"outputFormat"` switches to Anthropic-native structured outputs (`output_config.format` json_schema, grammar-constrained decoding) — top-level, schema-valid output every time. Both `claude-opus-4-7` and `claude-sonnet-4-6` support it; the SDK adds the beta header itself. Root-caused via wire capture; reproduce with `scripts/rerun-tailor.ts`.
- **Native structured outputs forces `additionalProperties: false`, so `z.record` (free-key map) comes back EMPTY.** The grammar has no declared properties for a record → it can only emit `{}` (and `z.record` accepts `{}`, so it fails silently, not loudly). Resume `skills` is therefore modeled as an **array** `{ category, items }[]` (`ResumeDraftSchema`) for the LLM, then converted back to a keyed map (`resumeDraftToYaml`) before storage so `resume.yaml` still matches the master shape. Also note: `sanitizeJsonSchema` demotes unsupported keywords (`min`/`max`/`minItems`/`pattern`/…) into the field `description` (not grammar-enforced) — Zod still validates them locally, so keep your Zod constraints.
- **`allowSystemInMessages: true`** is set on every `generateObject` call. We put the system prompt inside `messages` (not the top-level `system:` field) so we can attach `providerOptions.anthropic.cacheControl: { type: "ephemeral" }` to it for Anthropic prompt caching. Without the flag, the AI SDK emits a noisy security warning on every call.
- **LangGraph conditional edges fire per Send branch, not after fan-in**. If you put `addConditionalEdges("X", ...)` where `X` is fanned out via `Send()`, the edge fires N times (one per branch), not once. To dispatch once after fan-in, insert a no-op pass-through node and put the conditional edge on that node. See `postEvalFanInNode` in `packages/agent-jobhunt/src/nodes/dispatch-tailorings.ts`.
- **Supabase Storage bucket `job-hunt` must exist before the agent runs**. `pnpm storage:setup` creates it idempotently. Per-job artifacts live at `${runId}/${jobId}/{resume.yaml,cover.md,summary.md,diff.md}`.

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
