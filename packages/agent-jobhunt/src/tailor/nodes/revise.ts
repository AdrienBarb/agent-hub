import "server-only";
import { runTailorStep } from "../run-step";
import { REVISE_SYSTEM } from "../prompts";
import { ResumeDraftSchema } from "../schemas";
import type { TailorStateType } from "../state";

export async function reviseNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  if (!state.draftResume || !state.atsCheckResult) {
    throw new Error(`[tailor/revise] ${state.jobId}: missing resume or ats result`);
  }

  const userContent = [
    `<resume>\n${JSON.stringify(state.draftResume)}\n</resume>`,
    `<ats-issues>\n${JSON.stringify(state.atsCheckResult.issues)}\n</ats-issues>`,
  ].join("\n\n");

  const revised = await runTailorStep({
    functionId: "jobhunt/tailor/revise",
    systemInstructions: REVISE_SYSTEM,
    userContent,
    schema: ResumeDraftSchema,
  });

  // The back-edge sends this draft straight back to ats-check, which recomputes
  // atsCheckResult and decides whether to loop again — so revise no longer runs
  // its own validation (ats-check is the single source of truth). Bump the
  // bounded loop counter (replace-last reducer, computed from state).
  const pass = (state.reviseCount ?? 0) + 1;
  console.log(
    `[tailor/revise] ${state.jobId} pass=${pass} fixing ${state.atsCheckResult.issues.length} issue(s) — re-checked by ats-check`,
  );

  return { draftResume: revised, reviseCount: pass };
}
