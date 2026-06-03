import "server-only";
import { runTailorStep } from "../run-step";
import { DRAFT_RESUME_SYSTEM } from "../prompts";
import { ResumeDraftSchema } from "../schemas";
import type { TailorStateType } from "../state";

export async function draftResumeNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  if (!state.plan) {
    throw new Error(`[tailor/draft-resume] ${state.jobId}: missing plan`);
  }

  const userContent = [
    `<jd>\n${state.rawMarkdown}\n</jd>`,
    `<plan>\n${JSON.stringify(state.plan)}\n</plan>`,
  ].join("\n\n");

  const draftResume = await runTailorStep({
    functionId: "jobhunt/tailor/draft-resume",
    systemInstructions: DRAFT_RESUME_SYSTEM,
    userContent,
    schema: ResumeDraftSchema,
  });

  console.log(
    `[tailor/draft-resume] ${state.jobId} roles=${draftResume.experience.length} skills=${draftResume.skills.length}`,
  );

  return { draftResume };
}
