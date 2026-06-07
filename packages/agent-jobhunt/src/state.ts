import "server-only";
import { Annotation } from "@langchain/langgraph";
import type { ParsedJob } from "./boards/types";
import { keyOfWarning, type RunWarning } from "./warnings";

export interface ScrapedListing {
  board: string;
  url: string;
  markdown: string;
}

// Idempotent array reducer: merge by a stable key, last-write-wins, preserving
// first-seen insertion order. Unlike `[...a, ...b]`, re-applying the SAME batch
// (an ingest node replayed from a checkpoint) overwrites rather than appends, so
// a resumed ingest run can't double the array. See the CLAUDE.md gotcha on array
// reducers + the checkpointer.
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

  // Structured SOFT-failure sink. Keyed (NOT [...a,...b]) for the same reason as
  // the arrays above: an ingest node replayed from the PostgresSaver checkpoint
  // must overwrite its batch, not append. (Evaluate/tailor warnings are
  // collected per-job by the Inngest orchestrator, not via this channel.)
  warnings: Annotation<RunWarning[]>({
    reducer: keyedArrayReducer(keyOfWarning),
    default: () => [],
  }),
});

export type JobHuntStateType = typeof JobHuntState.State;
