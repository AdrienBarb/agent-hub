import "server-only";
import { CRITIQUE_SYSTEM } from "../prompts";
import { runEvaluatorStep } from "../run-step";
import { ScoreSchema } from "../schemas";
import type { EvaluatorStateType } from "../state";

export async function critiqueNode(
  state: EvaluatorStateType,
): Promise<Partial<EvaluatorStateType>> {
  if (!state.requirements || !state.comparison || !state.score) {
    throw new Error(
      `[evaluate/critique] ${state.jobId}: prior steps incomplete`,
    );
  }

  const revised = await runEvaluatorStep({
    functionId: "jobhunt/evaluate/critique",
    systemInstructions: CRITIQUE_SYSTEM,
    userContent: `Requirements:\n${JSON.stringify(state.requirements, null, 2)}\n\nComparison:\n${JSON.stringify(state.comparison, null, 2)}\n\nOriginal score (to critique):\n${JSON.stringify(state.score, null, 2)}`,
    schema: ScoreSchema,
  });

  const delta = revised.fitScore - state.score.fitScore;
  console.log(
    `[evaluate/critique] ${state.jobId} revised=${revised.fitScore} (delta=${delta >= 0 ? "+" : ""}${delta})`,
  );

  return { score: revised };
}
