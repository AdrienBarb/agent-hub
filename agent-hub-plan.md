# Agent Hub — Build Plan

> Forward backlog only. Finished work and parked scope have been removed.
> **Phase A (fixes) is complete.** The backlog below is the deferred Phase-A infra item + Phase B features.
> Effort tags: **S** ≈ <30 min · **M** ≈ a focused session · **L** ≈ multi-session.

---

## Baseline — what exists today

The `/job-hunt` LangGraph runs **end-to-end locally** on real keys (Firecrawl, Anthropic, Vercel Sandbox):
`scrape (jobup) → persist → deep-scrape JD → evaluator sub-graph (Send fan-out) → tailor sub-graph (plan → draft-resume → draft-cover → ats-check → revise? → render) → Typst PDF`.
PostgresSaver checkpointer + `Send()` fan-out + Anthropic-native structured outputs are in place. The dashboard runs on **Next 16.2.7 / React 19.2.6** with the `proxy.ts` auth gate live.

**Phase A is complete** — A2 (security), A3 (agentic correctness / the dead loops), A4 (pipeline robustness), A5 (deploy blockers), A6 (UX, docs, hygiene), A7 (CI + unit tests). A GitHub Actions CI (`install → typecheck → build → test`) + a root vitest suite now guard the code.

**Still not production-real:** not deployed (CI is green but no Vercel project wired yet); Langfuse exports nothing (placeholder key); the dedupe node is a no-op; only 1 of 3 boards is live. Those are Phase B below.

---

## Deferred from Phase A

- [ ] **Lift the graph out of one `step.run`** — `inngest.ts` runs the whole graph (scrape + deep-scrape + N evaluators + N tailorings + Typst render) inside a single `step.run("invoke-graph")`. `maxDuration` is already raised to 800s (that was the actual deploy blocker, and it's fixed), but decomposing into per-phase Inngest steps would let each phase retry/resume independently instead of re-entering `.invoke()` from the checkpoint. Deferred because it's risky: it needs the graph's phases exposed out of `graph.ts` and touches the module-level render-sandbox singleton + the keyed-array reducer retry semantics. **L**

---

## Phase B — Features

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
- [ ] Confirm a real run produces a shareable Langfuse trace (depends on real Langfuse keys) — this is the project's missing **evidence surface**. **S**

---

## Parked (not now)
- **`/get-news` agent** (whole Phase 3) — descoped for the moment.
- UI polish (Tailwind/shadcn replacing inline styles), golden-set evals harness, Prisma migration history baseline — revisit after Phase B.
