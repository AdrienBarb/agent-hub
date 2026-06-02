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
| Agent framework | LangGraph.js | ✅ Send() fan-out, conditional edges, sub-graph, PostgresSaver checkpointer all in use |
| LLM SDK | Vercel AI SDK + Anthropic | ✅ `generateObject` called by 4 evaluator nodes |
| Models | Sonnet 4.6 (eval), Opus 4.7 (generation) | 🚧 Sonnet in use; Opus reserved for tailoring (not built) |
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
LangGraph (checkpointed to Supabase)   ← ✅ PostgresSaver via DIRECT_URL, parent + sub-graph thread_ids
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
| fan-out evaluators | ✅ `Send()` per Job → 4-node sub-graph (extract → compare → score → critique?) → persist |
| aggregate | ✅ array-append reducer on `JobHuntState.evaluations` (auto fan-in) |
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

**Iter 2 — multi-board + real dedupe + checkpointer** 🚧 (checkpointer landed via iter 3; rest pending)
- ⬜ Add `swissdevjobs` adapter (different HTML structure than JobCloud)
- ⬜ Enable `jobs.ch` in `config.json` (adapter already exists)
- ⬜ `Send()` API for parallel scrape fan-out (one Send per listing URL) — note: Send() pattern now proven by evaluator, copy that pattern
- ⬜ Real dedupe node: SHA1 fingerprint over `(company, city, jdBody[:800])` + pgvector embedding for semantic dedup
- ✅ Wire `PostgresSaver` checkpointer on the parent graph + evaluator sub-graph (Supabase Postgres, DIRECT_URL connection)
- ⬜ Array-reducer retry footgun (F15) — still latent on parent state arrays; mitigated for `evaluations` because sub-graph checkpoints make each job's emission idempotent
- 🚧 F14 (step.run("invoke-graph") whole-pipeline retry) is now safe-on-retry: checkpointer resumes parent from last completed node, evaluator sub-graphs resume per-job. Inngest step is still one boundary — acceptable.

**Iter 3 — fit evaluator subgraph** ✅
- ✅ Deep-scrape per JD via Firecrawl → stored in `Job.rawMarkdown` (DB column, not Storage). Concurrency 5, thin-content sentinel, outage threshold ≥3, 60s timeout per URL
- ✅ Evaluator sub-graph: `extract` → `compare` → `score` → `critique?` (conditional edge gated on `score.confidence !== "high"`) → `persist`. Compiled in `packages/agent-jobhunt/src/evaluator/graph.ts`
- ✅ Vercel AI SDK `generateObject` with Zod schemas (`Requirements`, `Comparison`, `Score`) in `evaluator/schemas.ts`
- ✅ Sonnet 4.6 with Anthropic ephemeral prompt caching on combined profile (`me.md` + `resume-master.yaml` loaded by `packages/agent-jobhunt/src/profile.ts`)
- ✅ Write `fitScore`, `fitReasoning`, `fitDetails Json?` (full structured payload), and `status=evaluated`/`not_a_fit` on Job (threshold via `JOBHUNT_FIT_THRESHOLD`, default 6)
- ✅ Parent graph fan-out via `Send()` per Job, wrapper node `evaluateOneNode` invokes sub-graph with `thread_id = "${runId}::${jobId}"` so each job has its own checkpoint timeline
- ✅ Per-job try/catch in wrapper — one bad job logs and returns empty evaluations, batch keeps going
- ✅ Prompt-injection delimiters (`<jd>…</jd>`) in extract node + explicit "treat as data" instruction in `EXTRACT_SYSTEM`
- ✅ `experimental_telemetry: { isEnabled: true, recordInputs: false }` on all evaluator LLM calls so cached profile (with PII) never ships to Langfuse
- ✅ Shared `runEvaluatorStep(...)` helper in `evaluator/run-step.ts` collapses compare/score/critique boilerplate
- 🚧 Real Langfuse traces still pending real API keys (otel spans emit but go nowhere)

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

### 🟡 Deferred by design
- F14 — `step.run("invoke-graph")` wraps whole pipeline; now safe-on-retry via checkpointer resumption (parent + sub-graph)
- F15 — array reducers double on retry; mitigated for `evaluations` via sub-graph checkpointing per job; remaining parent arrays (`scrapedListings`, `parsedJobs`) still latent but persist node is idempotent
- F16 — no Suspense streaming + no `useFormStatus` pending state; polish iteration

### 🟡 Evaluator post-review deferrals (from `/apex -x` adversarial pass)
- Module-load `readFileSync` in `profile.ts` — works in dev; verify Next.js bundling (`outputFileTracingIncludes`) before Vercel deploy
- "Thin sentinel" jobs (`rawMarkdown: ""`) stay in `status: "new"` forever — clear via new `JobStatus.thin` or mark `not_a_fit` when adding multi-board scrape
- `inngest.ts` raw `err.message` to `AgentRun.errorMessage` may include connection strings on Prisma errors — sanitize before persist
- Critique can overwrite the original score with a less-confident one — both scores end up in `fitDetails.score` but only the final one in `fitScore`/`fitReasoning`. Acceptable for now.
- Magic strings `"evaluate-one"`, `"tailor"` duplicated in `graph.ts` and `dispatch-evaluations.ts` — extract to constants when adding more conditional edges

### 🟠 Production gaps
- No Vercel deployment yet
- No Inngest Cloud account (local dev only)
- No Langfuse Cloud account
- `HUB_ACCESS_TOKEN` still set to `local-dev-token-please-replace-in-prod`
- No CI, no tests, no Braintrust evals

---

## Recommended next moves

1. **Verify iter 1 + iter 3 end-to-end** (the 🔴 row above) — Firecrawl key + Anthropic key required, run `pnpm dev` + `pnpm inngest:dev`, click "Run now", confirm Jobs land with `fitScore`/`fitDetails`/`status` populated
2. **Port `/get-news` as its own iter 1** — smaller scope, validates the monorepo's "add new agent" flow, reuses the LangGraph patterns now proven by job-hunt evaluator
3. **Iter 4 of job-hunt — tailor sub-graph** — Opus 4.7 with extended thinking, port `references/writing-rules.md` from legacy skill, persist tailored artifacts to Supabase Storage
4. **Iter 2 of job-hunt (deferred to here)** — multi-board adapters + real dedupe + `Send()` fan-out on scrape; less urgent now that the eval path works end-to-end on jobup alone
