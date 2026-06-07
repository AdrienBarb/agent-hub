import "server-only";
import { inngest } from "@hub/core/inngest";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import { flushLangfuse } from "@hub/core/langfuse";
import { redactConnString } from "@hub/core/redact";
import { ingestGraph } from "./graph";
import { evaluatorSubgraph } from "./evaluator/graph";
import { tailorSubgraph } from "./tailor/graph";
import { setupCheckpointer } from "./checkpointer";
import { acquireRenderSandbox, releaseRenderSandbox } from "./render";
import { disposeLinkedinSession } from "./boards/linkedin";
import { manifest } from "./manifest";
import { notifyRunComplete, notifyRunFailed } from "./notify";
import { keyOfWarning, makeWarning, type RunWarning } from "./warnings";

// Native cross-invocation concurrency cap for the LLM-heavy child functions:
// across ALL evaluate + tailor child runs account-wide, at most
// LLM_MAX_CONCURRENCY hit Anthropic at once (one shared virtual "anthropic"
// queue). This is Inngest's replacement for an in-process limiter — it spans
// separate invocations/processes, which an in-process semaphore can't. Each
// child run makes its subgraph's LLM calls sequentially, so the effective cap is
// ~limit concurrent Anthropic calls.
const ANTHROPIC_CONCURRENCY = {
  scope: "account" as const,
  key: `"anthropic"`,
  limit: env.LLM_MAX_CONCURRENCY,
};

// Merge soft-failure warnings from the phases, last-write-wins per stable key —
// mirrors the keyed `warnings` reducer the single graph used (state.ts), so two
// sources can't double-count an already-reported warning.
function dedupeWarnings(warnings: RunWarning[]): RunWarning[] {
  const byKey = new Map<string, RunWarning>();
  for (const w of warnings) byKey.set(keyOfWarning(w), w);
  return [...byKey.values()];
}

// CHILD — evaluate one job. Triggered by `jobhunt/job.evaluate`, fanned out
// (one run per scraped job) by the orchestrator's step.invoke. Its own
// invocation + retries; on failure after retries the orchestrator catches it and
// records an eval_failed warning. The evaluator subgraph's persist node writes
// fitScore + status (evaluated | not_a_fit). A child retry resumes the subgraph
// from its PostgresSaver checkpoint (thread_id), not from scratch.
export const evaluateJob = inngest.createFunction(
  {
    id: "jobhunt-evaluate-job",
    name: "Job Hunt — evaluate one job",
    concurrency: ANTHROPIC_CONCURRENCY,
    retries: 3,
  },
  { event: "jobhunt/job.evaluate" },
  async ({ event }) => {
    const { runId, jobId } = event.data as { runId: string; jobId: string };
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { rawMarkdown: true },
    });
    if (!job?.rawMarkdown) {
      // The orchestrator only dispatches jobs that had rawMarkdown; a missing
      // one means it changed since dispatch — nothing to evaluate.
      return { jobId, evaluated: false };
    }
    const result = await evaluatorSubgraph.invoke(
      { jobId, rawMarkdown: job.rawMarkdown },
      { configurable: { thread_id: `${runId}::${jobId}` } },
    );
    if (!result.finalScore || !result.finalStatus) {
      throw new Error(`evaluator subgraph returned no score/status for ${jobId}`);
    }
    return { jobId, evaluated: true, status: result.finalStatus };
  },
);

// CHILD — tailor one job. Triggered by `jobhunt/job.tailor`, fanned out (one run
// per above-threshold job). Each run leases the warm render sandbox for the
// duration of its render (refcounted in render/sandbox.ts) so co-located
// concurrent runs under Fluid Compute share it safely. render is best-effort and
// never throws, so a missing PDF surfaces via the orchestrator's render_failed
// DB count, not here.
export const tailorJob = inngest.createFunction(
  {
    id: "jobhunt-tailor-job",
    name: "Job Hunt — tailor one job",
    concurrency: ANTHROPIC_CONCURRENCY,
    retries: 3,
  },
  { event: "jobhunt/job.tailor" },
  async ({ event }) => {
    const { runId, jobId } = event.data as { runId: string; jobId: string };
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { rawMarkdown: true, fitDetails: true },
    });
    if (!job?.rawMarkdown) {
      return { jobId, tailored: false };
    }
    acquireRenderSandbox();
    try {
      const result = await tailorSubgraph.invoke(
        { jobId, rawMarkdown: job.rawMarkdown, fitDetails: job.fitDetails },
        { configurable: { thread_id: `${runId}::${jobId}::tailor` } },
      );
      if (!result.finalStatus) {
        throw new Error(`tailor subgraph returned no finalStatus for ${jobId}`);
      }
      return { jobId, tailored: true };
    } finally {
      await releaseRenderSandbox();
    }
  },
);

export const jobHuntDailyRun = inngest.createFunction(
  {
    id: "job-hunt-daily-run",
    name: "Job Hunt — daily run",
    // One run in flight at a time. A manual "Run now" during the 06:00 cron
    // (or a double-click) is SKIPPED, not queued — two overlapping runs would
    // race the Job upserts and double-pay Firecrawl/Anthropic. `skip` (not a
    // concurrency queue) drops the redundant trigger; a legitimate manual re-run
    // LATER (nothing in flight) still works, which a 24h idempotency key would
    // have blocked.
    singleton: { mode: "skip" },
    // Hard-failure Slack alert. onFailure fires ONCE after all retries are
    // exhausted — unlike the per-attempt catch below, which would spam Slack up
    // to 5×. It redacts and sends the run's own terminal error directly (no DB
    // lookup, so it can't mis-attribute a stale/concurrent run). Best-effort:
    // guarded so a Slack hiccup never throws out of the failure handler.
    onFailure: async ({ error, event }) => {
      try {
        const message = redactConnString(
          error instanceof Error ? error.message : String(error),
        );
        await notifyRunFailed({ runId: event.data.run_id, message });
      } catch (notifyErr) {
        console.error(
          "[job-hunt] onFailure notify failed (best-effort):",
          notifyErr instanceof Error ? notifyErr.message : notifyErr,
        );
      }
    },
  },
  [
    { cron: `TZ=${manifest.timezone} ${manifest.cron}` },
    { event: "jobhunt/run.requested" },
  ],
  async ({ step, logger }) => {
    await step.run("setup-checkpointer", () => setupCheckpointer());

    const run = await step.run("create-agent-run", async () => {
      return db.agentRun.create({
        data: { agentSlug: manifest.slug, status: "running" },
      });
    });

    try {
      // PHASE 1 — ingest (scrape → parse → persist → deep-scrape → dedupe) as ONE
      // step = one Vercel invocation. The LinkedIn Browserbase session is created
      // here, so it must be disposed in THIS invocation's process (deep-scrape
      // closes it on the happy path; this finally is the safety net). The
      // orchestrator's catch runs in a DIFFERENT invocation, so it can't see this
      // process's session singleton.
      const ingest = await step.run("ingest", async () => {
        try {
          const final = await ingestGraph.invoke(
            { runId: run.id },
            { configurable: { thread_id: `${run.id}::ingest` } },
          );
          return {
            persistedCount: final.persistedCount ?? 0,
            parsedCount: final.parsedJobs?.length ?? 0,
            warnings: final.warnings ?? [],
          };
        } finally {
          await disposeLinkedinSession().catch((e) =>
            console.error(
              "[job-hunt] dispose linkedin session failed (best-effort):",
              e instanceof Error ? e.message : e,
            ),
          );
        }
      });

      // PHASE 2 — evaluate: fan out one child run per scraped job. Each is its
      // own invocation with its own retries; Anthropic concurrency is capped
      // account-wide by the child's "anthropic" key. The job-id set is memoized
      // (list-new-jobs step) so the fan-out is deterministic across replays, and
      // each step.invoke memoizes — so the count + warnings here are retry-stable.
      const newJobs = await step.run("list-new-jobs", () =>
        db.job.findMany({
          where: { runId: run.id, status: "new", rawMarkdown: { not: null } },
          select: { id: true },
        }),
      );
      const evalWarnings: RunWarning[] = [];
      const evalResults = await Promise.all(
        newJobs.map((j) =>
          step
            .invoke(`evaluate-${j.id}`, {
              function: evaluateJob,
              data: { runId: run.id, jobId: j.id },
            })
            // Count only jobs the child actually evaluated — a child whose row
            // vanished between dispatch and run returns { evaluated: false }.
            .then((r) => r.evaluated === true)
            .catch((err) => {
              console.error(
                `[job-hunt] evaluate ${j.id} failed:`,
                err instanceof Error ? err.message : err,
              );
              evalWarnings.push(
                makeWarning("eval_failed", "evaluate-one", { detail: j.id }),
              );
              return false;
            }),
        ),
      );
      const evaluatedCount = evalResults.filter(Boolean).length;

      // PHASE 3 — tailor: fan out one child run per above-threshold job
      // (status="evaluated", written by the evaluator persist node in phase 2).
      const evaluatedJobs = await step.run("list-evaluated-jobs", () =>
        db.job.findMany({
          where: {
            runId: run.id,
            status: "evaluated",
            rawMarkdown: { not: null },
          },
          select: { id: true },
        }),
      );
      const tailorWarnings: RunWarning[] = [];
      const tailorResults = await Promise.all(
        evaluatedJobs.map((j) =>
          step
            .invoke(`tailor-${j.id}`, {
              function: tailorJob,
              data: { runId: run.id, jobId: j.id },
            })
            .then((r) => r.tailored === true)
            .catch((err) => {
              console.error(
                `[job-hunt] tailor ${j.id} failed:`,
                err instanceof Error ? err.message : err,
              );
              tailorWarnings.push(
                makeWarning("tailor_failed", "tailor-one", { detail: j.id }),
              );
              return false;
            }),
        ),
      );
      const tailoredCount = tailorResults.filter(Boolean).length;

      // render_failed recovery: render runs inside the tailor subgraph and is
      // best-effort (never throws), so a failed PDF can't bubble a warning. A DB
      // count of this-run tailored jobs without a resume PDF is retry-stable.
      const renderFailed = await step.run("count-render-failed", () =>
        db.job.count({
          where: {
            runId: run.id,
            status: "tailored",
            resumePdfStoragePath: null,
          },
        }),
      );

      const result = {
        persistedCount: ingest.persistedCount,
        parsedCount: ingest.parsedCount,
        evaluatedCount,
        tailoredCount,
        warnings: dedupeWarnings([
          ...ingest.warnings,
          ...evalWarnings,
          ...tailorWarnings,
          ...(renderFailed > 0
            ? [makeWarning("render_failed", "render", { count: renderFailed })]
            : []),
        ]),
      };

      await step.run("complete-agent-run", async () => {
        await db.agentRun.update({
          where: { id: run.id },
          data: { status: "completed", finishedAt: new Date() },
        });
      });

      // Best-effort: a Langfuse outage that survives all step retries must NOT
      // throw into the catch, which would flip this completed run to failed.
      await step.run("flush-langfuse", async () => {
        try {
          await flushLangfuse();
        } catch (flushErr) {
          console.error(
            "[job-hunt] flush-langfuse failed (best-effort):",
            flushErr instanceof Error ? flushErr.message : flushErr,
          );
        }
      });

      // Slack digest in its OWN step ⇒ Inngest memoizes it ⇒ fires at most once
      // even if a later step/retry replays. Best-effort so a Slack/DB hiccup
      // never flips a completed run to failed.
      await step.run("notify-slack-complete", async () => {
        try {
          const [opportunities, scrapedJobs] = await Promise.all([
            db.job.findMany({
              where: {
                runId: run.id,
                status: "tailored",
                tailoredAt: { gte: new Date(run.startedAt) },
              },
              orderBy: { fitScore: "desc" },
              select: {
                title: true,
                company: true,
                city: true,
                url: true,
                fitScore: true,
                fitReasoning: true,
              },
            }),
            db.job.findMany({
              where: { runId: run.id },
              orderBy: [{ board: "asc" }, { title: "asc" }],
              select: {
                board: true,
                title: true,
                company: true,
                status: true,
              },
            }),
          ]);

          await notifyRunComplete({
            evaluatedCount: result.evaluatedCount,
            opportunities: opportunities.map((o) => ({
              title: o.title,
              company: o.company,
              city: o.city,
              url: o.url,
              fitScore: o.fitScore != null ? Number(o.fitScore) : null,
              fitReasoning: o.fitReasoning,
            })),
            scrapedJobs,
            warnings: result.warnings,
            includeScrapedList: env.JOBHUNT_NOTIFY_SCRAPED_LIST,
          });
        } catch (notifyErr) {
          console.error(
            "[job-hunt] notify-slack-complete failed (best-effort):",
            notifyErr instanceof Error ? notifyErr.message : notifyErr,
          );
        }
      });

      logger.info("job-hunt complete", result);
      return { runId: run.id, ...result };
    } catch (err) {
      // Redact DB conn-string creds / secret env values before they land in the
      // dashboard-visible AgentRun.errorMessage. `throw err` below re-throws the
      // ORIGINAL (unredacted) error to Inngest's own auth-gated logs.
      const message = redactConnString(
        err instanceof Error ? err.message : String(err),
      );
      // Resource disposal happens inside the step that owns the resource — the
      // ingest step disposes the LinkedIn session, each tailorJob releases its
      // sandbox lease — and those run in their own invocations/processes, so
      // there is nothing process-local to clean up here.
      await step.run("fail-agent-run", async () => {
        // Guard on status:"running" so a post-completion best-effort step that
        // somehow threw can never overwrite an already-completed run as failed.
        await db.agentRun.updateMany({
          where: { id: run.id, status: "running" },
          data: {
            status: "failed",
            finishedAt: new Date(),
            errorMessage: message,
          },
        });
      });
      await step.run("flush-langfuse-on-error", () => flushLangfuse());
      throw err;
    }
  },
);

export const jobHuntFunctions = [jobHuntDailyRun, evaluateJob, tailorJob];
