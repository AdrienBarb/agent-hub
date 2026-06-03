import "server-only";
import { inngest } from "@hub/core/inngest";
import { db } from "@hub/core/db";
import { flushLangfuse } from "@hub/core/langfuse";
import { jobHuntGraph } from "./graph";
import { setupCheckpointer } from "./checkpointer";
import { disposeRenderSandbox } from "./render";
import { manifest } from "./manifest";

export const jobHuntDailyRun = inngest.createFunction(
  {
    id: "job-hunt-daily-run",
    name: "Job Hunt — daily run",
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
      const result = await step.run("invoke-graph", async () => {
        const final = await jobHuntGraph.invoke(
          { runId: run.id },
          { configurable: { thread_id: run.id } },
        );
        return {
          persistedCount: final.persistedCount ?? 0,
          skippedCount: final.skippedCount ?? 0,
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
      const message = err instanceof Error ? err.message : String(err);
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
