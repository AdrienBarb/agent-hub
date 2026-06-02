import "server-only";
import { Annotation } from "@langchain/langgraph";
import { JobStatus } from "@hub/core/prisma";
import type { Requirements, Comparison, Score } from "./schemas";

export const EvaluatorState = Annotation.Root({
  jobId: Annotation<string>,

  rawMarkdown: Annotation<string>,

  requirements: Annotation<Requirements | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  comparison: Annotation<Comparison | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  score: Annotation<Score | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  finalStatus: Annotation<JobStatus | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
});

export type EvaluatorStateType = typeof EvaluatorState.State;
