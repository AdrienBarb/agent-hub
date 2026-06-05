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
    userContent: `<requirements>\n${JSON.stringify(state.requirements, null, 2)}\n</requirements>\n\n<comparison>\n${JSON.stringify(state.comparison, null, 2)}\n</comparison>\n\n<score>\n${JSON.stringify(state.score, null, 2)}\n</score>`,
    schema: ScoreSchema,
  });

  const delta = revised.fitScore - state.score.fitScore;
  console.log(
    `[evaluate/critique] ${state.jobId} raw-revised=${revised.fitScore} (delta=${delta >= 0 ? "+" : ""}${delta}) conf=${revised.confidence} — reconciled in persist`,
  );

  // Do NOT overwrite `state.score` — it's the immutable baseline. Persist
  // reconciles this raw revision against it (tiered confidence guard) so a
  // checkpointer replay of this node recomputes identically instead of treating
  // an already-reconciled value as the new "original". See reconcile.ts.
  return { critiqueScore: revised };
}
