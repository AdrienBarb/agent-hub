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

  // Written ONCE by scoreNode and never mutated afterwards — the immutable
  // pre-critique baseline. Keeping it write-once is what makes the critique
  // reconciliation idempotent under a checkpointer replay.
  score: Annotation<Score | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  // Raw adversarial revision from critiqueNode (undefined when the score was
  // high-confidence and critique was skipped). Stored separately so `score`
  // stays untouched; persist reconciles the two.
  critiqueScore: Annotation<Score | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  // The reconciled score persistNode actually wrote (after the guard). Exposed
  // so the parent graph records the post-critique value, not the raw baseline.
  finalScore: Annotation<Score | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),

  finalStatus: Annotation<JobStatus | undefined>({
    reducer: (_a, b) => b,
    default: () => undefined,
  }),
});

export type EvaluatorStateType = typeof EvaluatorState.State;
