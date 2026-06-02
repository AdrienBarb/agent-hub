import "server-only";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import { JobStatus, Prisma } from "@hub/core/prisma";
import type { EvaluatorStateType } from "../state";

export async function persistNode(
  state: EvaluatorStateType,
): Promise<Partial<EvaluatorStateType>> {
  if (!state.requirements || !state.comparison || !state.score) {
    throw new Error(`[evaluate/persist] ${state.jobId}: incomplete state`);
  }

  const status: JobStatus =
    state.score.fitScore >= env.JOBHUNT_FIT_THRESHOLD
      ? JobStatus.evaluated
      : JobStatus.not_a_fit;

  const fitDetails: Prisma.InputJsonValue = {
    requirements: state.requirements,
    comparison: state.comparison,
    score: state.score,
  };

  await db.job.update({
    where: { id: state.jobId },
    data: {
      fitScore: state.score.fitScore,
      fitReasoning: state.score.reasoning,
      fitDetails,
      status,
    },
  });

  console.log(
    `[evaluate/persist] ${state.jobId} → status=${status} fitScore=${state.score.fitScore}`,
  );

  return { finalStatus: status };
}
