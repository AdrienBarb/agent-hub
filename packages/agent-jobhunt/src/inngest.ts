import "server-only";
import { inngest } from "@hub/core/inngest";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import { flushLangfuse } from "@hub/core/langfuse";
import { redactConnString } from "@hub/core/redact";
import { jobHuntGraph } from "./graph";
import { setupCheckpointer } from "./checkpointer";
import { disposeRenderSandbox } from "./render";
import { disposeLinkedinSession } from "./boards/linkedin";
import { manifest } from "./manifest";
import { notifyRunComplete, notifyRunFailed } from "./notify";

export const jobHuntDailyRun = inngest.createFunction(
  {
    id: "job-hunt-daily-run",
    name: "Job Hunt — daily run",
    // One run in flight at a time. A manual "Run now" during the 06:00 cron
    // (or a double-click) is SKIPPED, not queued — two overlapping graphs would
    // share the module-level render-sandbox singleton (render/sandbox.ts), so
    // one run's finalize would dispose the sandbox the other is still using;
    // they'd also double-pay Firecrawl/Anthropic and race the Job upserts.
    // `skip` (not a concurrency queue) drops the redundant trigger rather than
    // re-running the whole pipeline; a legitimate manual re-run LATER (nothing
    // in flight) still works, which a 24h idempotency key would have blocked.
    singleton: { mode: "skip" },
    // Hard-failure Slack alert. onFailure fires ONCE after all retries are
    // exhausted — unlike the per-attempt catch below, which would spam Slack up
    // to 5×. It redacts and sends the run's own terminal error directly (no DB
    // lookup, so it can't mis-attribute a stale/concurrent run). Best-effort:
    // guarded so a Slack hiccup never throws out of the failure handler.
    onFailure: async ({ error, event }) => {
      try {
        // `error` IS this run's terminal error (onFailure is scoped to the run
        // that failed), so redact it directly — do NOT query "latest failed
        // AgentRun", which can borrow a stale prior-day or concurrent run's row.
        // `event.data.run_id` is Inngest's run id (links to its full logs).
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
      // The whole graph runs inside ONE Inngest step. Full per-phase step
      // decomposition is deferred (L): the PostgresSaver checkpointer
      // (thread_id: run.id) already resumes graph-internal state when this step
      // retries and re-enters .invoke(), and splitting it would mean exposing
      // the graph's phases out of graph.ts AND would risk the module-level
      // render-sandbox singleton (render/sandbox.ts) plus the keyed-array
      // reducer retry semantics. maxDuration=800 (route.ts) is the stopgap that
      // lets a full run fit in one step.
      const result = await step.run("invoke-graph", async () => {
        const final = await jobHuntGraph.invoke(
          { runId: run.id },
          { configurable: { thread_id: run.id } },
        );
        return {
          persistedCount: final.persistedCount ?? 0,
          parsedCount: final.parsedJobs?.length ?? 0,
          evaluatedCount: final.evaluations?.length ?? 0,
          tailoredCount: Object.values(final.tailorings ?? {}).filter(
            (t) => t.status === "tailored",
          ).length,
          warnings: final.warnings ?? [],
        };
      });

      await step.run("complete-agent-run", async () => {
        await db.agentRun.update({
          where: { id: run.id },
          data: { status: "completed", finishedAt: new Date() },
        });
      });

      // Best-effort like the notify step below: a Langfuse outage that survives
      // all step retries must NOT throw into the catch, which would flip this
      // already-completed run to failed and fire a false 🚨 alert.
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
      // even if a later step/retry replays. Wrapped best-effort so a Slack or DB
      // hiccup never flips a completed run to failed.
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
      // ORIGINAL (unredacted) error to Inngest's own auth-gated logs for debugging.
      const message = redactConnString(
        err instanceof Error ? err.message : String(err),
      );
      // Safety net: the finalize node disposes the warm sandbox on the happy
      // path; if the graph threw before reaching it, tear it down here too.
      await step.run("dispose-render-sandbox", () => disposeRenderSandbox());
      // Likewise the LinkedIn Browserbase session — deep-scrape's finally closes
      // it on the happy path; close it here too if the graph threw earlier. Both
      // are idempotent, so calling either twice is safe.
      await step.run("dispose-browserbase-session", () => disposeLinkedinSession());
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

export const jobHuntFunctions = [jobHuntDailyRun];
