import "server-only";
import { SCORE_SYSTEM } from "../prompts";
import { runEvaluatorStep } from "../run-step";
import { ScoreSchema } from "../schemas";
import type { EvaluatorStateType } from "../state";

export async function scoreNode(
  state: EvaluatorStateType,
): Promise<Partial<EvaluatorStateType>> {
  if (!state.requirements || !state.comparison) {
    throw new Error(`[evaluate/score] ${state.jobId}: prior steps incomplete`);
  }

  const score = await runEvaluatorStep({
    functionId: "jobhunt/evaluate/score",
    systemInstructions: SCORE_SYSTEM,
    userContent: `Requirements:\n${JSON.stringify(state.requirements, null, 2)}\n\nComparison:\n${JSON.stringify(state.comparison, null, 2)}`,
    schema: ScoreSchema,
  });

  console.log(
    `[evaluate/score] ${state.jobId} score=${score.fitScore} confidence=${score.confidence}`,
  );

  return { score };
}
