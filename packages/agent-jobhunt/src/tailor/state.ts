import "server-only";
import { Annotation } from "@langchain/langgraph";
import { JobStatus, type Prisma } from "@hub/core/prisma";
import type { Plan, ResumeDraft, CoverDraft, AtsCheckResult } from "./schemas";

export const TailorState = Annotation.Root({
  jobId: Annotation<string>,

  rawMarkdown: Annotation<string>,

  fitDetails: Annotation<Prisma.JsonValue>,

  plan: Annotation<Plan | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  draftResume: Annotation<ResumeDraft | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  draftCover: Annotation<CoverDraft | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  atsCheckResult: Annotation<AtsCheckResult | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  finalStatus: Annotation<JobStatus | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
});

export type TailorStateType = typeof TailorState.State;
