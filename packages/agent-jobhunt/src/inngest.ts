import "server-only";
import { inngest } from "@hub/core/inngest";
import { db } from "@hub/core/db";
import { flushLangfuse } from "@hub/core/langfuse";
import { redactConnString } from "@hub/core/redact";
import { jobHuntGraph } from "./graph";
import { setupCheckpointer } from "./checkpointer";
import { disposeRenderSandbox } from "./render";
import { manifest } from "./manifest";

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
        };
      });

      await step.run("complete-agent-run", async () => {
        await db.agentRun.update({
          where: { id: run.id },
          data: { status: "completed", finishedAt: new Date() },
        });
      });

      await step.run("flush-langfuse", () => flushLangfuse());

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
      await step.run("fail-agent-run", async () => {
        await db.agentRun.update({
          where: { id: run.id },
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
