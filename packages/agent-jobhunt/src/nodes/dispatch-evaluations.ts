import "server-only";
import { Send } from "@langchain/langgraph";
import { db } from "@hub/core/db";
import { evaluatorSubgraph } from "../evaluator/graph";
import type { JobHuntStateType } from "../state";
import { makeWarning } from "../warnings";

type EvaluatePayload = { jobId: string; rawMarkdown: string };

export async function dispatchEvaluationsEdge(
  state: JobHuntStateType,
): Promise<Send[] | string> {
  const jobs = await db.job.findMany({
    where: {
      runId: state.runId,
      status: "new",
      rawMarkdown: { not: null },
    },
    select: { id: true, rawMarkdown: true },
  });

  const evaluable = jobs.filter(
    (j): j is { id: string; rawMarkdown: string } =>
      typeof j.rawMarkdown === "string" && j.rawMarkdown.length > 0,
  );

  if (evaluable.length === 0) {
    console.log(
      "[dispatch-evaluations] no jobs need evaluation, skipping to post-eval",
    );
    return "post-eval";
  }

  console.log(
    `[dispatch-evaluations] dispatching ${evaluable.length} parallel evaluations`,
  );

  return evaluable.map(
    (j) =>
      new Send("evaluate-one", {
        jobId: j.id,
        rawMarkdown: j.rawMarkdown,
      }),
  );
}

export async function evaluateOneNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const { jobId, rawMarkdown } = state as unknown as EvaluatePayload;
  const threadId = `${state.runId}::${jobId}`;

  try {
    const result = await evaluatorSubgraph.invoke(
      { jobId, rawMarkdown },
      { configurable: { thread_id: threadId } },
    );

    if (!result.score || !result.finalStatus) {
      throw new Error(`subgraph returned no score/status`);
    }

    return {
      evaluations: [
        {
          jobId,
          // Reconciled (post-critique) score; falls back to the baseline if the
          // critique path was skipped.
          fitScore: (result.finalScore ?? result.score).fitScore,
          status: result.finalStatus,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[evaluate-one] ${jobId} failed: ${message}`);
    // Closes the worst gap: a crashed eval was indistinguishable from "no
    // content" — the job silently stayed `new` and never tailored.
    return {
      evaluations: [],
      warnings: [makeWarning("eval_failed", "evaluate-one", { detail: jobId })],
    };
  }
}
