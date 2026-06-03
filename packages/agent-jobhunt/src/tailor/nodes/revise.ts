import "server-only";
import { runTailorStep } from "../run-step";
import { REVISE_SYSTEM } from "../prompts";
import { ResumeDraftSchema } from "../schemas";
import { runAtsValidation } from "./ats-check";
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

  const postReviseAts = runAtsValidation(revised);

  console.log(
    `[tailor/revise] ${state.jobId} preIssues=${state.atsCheckResult.issues.length} postOk=${postReviseAts.ok} postIssues=${postReviseAts.issues.length}`,
  );

  return { draftResume: revised, atsCheckResult: postReviseAts };
}
