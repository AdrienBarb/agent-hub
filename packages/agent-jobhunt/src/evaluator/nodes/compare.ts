import "server-only";
import { COMPARE_SYSTEM } from "../prompts";
import { runEvaluatorStep } from "../run-step";
import { ComparisonSchema } from "../schemas";
import type { EvaluatorStateType } from "../state";

export async function compareNode(
  state: EvaluatorStateType,
): Promise<Partial<EvaluatorStateType>> {
  if (!state.requirements) {
    throw new Error(`[evaluate/compare] ${state.jobId}: requirements missing`);
  }

  const comparison = await runEvaluatorStep({
    functionId: "jobhunt/evaluate/compare",
    systemInstructions: COMPARE_SYSTEM,
    userContent: `Extracted job requirements:\n\n${JSON.stringify(state.requirements, null, 2)}`,
    schema: ComparisonSchema,
  });

  console.log(
    `[evaluate/compare] ${state.jobId} overlap=${comparison.stackOverlap.length} gaps=${comparison.stackGaps.length} flags=${comparison.redFlags.length}`,
  );

  return { comparison };
}
