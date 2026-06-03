import "server-only";
import { runTailorStep } from "../run-step";
import { DRAFT_COVER_SYSTEM } from "../prompts";
import { CoverDraftSchema } from "../schemas";
import type { TailorStateType } from "../state";

export async function draftCoverNode(
  state: TailorStateType,
): Promise<Partial<TailorStateType>> {
  if (!state.plan) {
    throw new Error(`[tailor/draft-cover] ${state.jobId}: missing plan`);
  }

  const userContent = [
    `<jd>\n${state.rawMarkdown}\n</jd>`,
    `<plan>\n${JSON.stringify(state.plan)}\n</plan>`,
  ].join("\n\n");

  const draftCover = await runTailorStep({
    functionId: "jobhunt/tailor/draft-cover",
    systemInstructions: DRAFT_COVER_SYSTEM,
    userContent,
    schema: CoverDraftSchema,
  });

  console.log(
    `[tailor/draft-cover] ${state.jobId} length=${draftCover.markdown.length}`,
  );

  return { draftCover };
}
