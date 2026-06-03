# Agent Hub — Build Plan

> Forward backlog only. Finished work and parked scope have been removed.
> **Order is fixed: do every fix in Phase A first, then build the Phase B features (boards → dedup → observability).**
> Effort tags: **S** ≈ <30 min · **M** ≈ a focused session · **L** ≈ multi-session.

---

## Baseline — what exists today

The `/job-hunt` LangGraph runs **end-to-end locally** on real keys (Firecrawl, Anthropic, Vercel Sandbox):
`scrape (jobup) → persist → deep-scrape JD → evaluator sub-graph (Send fan-out) → tailor sub-graph (plan → draft-resume → draft-cover → ats-check → revise? → render) → Typst PDF`.
PostgresSaver checkpointer + `Send()` fan-out + Anthropic-native structured outputs are in place.

**Dashboard runs on Next 16** (16.2.7 / React 19.2.6) — the `proxy.ts` auth gate now actually executes (it was silently dead on 15.5; see the resolved A2 blocker below). **A2 · Security is complete**: credential redaction, constant-time token compare, open-redirect guard, and Langfuse PII suppression are all in.

**Still not production-real:** not deployed; Langfuse exports nothing (placeholder key); the dedupe node is a no-op; only 1 of 3 boards is live; and both "self-correcting" loops (evaluator critique, tailor revise) are dead. The rest of Phase A (A3–A7) fixes that.

---

## Phase A — Fixes (all of these, before any feature)

Everything here is repairing existing behaviour or paying down a shortcut. No new product capability.

### A2 · Security
- [x] Redact credentials from `AgentRun.errorMessage` before persisting. **Done:** new pure `redactConnString` in `packages/core/src/redact.ts` (registered as `@hub/core/redact` + barrel); two passes (URL userinfo regex + bare-secret env-value sweep), never-throws; wrapped at `inngest.ts:54` capture site (`throw err` still re-throws the original to Inngest's auth-gated logs). Unit-verified. **S**
- [x] Constant-time comparison for the 4 token checks (`proxy.ts:11`, `artifact/route.ts:27`, `agents/job-hunt/actions.ts:11`, `auth/actions.ts:11`). **Done:** all 4 share one runtime-agnostic `safeStrEqual` in `apps/dashboard/lib/safe-equal.ts` (Web Crypto HMAC-SHA256 over a per-process random key → branchless digest compare; no `node:*`/`server-only`, so it's importable from `proxy.ts`). `proxy.ts` is now `async`. Chosen over `node:crypto.timingSafeEqual` because `proxy.ts` was Edge on 15.5; post-Next-16 it runs on Node and the helper keeps working unchanged. **Now actually active** (the gate ran nowhere on 15.5 — see resolved blocker below). Unit-verified. **S**
- [x] Guard the post-login redirect against open-redirect. **Done:** local (un-exported) `sanitizeNext` in `app/auth/actions.ts`, applied once at read; rejects `//`, `/\`, backslashes, encoded `%2f`/`%5c`, non-`/` schemes via string guards + a throwaway-origin `URL` backstop; falls back to `/`. Unit-verified against all those vectors. **S**
- [x] Stop leaking PII to Langfuse. **Done:** added `recordOutputs:false` to `tailor/run-step.ts:47` + `evaluator/run-step.ts:43`, and **both** `recordInputs:false`+`recordOutputs:false` to `evaluator/nodes/extract.ts:26` (it had neither → leaked raw JD *and* requirements). `isEnabled:true` kept so spans/latency/tokens still flow. **S**

> ✅ **A2 blocker — RESOLVED by upgrading to Next 16.** `proxy.ts` was never executed as middleware on Next 15.5 (15.5 only honors `middleware.ts`; `proxy` is the Next **16** convention), so the `/agents/*` gate never ran and the A2-2 hardening was inert. Instead of renaming to `middleware.ts`, we upgraded the dashboard to **Next 16.2.7 / React 19.2.6** (kept `proxy.ts` — now the correct convention). Gate confirmed live: `next build` shows `ƒ Proxy (Middleware)` and `.next/server/functions-config-manifest.json` registers `/_middleware` → `/agents/:path*` on the **Node.js runtime**. Upgrade details: bumped `next`/`react`/`react-dom`/`@types/*`, Node engines → `>=20.9.0`, `next lint` (removed in 16) → no-op lint script, `next build --webpack` (Turbopack fails page-data collection on the `/auth` server-actions page). All v16 async-request-API / `next/image` / removed-config breakers were N/A (verified). `typecheck` + `build` green.

### A3 · Agentic correctness (the dead loops)
- [ ] **Evaluator critique guard** — `critique.ts:28` returns `{score: revised}` unconditionally and the reducer is replace-last, so a misfire can turn a correct 8 into a wrong 4 with no audit trail. Add a floor/clamp (require justified confidence to downgrade) and store the pre-critique score in `fitDetails` (`evaluator/nodes/persist.ts`). **M**
- [ ] **Close the tailor revise loop** — `revise.ts:33` recomputes `postReviseAts` that `tailor/graph.ts:30` then ignores (renders anyway). Loop `revise → ats-check` with a bounded `reviseCount` in `tailor/state.ts`, or deterministically drop the offending bullets before render. **M**
- [ ] **Idempotent state reducers** — `state.ts:27,32,52` use naive `[...a,...b]`; now that the checkpointer is live, a resumed fan-out branch doubles `scrapedListings`/`parsedJobs`/`evaluations`. Key them by `board::slug` / `jobId` (mirror the already-correct keyed `tailorings` reducer at `state.ts:57`). **S**
- [ ] **Single-run guard** — `inngest.ts:10-18` has no `concurrency`/`idempotency`; a manual "Run now" during the 06:00 cron starts two full graphs sharing the one module-level render-sandbox singleton. Add `concurrency:{ limit: 1 }` + an idempotency key. **S**

### A4 · Pipeline robustness
- [ ] **Typed board config** — `scrape.ts:23-24` reads `boardCfg.firecrawl.*` off raw JSON inference; a board without a `firecrawl` block breaks typecheck/runtime. Define a `BoardConfig` type + zod-parse `config.json` with safe defaults. **S** *(prerequisite for adding boards in B1)*
- [ ] **Interleave before truncation** — `parse.ts:41-45` does `parsed.length = JOBHUNT_MAX_JOBS` in board-then-URL order, so with ≥2 boards it silently discards entire later boards. Interleave/round-robin before the cap. **S** *(latent until B1; fix now)*
- [ ] **Listing-scrape timeout** — `scrape.ts:21` sets `waitFor:12000` but passes no Firecrawl `timeout` (deep-scrape does, at 60s). A hung listing can stall the node. **S**
- [ ] **Graceful plan-index degrade** — `plan.ts:68-73` throws on any out-of-range index, failing the whole tailoring; clamp-and-warn (drop the bad selection, keep ≥1 bullet) instead. **S**

### A5 · Deploy blockers
- [ ] **`outputFileTracingIncludes`** in `apps/dashboard/next.config.ts` → `packages/agent-jobhunt/render-assets/**`. Without it, `render/assets.ts`'s module-load `readFileSync` throws `ENOENT` on Vercel and crashes the **entire** Inngest function on import (not just render). **S**
- [ ] **Lift the graph out of one `step.run`** — `route.ts:8` caps `maxDuration=60` while `inngest.ts:29-40` runs scrape + deep-scrape + N evaluators + N tailorings + Typst render in a single step. Raise `maxDuration` (Vercel Pro ceiling) **and** decompose into per-phase Inngest steps so the checkpointer actually resumes on retry instead of re-paying Firecrawl/Anthropic. **L** *(raise alone is S as a stopgap)*

### A6 · UX, docs, hygiene
- [ ] Add `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx` (the job-hunt page does 3 awaited DB queries with no boundary). **S**
- [ ] Run-now feedback — convert the button to `useActionState`/`useFormStatus` so enqueue success/failure + pending state are visible (`app/agents/job-hunt/page.tsx:46-61`, `actions.ts`). **M**
- [ ] PDF links download instead of navigating away — pass `{ download: filename }` to `createSignedUrl` (`artifact/route.ts:55-56`) + `target=_blank` on the links (`page.tsx:141`). **S**
- [ ] Rewrite `README.md:11-14` — drop "(coming soon)" on `agent-jobhunt` and the phantom `agent-news` package; describe the real pipeline. **S**
- [ ] Remove dead `_planned.select_iter3` block from `config.json:21-26`; rename `MIN_MARKDOWN_BYTES` → `MIN_MARKDOWN_CHARS` (it's `md.length`, a char count) in `scrape.ts`/`deep-scrape.ts`. **S**

### A7 · Safety net
- [ ] Minimal CI — `.github/workflows/ci.yml` running `pnpm install → typecheck → build` on PR (would have caught A5). **S**
- [ ] A few unit tests on pure logic that the rest depends on: `resumeDraftToYaml` (array↔map), `checkAts` heuristics, `KIND_TO_COLUMN` artifact mapping. Add `vitest` at root. **M**

---

## Phase B — Features (only after Phase A is done)

### B1 · Multi-board scrape
- [ ] **Enable jobs.ch** — add a `jobsch` block under `config.json` `boards` (`listing_urls` + `firecrawl`). The adapter (`boards/jobcloud.ts:115`) and registry (`boards/index.ts:6`) already exist; the config `boardId` **must** equal the adapter key `jobsch`. **S**
- [ ] **swissdevjobs adapter** — new `packages/agent-jobhunt/src/boards/swissdevjobs.ts` implementing `BoardAdapter` (`boards/types.ts:14`); it's not a JobCloud platform so it needs its own card/detail-URL parser (the `makeJobcloudParser` regex won't apply). Register in `boards/index.ts` + add a config block. **M**

### B2 · Cross-board dedupe (activates the dead `fingerprint`/`duplicateOf`/`JobStatus.duplicate` columns)
- [ ] **Exact-match tier (no migration needed — columns exist):** replace `dedupePlaceholder` (`nodes/placeholders.ts:4-15`) with a real `nodes/dedupe.ts`, wired at `graph.ts:26`. Compute `fingerprint = sha1(normalize(company) | normalize(city) | jdBody.slice(0,800))` (`node:crypto`), write it to each Job, group by fingerprint, keep the earliest `firstSeenAt` as canonical, `updateMany` the rest to `status='duplicate', duplicateOfId`. Skip empty-`rawMarkdown` thin sentinels. No edge change: `dispatch-evaluations.ts:12-19` already re-queries `status:'new'`, so duplicates fall out of eval + tailor for free. **M**
- [ ] **Semantic tier (pgvector):** enable the `vector` extension (raw SQL migration — `db:push` fights the `checkpoint_*` tables), add `embedding Unsupported("vector(1536)")` + an HNSW index to `Job`, add `packages/core/src/embed.ts`, and run a cosine-KNN threshold query in the dedupe node to catch the same role with different board boilerplate (the case SHA1 misses). **L**
- [ ] Add a `duplicateCount` annotation to `state.ts` so `finalize`/dashboard can report dupes removed. **S**

### B3 · Observability (activates the dead `costUsd`/`langfuseTraceId` columns)
- [ ] **Write `langfuseTraceId`** — capture the active OTel trace id at run start and persist it in create-agent-run (`inngest.ts:22-26`, `schema.prisma:35`). The dashboard already renders `r.langfuseTraceId` (`page.tsx:89`) as a dead `—`; turn it into a deep-link to the trace. **S**
- [ ] **Write `costUsd`** — return AI SDK `usage` from the evaluator/tailor run-steps, sum tokens→$ across all `generateObject` calls, write on complete-agent-run (`inngest.ts:42-47`, `schema.prisma:34`). Surface per-run cost on the dashboard. **M**
- [ ] Confirm a real run produces a shareable Langfuse trace (depends on A1 keys) — this is the project's missing **evidence surface**. **S**

---

## Parked (not now)
- **`/get-news` agent** (whole Phase 3) — descoped for the moment.
- UI polish (Tailwind/shadcn replacing inline styles), golden-set evals harness, Prisma migration history baseline — revisit after Phase B.
