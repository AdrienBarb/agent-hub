import "server-only";
import { Annotation } from "@langchain/langgraph";
import { JobStatus, type Prisma } from "@hub/core/prisma";
import type { Plan, ResumeDraft, CoverDraft, AtsCheckResult } from "./schemas";
import type { AtsResult } from "../render/ats";

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

  // Bounded counter for the ats-check -> revise -> ats-check loop. Computed from
  // state (state.reviseCount + 1) with a replace-last reducer, so a checkpointer
  // replay recomputes the same value instead of over-counting (an additive
  // reducer would be unsafe under retry — see the CLAUDE.md reducer gotcha).
  reviseCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  finalStatus: Annotation<JobStatus | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  resumePdfPath: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  coverPdfPath: Annotation<string | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  pdfAtsResult: Annotation<AtsResult | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
});

export type TailorStateType = typeof TailorState.State;
