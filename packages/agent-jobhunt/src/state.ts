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

// Idempotent array reducer: merge by a stable key, last-write-wins, preserving
// first-seen insertion order. Unlike `[...a, ...b]`, re-applying the SAME batch
// (a fan-out branch replayed from a checkpoint) overwrites rather than appends,
// so a resumed run can't double the array. Mirrors the keyed `tailorings`
// reducer's intent while keeping the external value an array (no consumer
// changes). See the CLAUDE.md gotcha on array reducers + the checkpointer.
function keyedArrayReducer<T>(keyOf: (item: T) => string) {
  return (a: T[], b: T[]): T[] => {
    const merged = new Map<string, T>();
    for (const item of a) merged.set(keyOf(item), item);
    for (const item of b) merged.set(keyOf(item), item);
    return [...merged.values()];
  };
}

export const JobHuntState = Annotation.Root({
  runId: Annotation<string>,

  scrapedListings: Annotation<ScrapedListing[]>({
    // A listing is unique per board + URL (a board can have many listing_urls).
    reducer: keyedArrayReducer((l) => `${l.board}::${l.url}`),
    default: () => [],
  }),

  parsedJobs: Annotation<ParsedJob[]>({
    reducer: keyedArrayReducer((j) => `${j.board}::${j.slug}`),
    default: () => [],
  }),

  persistedCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  deepScrapedCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  evaluations: Annotation<EvaluationResult[]>({
    reducer: keyedArrayReducer((e) => e.jobId),
    default: () => [],
  }),

  tailorings: Annotation<Record<string, TailoringResult>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
});

export type JobHuntStateType = typeof JobHuntState.State;
