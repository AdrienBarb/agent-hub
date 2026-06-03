import "server-only";
import { Send } from "@langchain/langgraph";
import { db } from "@hub/core/db";
import { JobStatus, type Prisma } from "@hub/core/prisma";
import { tailorSubgraph } from "../tailor/graph";
import type { JobHuntStateType } from "../state";

type TailorPayload = {
  runId: string;
  jobId: string;
  rawMarkdown: string;
  fitDetails: Prisma.JsonValue;
};

export async function postEvalFanInNode(
  _state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  return {};
}

export async function dispatchTailoringsEdge(
  state: JobHuntStateType,
): Promise<Send[] | string> {
  const jobs = await db.job.findMany({
    where: {
      runId: state.runId,
      status: "evaluated",
      rawMarkdown: { not: null },
    },
    select: { id: true, rawMarkdown: true, fitDetails: true },
  });

  const tailorable = jobs.filter(
    (j): j is { id: string; rawMarkdown: string; fitDetails: Prisma.JsonValue } =>
      typeof j.rawMarkdown === "string" && j.rawMarkdown.length > 0,
  );

  if (tailorable.length === 0) {
    console.log(
      "[dispatch-tailorings] no jobs above threshold, skipping to render",
    );
    return "render";
  }

  console.log(
    `[dispatch-tailorings] dispatching ${tailorable.length} parallel tailorings`,
  );

  return tailorable.map(
    (j) =>
      new Send("tailor-one", {
        runId: state.runId,
        jobId: j.id,
        rawMarkdown: j.rawMarkdown,
        fitDetails: j.fitDetails,
      }),
  );
}

export async function tailorOneNode(
  state: JobHuntStateType,
): Promise<Partial<JobHuntStateType>> {
  const { jobId, rawMarkdown, fitDetails, runId } =
    state as unknown as TailorPayload;
  const threadId = `${runId}::${jobId}::tailor`;

  try {
    const result = await tailorSubgraph.invoke(
      { jobId, rawMarkdown, fitDetails },
      { configurable: { thread_id: threadId } },
    );

    if (!result.finalStatus) {
      throw new Error(`subgraph returned no finalStatus`);
    }

    return {
      tailorings: { [jobId]: { jobId, status: JobStatus.tailored } },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tailor-one] ${jobId} failed: ${message}`);
    return {
      tailorings: { [jobId]: { jobId, status: "failed" } },
    };
  }
}
