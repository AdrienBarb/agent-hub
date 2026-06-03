import "server-only";
import { Annotation } from "@langchain/langgraph";
import { JobStatus } from "@hub/core/prisma";
import type { ParsedJob } from "./boards/types";

export interface ScrapedListing {
  board: string;
  url: string;
  markdown: string;
}

export interface EvaluationResult {
  jobId: string;
  fitScore: number;
  status: JobStatus;
}

export interface TailoringResult {
  jobId: string;
  status: JobStatus | "failed";
}

export const JobHuntState = Annotation.Root({
  runId: Annotation<string>,

  scrapedListings: Annotation<ScrapedListing[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  parsedJobs: Annotation<ParsedJob[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  persistedCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  skippedCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  deepScrapedCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  evaluations: Annotation<EvaluationResult[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  tailorings: Annotation<Record<string, TailoringResult>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
});

export type JobHuntStateType = typeof JobHuntState.State;
