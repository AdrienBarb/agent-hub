import "server-only";
import { Annotation } from "@langchain/langgraph";
import type { ParsedJob } from "./boards/types";

export interface ScrapedListing {
  board: string;
  url: string;
  markdown: string;
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
});

export type JobHuntStateType = typeof JobHuntState.State;
