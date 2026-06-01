# Job-Hunt — Iteration Notes

## Iteration 1 status (current)

**Working**: scaffold, jobup.ch scraper (Firecrawl), parse + filter + keyword score, persist to Postgres (race-safe upsert with skip-if-seen-today in Europe/Zurich), Inngest cron (`0 6 * * *`) + manual trigger event, dashboard page with auth-gated "Run now" button.

**Placeholder nodes** (pass-through): `dedupe`, `evaluate`, `tailor`, `render`.

## Findings deferred from adversarial review

These are real concerns intentionally left for later iterations. Don't lose track.

### F14 — `step.run("invoke-graph")` wraps the entire pipeline (BLOCKING for retries)

Today the whole graph executes inside one Inngest step. If the step retries, scrape re-pays Firecrawl credits and the graph restarts from node 1. Tolerable now because (a) the graph is small and (b) persist is idempotent via upsert + skip-if-seen-today.

**Fix in iter 2**: wrap each node in its own `step.run`, OR wire a `PostgresSaver` checkpointer on `jobHuntGraph.compile({ checkpointer })` so re-invocation resumes from the last completed node via `thread_id`.

### F15 — Array reducers concat on retry (footgun for checkpointer)

`scrapedListings` and `parsedJobs` use `[...a, ...b]` reducers — correct for fan-out, **wrong** when a single node retries (would double the array). The current code never retries a node, so it's safe today. The footgun activates the moment we add a checkpointer.

**Fix in iter 2**: switch to keyed-by-source-node maps with replace semantics, e.g. `parsedJobs: Map<board, ParsedJob[]>` with `(a, b) => ({ ...a, ...b })` reducer.

### F16 — Polish: Suspense streaming + form pending state

`/agents/job-hunt` does two awaits before rendering. Could stream the header instantly and put each section in a `<Suspense>` boundary. The Run-now button has no pending state — double-click queues two events.

**Fix in polish iteration**: extract `<RecentRuns />` and `<RecentJobs />` as async server components in `<Suspense>`. Make the button a client component using `useActionState` + `useFormStatus`.

## Roadmap of future iterations

| Iter | Adds |
|---|---|
| 2 | `swissdevjobs` + `jobsch` adapters (jobsch parser already in `boards/jobcloud.ts`), real `dedupe` node (fingerprint + pgvector), checkpointer + per-node `step.run`, fix F15 reducer pattern |
| 3 | Real `evaluate` subgraph: Sonnet 4.6 fit scoring with structured output, self-critique loop, writes `fitScore` + `fitReasoning` to Job |
| 4 | Real `tailor` subgraph: Opus 4.7 for resume + cover letter, ATS check, humanizer rules |
| 5 | Real `render` node: Typst PDF compilation via Vercel Sandbox, ATS validation, Supabase Storage upload, `rawMarkdownUrl` populated for deep-scraped JDs |
| Polish | F16 (streaming + pending state), Braintrust eval suite, public Langfuse traces in README |
