import "server-only";
import { db } from "@hub/core/db";
import { env } from "@hub/core/env";
import { JobStatus, Prisma } from "@hub/core/prisma";
import { reconcileScore } from "../reconcile";
import type { EvaluatorStateType } from "../state";

export async function persistNode(
  state: EvaluatorStateType,
): Promise<Partial<EvaluatorStateType>> {
  if (!state.requirements || !state.comparison || !state.score) {
    throw new Error(`[evaluate/persist] ${state.jobId}: incomplete state`);
  }

  // Reconcile the (immutable) baseline score against the raw critique under the
  // tiered confidence guard. Pure + idempotent: both inputs are write-once, so
  // a checkpointer replay yields the same result. `critiqueScore` is undefined
  // on the high-confidence path (critique skipped) → returns the baseline.
  const { score: final, decision, delta } = reconcileScore(
    state.score,
    state.critiqueScore,
    env.JOBHUNT_FIT_THRESHOLD,
  );

  const status: JobStatus =
    final.fitScore >= env.JOBHUNT_FIT_THRESHOLD
      ? JobStatus.evaluated
      : JobStatus.not_a_fit;

  const fitDetails: Prisma.InputJsonValue = {
    requirements: state.requirements,
    comparison: state.comparison,
    score: final,
    // Audit trail: preserve the pre-critique score and what the critique tried
    // to do, so a flip (e.g. 8 -> clamped 5) is fully explainable. null when
    // critique didn't run.
    scoreBeforeCritique: state.critiqueScore ? state.score : null,
    critique: state.critiqueScore
      ? { raw: state.critiqueScore, decision, delta }
      : null,
  };

  await db.job.update({
    where: { id: state.jobId },
    data: {
      fitScore: final.fitScore,
      fitReasoning: final.reasoning,
      fitDetails,
      status,
    },
  });

  console.log(
    `[evaluate/persist] ${state.jobId} → status=${status} fitScore=${final.fitScore} decision=${decision}`,
  );

  return { finalStatus: status, finalScore: final };
}
