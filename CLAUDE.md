# Agent Hub

Personal hub for autonomous AI agents. Each agent is a LangGraph workflow triggered by Inngest (cron + manual events), persisting state in Supabase via Prisma, observed via Langfuse. The dashboard (Next.js 16 + React 19) is the deployment target and the only UI.

**Current state and what's left to do live in [`./agent-hub-plan.md`](./agent-hub-plan.md)** — the single source of truth for the roadmap. This file (CLAUDE.md) only holds setup, architecture, conventions, and gotchas that don't change run-to-run.

---

## Stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Dashboard | Next.js 16 (App Router, **webpack** build), React 19 |
| Client data | **TanStack Query v5** + **axios** (`lib/http.ts`) + **react-hot-toast** |
| Auth | cookie (`hub_token`) gate via `proxy.ts`; every `/api/*` re-checks it |
| Agents | LangGraph — one compiled graph per agent |
| Orchestration | Inngest (cron + manual events) |
| LLM | Vercel AI SDK v5 + `@ai-sdk/anthropic` (Claude Opus/Sonnet, native structured outputs) |
| DB / ORM | Supabase Postgres + Prisma 6 (`db:push` only — no migrations) |
| Storage | Supabase Storage (private buckets, short-TTL signed URLs) |
| PDF render | Typst in a Vercel Sandbox |
| Observability | Langfuse |
| Validation | Zod |
| Tests | Vitest |

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
pnpm dev                          # Next.js dashboard → http://localhost:3001 (pinned via `next dev -p 3001`)
pnpm inngest:dev                  # Inngest local dev server (separate terminal) → syncs against :3001
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
│   └── dashboard/          Next.js 16 app — pages, REST API routes, TanStack Query client, proxy (auth)
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

## Dashboard data fetching

The dashboard talks to its **own REST API routes** via **axios + TanStack Query** — not Server Actions. Server Actions are reserved for the auth sign-in form (`app/auth/actions.ts`). The **job-hunt page is the reference implementation**; every new agent page follows the same layering:

- **Routes** — `apps/dashboard/app/api/<slug>/…/route.ts` (`GET`/`PATCH`/`POST`). Each calls `requireHubAuth(request)` from `lib/api-auth.ts` **first** (`proxy.ts` only gates `/agents/*`, never `/api/*`). `GET` handlers set `export const dynamic = "force-dynamic"`. Validate inputs against an allow-list; never write client-supplied arbitrary fields. Map Prisma rows to a JSON-safe shape in a colocated `serialize.ts`.
- **Transport types** — `lib/<slug>/types.ts`: the request/response contract, shared by routes and client. UI-free (no React, no presentation helpers).
- **axios** — `lib/http.ts`: one instance (`baseURL: "/api"`, `withCredentials`). A response interceptor surfaces API failures via **react-hot-toast** (deduped under a single toast id; skips `AbortSignal` cancellations). `<Toaster/>` is mounted once in `app/providers.tsx`.
- **Fetchers** — `lib/<slug>/api.ts`: typed thin wrappers over the routes; thread the query's `AbortSignal` into axios so unmount/refetch cancels in-flight reads.
- **Query keys** — `lib/<slug>/keys.ts`: a key factory so queries and invalidations can't drift.
- **Hooks** — `app/agents/<slug>/_hooks/*`: `useQuery`/`useMutation`. Mutations are optimistic (`onMutate` snapshot → `onError` rollback → `onSettled` invalidate) and resolve the **live cached row by id**, not a stale closure. Errors toast via the interceptor — don't re-handle them per call.
- **Page** is a thin static RSC shell; the client component fetches with a **loading skeleton + error state** (deliberately NO SSR prefetch). `app/providers.tsx` holds `QueryClientProvider` (one client per browser session via `useState`) + `<Toaster/>`, wired into `layout.tsx`.

**Polling**: poll a `GET …/run/status` query while a run is active and drive the data query's `refetchInterval` off `running`; force one final refetch on the run's `true→false` edge (`useRefreshJobsOnRunComplete`) so the last batch written at completion isn't missed. Gate the full-screen error on `isError && !data` so a failed background poll doesn't blank a populated board.

---

## Adding a new agent

1. `packages/agent-<name>/` with `package.json` (depends on `@hub/core`), `src/manifest.ts`, `src/graph.ts`, `src/inngest.ts`, `src/index.ts`
2. Add `"@hub/agent-<name>": "workspace:*"` to `apps/dashboard/package.json` deps
3. Add `"@hub/agent-<name>"` to `transpilePackages` in `apps/dashboard/next.config.ts`
4. Import the agent's Inngest functions and spread into `serve({ functions: [...] })` in `apps/dashboard/app/api/inngest/route.ts`
5. Create `apps/dashboard/app/agents/<slug>/page.tsx` (thin shell) + REST routes under `apps/dashboard/app/api/<slug>/` + the client data layer (see **Dashboard data fetching**)
6. Add manifest to home page `agents[]` array in `apps/dashboard/app/page.tsx`

---

## Conventions

- **Single root `.env.local`** loaded via `dotenv-cli` in package scripts. Never create per-package `.env` files.
- **`import "server-only"`** on every file in `packages/core/src/` that touches secrets or DB (and on dashboard server-only helpers like `lib/api-auth.ts` / `api/**/serialize.ts`). Prevents accidental client bundle leak.
- **Dashboard data goes through REST routes + axios + TanStack Query** (see **Dashboard data fetching**), not Server Actions. The only Server Action is the auth sign-in form (`app/auth/actions.ts`).
- **One LangGraph per agent**, compiled in the agent's `graph.ts`. Nodes are async functions returning `Partial<State>`. State uses `Annotation.Root` with reducers.
- **Inngest functions own AgentRun lifecycle**: create row → invoke graph → mark completed/failed → flush Langfuse.
- **Manifest = business card**. Slug, cron, timezone, dashboardPath. Anything that needs to *know about* an agent (without running it) reads the manifest.
- **Prisma schema is shared** in `packages/core/prisma/schema.prisma`. Per-agent models live there too; don't fork schemas.

---

## Gotchas

- **`proxy.ts` not `middleware.ts`** (Next 16 convention). On **Next 16** `proxy.ts` exporting `proxy` is picked up as middleware: it registers as `/_middleware` on the **Node.js runtime** (the `edge` runtime is NOT supported for `proxy`) and gates `/agents/:path*`. Verify with the `ƒ Proxy (Middleware)` line in `next build` output + the `/agents/:path*` matcher in `.next/server/functions-config-manifest.json`. ⚠️ On the prior Next 15.5 the `proxy.ts` filename was silently ignored (legacy convention is `middleware.ts`), so the auth gate never ran — the Next 16 upgrade is what activated it.
- **`next build` uses `--webpack`, not the Next 16 default Turbopack.** Turbopack compiles fine but fails at page-data collection with `PageNotFoundError: Cannot find module for page: /auth` (server-actions page). `dev` still uses Turbopack (default). Retry dropping `--webpack` after a Next minor bump; if it builds, prefer Turbopack.
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
- **Supabase Storage bucket `job-hunt` must exist before the agent runs**. `pnpm storage:setup` creates it idempotently. Per-job artifacts live at `${runId}/${jobId}/{resume.yaml,cover.md,summary.md,diff.md,resume.pdf,cover.pdf}`.
- **Render (iter 5) compiles Typst → PDF in a WARM Vercel Sandbox, folded into the tailor sub-graph** (`ats-check → revise? → render → persist`). The single backend is `@vercel/sandbox` (v2) — there is no local-CLI or WASM path; even local dev provisions a remote microVM, so it needs `VERCEL_TOKEN`/`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` (passed explicitly to `Sandbox.create({token,teamId,projectId})` — the SDK only auto-reads `VERCEL_OIDC_TOKEN`). The sandbox is a **module-level singleton** (memoized promise in `render/sandbox.ts`) reused across the run's parallel tailor branches; Typst (musl static binary) + fonts + templates are installed/written once; `disposeRenderSandbox()` is called by the parent `finalize` node (and as a safety net in `inngest.ts`'s catch). A failed creation resets the memo so a later call retries. Smoke-test before the graph with `scripts/rerun-render.ts`.
- **The render node is BEST-EFFORT and never throws.** It runs before `persist`, so a Typst/sandbox failure must not lose the text artifacts — it logs, records `renderDetails.ats.ok=false`, returns null PDF paths, and `persist` still writes `status=tailored` (no PDF). render uploads the two PDFs itself (lean checkpoints); `persist` only records the paths + ATS result. "Has PDF" is gated on `resumePdfStoragePath != null` (no new `JobStatus`).
- **Typst templates were ported with two deltas:** font is a fallback list `("Arial", "Liberation Sans")` + bundled Liberation Sans TTFs passed via `--font-path` (Arial absent on Linux); and `@preview/cmarker` was dropped from `cover.typ` (needs network at compile) — the cover body is rendered as blank-line-separated paragraphs. Assets live in `packages/agent-jobhunt/render-assets/` (loaded via `import.meta.url` like `profile.ts`; needs `outputFileTracingIncludes` before Vercel deploy). Typst requires the entry template inside `--root`, so root is `/vercel/sandbox` and templates sit under it; per-job data uses absolute-under-root paths and the render node overrides `profile.photo` to the per-job path.
- **ATS check is now `unpdf` in-process (record-only), replacing the legacy `pdftotext`.** `checkAts` = ≥500 chars + Experience/Skills/Education present. It NEVER gates a revise (matches iter-4 single-pass + legacy "exit 2 = warn, don't halt"); the result lands in `Job.renderDetails.ats`. `AtsResult` is a `type` alias (not interface) so it stays assignable to Prisma `InputJsonValue`.
- **The dashboard PDF download route (`app/api/job-hunt/artifact/route.ts`) self-checks `hub_token`.** `proxy.ts`'s matcher only covers `/agents/*`, NOT `/api/*`, so any API route must re-check the cookie itself. It maps `?kind` → a Job column server-side (never trusts a raw path) and 302-redirects to a fresh 60s `createSignedUrl` (the bucket is private).
- **The DB has no Prisma migrations history — always use `db:push` (Prisma CLI), never `prisma migrate`, never raw `ALTER TABLE`.** Apply schema changes with `pnpm --filter @hub/core exec dotenv -e ../../.env.local -- prisma db push` (add `--accept-data-loss` for drops). Every `db:push` warns it will drop the LangGraph `checkpoint_*` tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) because they're owned by `PostgresSaver.setup()`, not the Prisma schema — this is expected. They're auto-recreated **empty** on the next agent run via `setupCheckpointer()`, so `--accept-data-loss` only costs past-run resume state (fine for local dev), never functionality.

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
| `VERCEL_TOKEN` / `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` | render/sandbox.ts | **Required for iter-5 render** (Vercel Sandbox). Personal access token + team/project IDs, passed explicitly to `Sandbox.create`. Absent → render fails best-effort (job still tailored, no PDF). |
| `RENDER_TYPST_VERSION` | render/sandbox.ts | Typst version downloaded into the sandbox. Defaults to `0.14.2`. |

---

## Anti-patterns to avoid

- ❌ Per-package `.env` files (always edit root `.env.local`)
- ❌ Importing `@hub/core/db` or `@hub/core/supabase` from a Client Component (`"use client"`) — `server-only` will throw
- ❌ Fetching/mutating dashboard data with Server Actions — use a REST route + axios + TanStack Query (see **Dashboard data fetching**)
- ❌ Calling `fetch`/axios directly from a component — go through a `lib/<slug>/api.ts` fetcher + a query/mutation hook
- ❌ A new `/api/*` route without `requireHubAuth` as its first line — the proxy only gates `/agents/*`
- ❌ Tailwind classes — not configured yet. Pages currently use inline styles / scoped `<style>` intentionally; don't migrate piecemeal.
- ❌ Adding `output =` to Prisma schema (was tried, broke pnpm resolution)
- ❌ Creating a `middleware.ts` file — use `proxy.ts` (Next 16 convention)
- ❌ Calling LLMs directly from React components — always via Inngest function → graph node
- ❌ Tracking agent state in JSON files — use Prisma models
