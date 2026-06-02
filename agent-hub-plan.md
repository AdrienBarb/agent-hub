# Agent Hub — Project Summary

> Status legend: ✅ done · 🚧 partial / iter-1 only · ⬜ not started · ❌ blocked

## Goal

Build a personal hub for two automated agents: `/job-hunt` and `/get-news`. Runs on cron, no chat UI, just a dashboard for runs and outputs.

Secondary goal: portfolio piece for AI Agentic Engineer applications.

---

## Stack

| Layer | Choice | Status |
|---|---|---|
| Hosting | Vercel (Pro, 800s function limit) | ⬜ not deployed yet |
| Frontend | Next.js 15 (App Router) — dashboard only | ✅ scaffolded |
| Database | Supabase (Postgres + pgvector + Auth + Storage) | 🚧 local running on 54421-54429; pgvector / Storage / Auth not yet exercised |
| ORM | Prisma | ✅ schema + client + migrations |
| Orchestration | Inngest (cron, retries, durability) | 🚧 wired in code; never run end-to-end; no Inngest Cloud account |
| Agent framework | LangGraph.js | 🚧 compiled but trivially used (linear edges only — no checkpointer, no Send, no conditional edges) |
| LLM SDK | Vercel AI SDK + Anthropic | ⬜ provider exported, never called |
| Models | Sonnet 4.6 (eval), Opus 4.7 (generation) | ⬜ constants defined, not used |
| Observability | Langfuse Cloud | 🚧 OTel wired in instrumentation.ts; no real keys, no traces yet |
| Scraping | Firecrawl (+ Playwright fallback) | 🚧 Firecrawl client wired; Playwright fallback not implemented; key still placeholder |
| PDF (job-hunt) | Typst in Vercel Sandbox | ⬜ |
| TTS (get-news) | ElevenLabs | ⬜ |
| Monorepo | pnpm workspaces + Turborepo | ✅ |

---

## Repo structure

```
agent-hub/
├── apps/
│   └── dashboard/              ✅ Next.js app, auth gate, /agents/job-hunt page
├── packages/
│   ├── core/                   ✅ env, db, supabase, llm, inngest, langfuse
│   ├── agent-jobhunt/          🚧 iter 1 only (scrape + persist; rest is placeholders)
│   └── agent-news/             ⬜ not started
└── supabase/                   ✅ local config (project_id: agent-hub)
```

---

## Architecture (per agent)

```
Inngest cron
   │
   ▼
Vercel function → graph.invoke()
   │
   ▼
LangGraph (checkpointed to Supabase)   ← ⬜ checkpointer not wired yet
   │
   ▼
Outputs → Supabase Storage             ← ⬜ not used yet
Traces  → Langfuse                     ← 🚧 wiring present, no real keys
```

**job-hunt graph**: scrape (parallel) → dedupe → fan-out evaluators → aggregate → fan-out tailorings → render PDFs

| Stage | Status |
|---|---|
| scrape (listing) | 🚧 jobup only (sequential, not parallel); jobs.ch parser exists but not enabled in config; swissdevjobs adapter not written |
| persist | ✅ race-safe upsert + skip-if-seen-today (Europe/Zurich) |
| deep-scrape (JD) | ✅ Firecrawl per Job URL, concurrency 5, idempotent (filter `rawMarkdown: null`), thin-sentinel + outage threshold |
| dedupe | ⬜ placeholder pass-through |
| fan-out evaluators | ⬜ placeholder pass-through |
| aggregate | ⬜ placeholder pass-through |
| fan-out tailorings | ⬜ placeholder pass-through |
| render PDFs | ⬜ placeholder pass-through |

**get-news graph**: fetch Feedbin → fan-out deep-readers → summarize (French) → ElevenLabs TTS → send Telegram voice note — ⬜ entire agent not started

---

## Build phases

### Phase 1 — Foundation ✅
- ✅ pnpm + Turborepo monorepo
- ✅ `packages/core`: env (Zod), Prisma client, Supabase client, AI SDK + Anthropic provider, Inngest client, Langfuse OTel setup
- ✅ `apps/dashboard`: Next.js 15 App Router skeleton, root layout, home page
- ✅ Local Supabase running on dedicated ports
- ✅ Single `.env.local` at root, loaded via `dotenv-cli`
- ✅ `server-only` guards, Inngest signing key, security review fixes
- ✅ CLAUDE.md, README, agent-hub-plan.md (this file)
- ✅ `proxy.ts` (Next 16 convention) for `/agents/*` auth gate via `HUB_ACCESS_TOKEN` cookie
- ✅ `/auth` page + signIn server action

### Phase 2 — Port `/job-hunt` 🚧 (iter 1 done + deep-scrape from iter 3)

**Iter 1 — scaffold + jobup scraper** 🚧 code complete, never run
- ✅ `packages/agent-jobhunt` package
- ✅ Prisma `Job` model + `JobStatus` enum + `AgentRun.jobs` relation
- ✅ LangGraph state with reducers (`scrapedListings`, `parsedJobs`, counters)
- ✅ Real nodes: scrape (Firecrawl), parse (jobup adapter + keyword + filter), persist (race-safe upsert + skip-if-seen-today in Europe/Zurich)
- ✅ Placeholder nodes: dedupe, evaluate, tailor, render
- ✅ Inngest function: cron `0 6 * * *` Europe/Zurich + event `jobhunt/run.requested`
- ✅ Dashboard page `/agents/job-hunt` with "Run now" button, recent runs table, recent jobs list
- ❌ **End-to-end verification: never actually executed.** Firecrawl key still placeholder; `pnpm inngest:dev` never run; no Job rows in DB.

**Iter 2 — multi-board + real dedupe + checkpointer** ⬜
- ⬜ Add `swissdevjobs` adapter (different HTML structure than JobCloud)
- ⬜ Enable `jobs.ch` in `config.json` (adapter already exists)
- ⬜ `Send()` API for parallel scrape fan-out (one Send per listing URL)
- ⬜ Real dedupe node: SHA1 fingerprint over `(company, city, jdBody[:800])` + pgvector embedding for semantic dedup
- ⬜ Wire `PostgresSaver` checkpointer on the graph (Supabase Postgres)
- ⬜ Fix array-reducer retry footgun (F15 from review) once checkpointer is in
- ⬜ Per-node `step.run` wrapping (or rely on graph checkpoint resumption) — fix F14

**Iter 3 — fit evaluator subgraph** 🚧 (deep-scrape done; eval pending)
- ✅ Deep-scrape per JD via Firecrawl → stored in `Job.rawMarkdown` (DB column, not Storage). Concurrency 5, thin-content sentinel, outage threshold ≥3, 60s timeout per URL
- ⬜ Evaluator subgraph: extract-requirements → compare-profile → score → self-critique (conditional edge)
- ⬜ Vercel AI SDK `generateObject` with Zod schema for structured fit output
- ⬜ Sonnet 4.6 with prompt caching on candidate profile (`me.md` + `resume-master.yaml`)
- ⬜ Write `fitScore`, `fitReasoning`, `status=evaluated` or `not_a_fit` on Job
- ⬜ Real Langfuse traces (will need real API keys)

**Iter 4 — tailor subgraph** ⬜
- ⬜ Tailoring subgraph for jobs above threshold: plan → draft resume → draft cover → ATS check → revise (conditional edge)
- ⬜ Opus 4.7 with extended thinking
- ⬜ Humanizer rules inline (no em-dashes, no AI vocab — port `references/writing-rules.md`)
- ⬜ Persist tailored artifacts (resume.yaml, cover.md) to Supabase Storage

**Iter 5 — render PDFs** ⬜
- ⬜ Typst compilation via Vercel Sandbox
- ⬜ Port Typst templates from existing skill (`templates/resume.typ`, `cover-letter.typ`)
- ⬜ ATS validation: pdftotext extracts > 500 chars + standard section names
- ⬜ Upload PDFs to Supabase Storage
- ⬜ Dashboard shows download links per Job

### Phase 3 — Port `/get-news` ⬜
- ⬜ `packages/agent-news` package
- ⬜ Feedbin API client
- ⬜ Fan-out deep-readers via `Send()`
- ⬜ Summarize in French via Claude
- ⬜ ElevenLabs TTS integration
- ⬜ Telegram bot integration

### Phase 4 — Polish ⬜
- ⬜ Tailwind + shadcn/ui (replace inline styles)
- ⬜ Suspense boundaries + `loading.tsx` per route
- ⬜ `error.tsx` per route
- ⬜ `useActionState` + `useFormStatus` on Run-now button
- ⬜ Extract page components into `_components/` folders
- ⬜ Public Langfuse trace links in README
- ⬜ Braintrust eval suite (≥30 hand-scored JDs as golden set)
- ⬜ GitHub Actions CI: typecheck + build on PR
- ⬜ Deploy to Vercel + connect Inngest Cloud
- ⬜ Real production env values (Anthropic, Firecrawl, Inngest, Langfuse, HUB_ACCESS_TOKEN)

---

## Open items / known gaps

### 🔴 Blocking iter-1 verification (~15 min total)
- ❌ Fill `FIRECRAWL_API_KEY` in `.env.local` (copy from existing `/job-hunt` skill)
- ❌ Run `pnpm dev` + `pnpm inngest:dev`, visit `/auth`, click "Run now"
- ❌ Confirm Job rows appear via `pnpm db:studio`

### 🟡 Deferred by design (documented in commit "fix: address adversarial review")
- F14 — `step.run("invoke-graph")` wraps whole pipeline (not idempotent on retry); iter 2 with checkpointer
- F15 — array reducers will double on retry; iter 2 fix alongside checkpointer
- F16 — no Suspense streaming + no `useFormStatus` pending state; polish iteration

### 🟠 Production gaps
- No Vercel deployment yet
- No Inngest Cloud account (local dev only)
- No Langfuse Cloud account
- `HUB_ACCESS_TOKEN` still set to `local-dev-token-please-replace-in-prod`
- No CI, no tests, no Braintrust evals

---

## Recommended next moves

1. **Verify iter 1 end-to-end** (the 🔴 row above) before building further
2. **Port `/get-news` as its own iter 1** — smaller scope, validates the monorepo's "add new agent" flow, no LLM dependency
3. **Iter 2 of job-hunt** — adds the LangGraph features that justify the framework (checkpointer + `Send()` fan-out + conditional dedupe edge)
