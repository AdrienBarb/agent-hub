import "server-only";
import { Annotation } from "@langchain/langgraph";
import type { ParsedJob } from "./boards/types";

export interface RawScrape {
  board: string;
  url: string;
  markdown: string;
}

/**
 * LangGraph state for the job-hunt pipeline.
 *
 * Reducers matter: when iteration 2 fans out parallel scrapers via Send(),
 * each worker returns a slice of state and the reducer merges them. Without
 * a reducer, the last worker's return would overwrite earlier ones.
 */
export const JobHuntState = Annotation.Root({
  runId: Annotation<string>,

  rawScrapes: Annotation<RawScrape[]>({
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
});

export type JobHuntStateType = typeof JobHuntState.State;
